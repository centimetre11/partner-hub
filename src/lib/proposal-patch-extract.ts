import { chatCompletion, parseJsonLoose } from "./ai";
import { PARTNER_FIELD_LABELS } from "./constants";
import type { IntakeScope } from "./ai-intake";
import type { ProposalPatchOp } from "./ai-trace";
import { contactKey, fieldKey } from "./proposal-merge";

const PATCH_TOOLS = new Set([
  "read_kms",
  "search_knowledge",
  "web_search",
  "$web_search",
  "linkedin_search",
  "get_partner",
  "list_partners",
  "search_partners",
]);

function heuristicPatch(toolName: string, result: string): ProposalPatchOp[] {
  const ops: ProposalPatchOp[] = [];
  const lines = result.split("\n").map((l) => l.trim()).filter(Boolean);
  const first = lines[0]?.replace(/^#+\s*/, "").replace(/\*+/g, "").trim();

  if ((toolName === "read_kms" || toolName === "search_knowledge") && first && first.length < 100) {
    ops.push({ op: "set_partner", name: first, source: toolName });
    if (lines.length > 1) {
      ops.push({ op: "set_summary", summary: lines.slice(1, 3).join(" ").slice(0, 200) });
    }
  }

  const kvRe = /^([^:：]{2,20})[:：]\s*(.+)$/;
  for (const line of lines.slice(0, 30)) {
    const m = line.match(kvRe);
    if (!m) continue;
    const label = m[1].trim();
    const value = m[2].trim();
    const field = Object.entries(PARTNER_FIELD_LABELS).find(([, l]) => l === label || label.includes(l))?.[0];
    if (field && value.length < 500) {
      ops.push({
        op: "upsert_field",
        key: fieldKey(field),
        field,
        label: PARTNER_FIELD_LABELS[field as keyof typeof PARTNER_FIELD_LABELS],
        newValue: value,
        source: toolName,
        reason: `${toolName} 提取`,
      });
    }
  }

  if (toolName === "linkedin_search" || toolName === "web_search" || toolName === "$web_search") {
    const nameMatch = result.match(/(?:CEO|CTO|Founder|创始人|总经理)[：:\s]+([A-Za-z\u4e00-\u9fa5][^\n,，]{1,40})/i);
    if (nameMatch) {
      const person = nameMatch[1].trim();
      ops.push({
        op: "upsert_contact",
        key: contactKey(person),
        contact: { action: "add", name: person, reason: `${toolName} 提取` },
      });
    }
  }

  return ops;
}

export async function extractPatchFromTool(
  toolName: string,
  result: string,
  scope: IntakeScope,
  userId?: string
): Promise<ProposalPatchOp[]> {
  const name = toolName === "$web_search" ? "web_search" : toolName;
  if (!PATCH_TOOLS.has(name) && !PATCH_TOOLS.has(toolName)) return [];
  if (!result.trim()) return [];

  const snippet = result.slice(0, 3500);
  const fieldList = Object.entries(PARTNER_FIELD_LABELS)
    .map(([f, l]) => `${f}=${l}`)
    .join("、");

  try {
    const { content } = await chatCompletion(
      [
        {
          role: "system",
          content: `从工具返回中提取可入库的结构化片段。任务范围：${scope}。只输出 JSON：
{ "ops": [
  { "op":"set_partner","name":"公司名","source":"工具名" },
  { "op":"set_summary","summary":"一句话" },
  { "op":"upsert_field","key":"field:country","field":"country","label":"国家","newValue":"阿联酋","reason":"依据" },
  { "op":"upsert_contact","key":"contact:姓名","contact":{"action":"add","name":"姓名","title":"职位","reason":"依据"} }
]}
字段名只能用：${fieldList}。没有可提取内容则 ops 为空数组。不要编造。`,
        },
        { role: "user", content: `工具：${name}\n返回：\n${snippet}` },
      ],
      { jsonMode: true, temperature: 0, feature: `增量抽取·${name}`, userId }
    );
    const parsed = parseJsonLoose<{ ops?: ProposalPatchOp[] }>(content ?? "");
    if (Array.isArray(parsed.ops) && parsed.ops.length) return parsed.ops;
  } catch {
    /* fallback */
  }
  return heuristicPatch(name, result);
}
