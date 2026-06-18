import { chatCompletion, safeParseJsonLoose } from "./ai";
import { PARTNER_FIELD_LABELS } from "./constants";
import type { IntakeScope } from "./ai-intake";
import type { ProposalPatchOp } from "./ai-trace";
import { contactKey, fieldKey } from "./proposal-merge";
import { buildPatchExtractPrompt, fieldLabel, partnerFieldLabels } from "./ai-locale";
import type { Locale } from "./i18n/locale";

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

/** Tool returns meaning "not found / not configured / error" — must not become company name or summary */
const NO_RESULT_RE =
  /(未找到|没有找到|无结果|未查到|查不到|无相关|未配置|未授权|无权限|没有权限|失败|错误|超时|not\s*found|no\s*result|no\s*results|not\s*configured|unauthorized|error|failed|empty)/i;

function isMeaningless(text: string | undefined): boolean {
  if (!text) return true;
  const t = text.trim();
  if (t.length < 2) return true;
  return NO_RESULT_RE.test(t);
}

function heuristicPatch(toolName: string, result: string, locale: Locale): ProposalPatchOp[] {
  const ops: ProposalPatchOp[] = [];
  const labels = partnerFieldLabels(locale);
  // If entire return is a "not found" style message, skip — no patches
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
    const field = Object.entries(labels).find(([code, l]) => l === label || label.includes(l) || code === label)?.[0];
    if (field && field in PARTNER_FIELD_LABELS && value.length < 500) {
      ops.push({
        op: "upsert_field",
        key: fieldKey(field),
        field,
        label: fieldLabel(locale, field),
        newValue: value,
        source: toolName,
        reason: `extracted from ${toolName}`,
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
        contact: { action: "add", name: person, reason: `extracted from ${toolName}` },
      });
    }
  }

  return ops;
}

export async function extractPatchFromTool(
  toolName: string,
  result: string,
  scope: IntakeScope,
  locale: Locale,
  userId?: string
): Promise<ProposalPatchOp[]> {
  const name = toolName === "$web_search" ? "web_search" : toolName;
  if (!PATCH_TOOLS.has(name) && !PATCH_TOOLS.has(toolName)) return [];
  if (!result.trim()) return [];
  // Skip short "not found / not configured" returns to avoid wasted LLM calls and noise patches
  if (isMeaningless(result) && result.trim().length < 120) return [];

  const snippet = result.slice(0, 3500);

  try {
    const { content } = await chatCompletion(
      [
        {
          role: "system",
          content: buildPatchExtractPrompt(scope, locale),
        },
        { role: "user", content: `Tool: ${name}\nOutput:\n${snippet}` },
      ],
      { jsonMode: true, temperature: 0, feature: `Incremental extract·${name}`, userId }
    );
    const parsed = safeParseJsonLoose<{ ops?: ProposalPatchOp[] }>(content ?? "");
    if (parsed && Array.isArray(parsed.ops) && parsed.ops.length) {
      return parsed.ops.map((op) => {
        if (op.op === "upsert_field" && op.field) {
          return { ...op, label: fieldLabel(locale, op.field) || op.label };
        }
        return op;
      });
    }
  } catch {
    /* fallback */
  }
  return heuristicPatch(name, result, locale);
}
