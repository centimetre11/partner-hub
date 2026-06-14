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

/** 工具返回里表示「没查到 / 未配置 / 出错」的无意义文本，绝不能当公司名或摘要 */
const NO_RESULT_RE =
  /(未找到|没有找到|无结果|未查到|查不到|无相关|未配置|未授权|无权限|没有权限|失败|错误|超时|not\s*found|no\s*result|no\s*results|not\s*configured|unauthorized|error|failed|empty)/i;

function isMeaningless(text: string | undefined): boolean {
  if (!text) return true;
  const t = text.trim();
  if (t.length < 2) return true;
  return NO_RESULT_RE.test(t);
}

function heuristicPatch(toolName: string, result: string): ProposalPatchOp[] {
  const ops: ProposalPatchOp[] = [];
  // 整段返回若是「未找到」类提示，直接放弃，不产生任何 patch
  if (isMeaningless(result) && result.trim().length < 120) return ops;

  const lines = result.split("\n").map((l) => l.trim()).filter(Boolean);
  const first = lines[0]?.replace(/^#+\s*/, "").replace(/\*+/g, "").trim();

  if (
    (toolName === "read_kms" || toolName === "search_knowledge") &&
    first &&
    first.length < 100 &&
    !isMeaningless(first)
  ) {
    ops.push({ op: "set_partner", name: first, source: toolName });
    const summary = lines.slice(1, 3).join(" ").slice(0, 200);
    if (summary && !isMeaningless(summary)) {
      ops.push({ op: "set_summary", summary });
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
  // 「未找到 / 未配置」类短返回直接跳过，避免浪费 LLM 调用并产生噪声 patch
  if (isMeaningless(result) && result.trim().length < 120) return [];

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
