import { AIError, chatCompletion, isAiConfigured, parseJsonLoose } from "./ai";
import type { IntakeScope } from "./ai-locale";
import type { IntakeMessage } from "./ai-intake";
import { stripIntakeSystemHint } from "./intake-text";
import { isAgentBuilderIntent } from "./agent-builder-intent";
import type { Locale } from "./i18n/locale";

const VALID_SCOPES = new Set<IntakeScope>([
  "todo",
  "powermap",
  "opportunity",
  "business_record",
  "profile",
  "training",
  "solution",
  "new_partner",
]);

export type ScopeClassification = {
  scope: IntakeScope;
  confidence: "high" | "medium" | "low";
  reason?: string;
};

function scopeGuide(locale: Locale): string {
  if (locale === "zh") {
    return `scope 含义（只输出其中一个 key）：
- todo：创建/添加待办、跟进任务、提醒事项（含「帮加个待办」「事项是…」等续写；句中的「看看 poc / 了解进展」是待办内容里的跟进动作，不是查待办列表）
- powermap：添加/更新联系人、权力地图、名片
- opportunity：添加/更新商机
- business_record：商务记录、拜访、会议纪要、跟进记录
- profile：补全已有伙伴档案字段（行业、阶段、简介等），不是待办
- training：培训计划、认证计划
- solution：联合方案
- new_partner：新建伙伴、建档、onboard 全新公司（无已有伙伴上下文时）`;
  }
  return `Scope meanings (output exactly one key):
- todo: create todos, follow-up tasks, reminders (including follow-up lines like "the item is …")
- powermap: add/update contacts, power map
- opportunity: add/update sales opportunities
- business_record: visit logs, meeting notes, CRM traces
- profile: enrich existing partner profile fields — NOT todos
- training: training/certification plans
- solution: joint solutions
- new_partner: onboard a brand-new partner company`;
}

function formatConversation(messages: IntakeMessage[]): string {
  return messages
    .map((m) => {
      const content = m.role === "user" ? stripIntakeSystemHint(m.content) : m.content.trim();
      if (!content) return "";
      return `${m.role === "user" ? "User" : "Assistant"}: ${content}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function buildClassifierSystem(locale: Locale): string {
  const lang = locale === "zh" ? "Chinese" : "English";
  return `You classify Partner Hub intake intent for a collaborative data-entry assistant.
Reply in ${lang} only inside the JSON "reason" field.

${scopeGuide(locale)}

Rules:
1. Use the FULL conversation, not only the last line. Follow-up answers (e.g. "事项是：…", "due next Friday") continue the same scope as the prior turn unless the user clearly starts a new task.
2. When a WeCom group is bound to a partner, prefer todo/powermap/opportunity/business_record/profile over new_partner unless the user explicitly onboard a new company.
3. "帮加个待办" / "add a todo" / "the item is …" after a todo request → todo, NOT profile.
4. Do NOT choose profile just because a partner is bound; profile is only for enriching partner fields (tier, industry, website, etc.).
5. List/query todos ("有哪些待办") is out of scope here — if the user only asks to list todos with no create intent, still pick todo only when they want to create/log one.
6. 「看看/了解/跟进 X」紧跟在建待办语句中（如「建个待办…并且看看 poc」）→ todo；只有「看看待办 / 有哪些待办」才是查列表，不是 todo 创建。

Output exactly one JSON object:
{"scope":"todo|powermap|opportunity|business_record|profile|training|solution|new_partner","confidence":"high|medium|low","reason":"one short sentence"}`;
}

function normalizeScope(raw: unknown): IntakeScope | null {
  const s = String(raw ?? "").trim() as IntakeScope;
  return VALID_SCOPES.has(s) ? s : null;
}

function normalizeConfidence(raw: unknown): ScopeClassification["confidence"] {
  const c = String(raw ?? "").trim().toLowerCase();
  if (c === "high" || c === "medium" || c === "low") return c;
  return "medium";
}

async function classifyIntakeScopeWithAi(opts: {
  messages: IntakeMessage[];
  partnerId?: string;
  partnerName?: string;
  userId?: string;
  locale: Locale;
  previousScope?: IntakeScope;
}): Promise<ScopeClassification | null> {
  if (!(await isAiConfigured())) return null;

  const conversation = formatConversation(opts.messages);
  if (!conversation.trim()) return null;

  const contextLines: string[] = [];
  if (opts.partnerId) {
    contextLines.push(
      opts.partnerName
        ? `WeCom group / page is bound to existing partner: ${opts.partnerName} (partnerId=${opts.partnerId}).`
        : `WeCom group / page is bound to existing partner (partnerId=${opts.partnerId}).`
    );
  }
  if (opts.previousScope) {
    contextLines.push(`Previous turn scope was "${opts.previousScope}". Keep it unless the user clearly switched task.`);
  }

  const userBlock = [contextLines.length ? `[Context]\n${contextLines.join("\n")}` : "", `[Conversation]\n${conversation}`]
    .filter(Boolean)
    .join("\n\n");

  try {
    const { content } = await chatCompletion(
      [
        { role: "system", content: buildClassifierSystem(opts.locale) },
        { role: "user", content: userBlock },
      ],
      {
        jsonMode: true,
        feature: "Intake scope classifier",
        userId: opts.userId,
        taskTier: "fast",
        temperature: 0.1,
      }
    );
    const raw = parseJsonLoose<{ scope?: unknown; confidence?: unknown; reason?: unknown }>(content ?? "");
    const scope = normalizeScope(raw.scope);
    if (!scope) return null;
    return {
      scope,
      confidence: normalizeConfidence(raw.confidence),
      reason: typeof raw.reason === "string" ? raw.reason.trim() : undefined,
    };
  } catch (e) {
    const msg = e instanceof AIError ? e.message : e instanceof Error ? e.message : String(e);
    console.warn(`[intake-scope] AI classification failed, using heuristic: ${msg}`);
    return null;
  }
}

/** Rule-based fallback when AI is unavailable or returns invalid scope. */
export function detectProposeScopeHeuristic(
  messages: IntakeMessage[],
  partnerId?: string,
  previousScope?: IntakeScope
): IntakeScope {
  const lastRaw = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const last = stripIntakeSystemHint(lastRaw);
  if (isAgentBuilderIntent(lastRaw)) return "new_partner";

  if (previousScope && isLikelyClarificationReply(last)) {
    return previousScope;
  }

  const text = messages
    .filter((m) => m.role === "user")
    .map((m) => stripIntakeSystemHint(m.content))
    .join("\n");

  if (
    /商务记录|拜访记录|会议纪要|跟进记录|见面|记录拜访|记录会议|记.{0,4}商务|拜访|business record|meeting log|visit log|log.{0,6}visit/i.test(
      text
    )
  ) {
    return "business_record";
  }
  if (
    /记.{0,4}待办|创建待办|加.{0,2}待办|帮.{0,8}待办|添加待办|^待办[：:，,\s]|待办[：:，,]|^事项[是：:]|create todo|add todo|log todo/i.test(
      text
    )
  ) {
    return "todo";
  }
  if (/商机|添加商机|新建商机|opportunity|pipeline/i.test(text)) return "opportunity";
  if (/联系人|权力地图|加联系人|添加联系人|新联系人|contact|power map|名片|CTO|CEO/i.test(text)) {
    return "powermap";
  }
  if (/培训|认证|FCA|training plan/i.test(text)) return "training";
  if (/联合方案|solution/i.test(text)) return "solution";
  if (/建档|补全|画像|profile|onboard|kms/i.test(text)) return partnerId ? "profile" : "new_partner";

  if (previousScope) return previousScope;
  return partnerId ? "profile" : "new_partner";
}

function isLikelyClarificationReply(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^(确认|取消|仅crm|仅CRM)/i.test(t)) return false;
  if (/^(todo|待办|联系人|商机|商务记录|画像|建档|培训|方案|contact|opportunity|profile)/i.test(t)) return false;
  return true;
}

/** AI scope classification with heuristic fallback. */
export async function resolveProposeScope(opts: {
  messages: IntakeMessage[];
  partnerId?: string;
  partnerName?: string;
  userId?: string;
  locale: Locale;
  previousScope?: IntakeScope;
  /** Explicit scope from UI — skips AI. */
  forcedScope?: IntakeScope;
}): Promise<IntakeScope> {
  if (opts.forcedScope) return opts.forcedScope;

  const ai = await classifyIntakeScopeWithAi(opts);
  if (ai) {
    console.log(
      `[intake-scope] AI → ${ai.scope} (${ai.confidence})${ai.reason ? `: ${ai.reason}` : ""}`
    );
    return ai.scope;
  }

  const heuristic = detectProposeScopeHeuristic(opts.messages, opts.partnerId, opts.previousScope);
  console.log(`[intake-scope] heuristic → ${heuristic}`);
  return heuristic;
}

/** @deprecated Use resolveProposeScope (async) or detectProposeScopeHeuristic. */
export function detectProposeScope(messages: IntakeMessage[], partnerId?: string): IntakeScope {
  return detectProposeScopeHeuristic(messages, partnerId);
}
