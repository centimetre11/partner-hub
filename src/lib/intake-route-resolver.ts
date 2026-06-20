import { chatCompletion, isAiConfigured, parseJsonLoose } from "./ai";
import type { IntakeScope } from "./ai-locale";
import type { IntakeMessage } from "./ai-intake";
import { stripIntakeSystemHint } from "./intake-text";
import { isAgentBuilderIntent } from "./agent-builder-intent";
import type { Locale } from "./i18n/locale";
import {
  focusIsFresh,
  isModificationPhrase,
  patchActionIdForKind,
  type FocusEntity,
} from "./focus-entity";
import {
  actionCatalogForAi,
  actionExamplesForAi,
  BUILTIN_ACTIONS,
  builtinActionById,
  normalizeActionText,
  scoreBuiltinActions,
  topBuiltinAction,
  type BuiltinActionDef,
  type BuiltinActionRoute,
} from "./intake-action-registry";

export type ResolvedAssistantRoute = {
  actionId: string;
  route: BuiltinActionRoute;
  confidence: "high" | "medium" | "low";
  source: "ai" | "heuristic" | "forced" | "continuity";
  reason?: string;
};

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

function conversationText(messages: IntakeMessage[]): string {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => normalizeActionText(m.content))
    .join("\n");
}

function buildClassifierSystem(locale: Locale): string {
  const lang = locale === "zh" ? "Chinese" : "English";
  const catalog = actionCatalogForAi(locale === "zh" ? "zh" : "en");
  const examples = actionExamplesForAi(locale === "zh" ? "zh" : "en");
  return `You pick the single best builtin action for a Partner Hub assistant message.
Reply in ${lang} only inside the JSON "reason" field.

Builtin actions (pick exactly one actionId):
${catalog}

${examples}

Rules:
1. Prefer the action that best matches the user's primary goal across the FULL conversation.
2. Follow-up lines without a new action verb continue the previous action unless the user clearly switches task.
3. When a WeCom group is bound to a partner, prefer intake.* over intake.new_partner unless onboarding a new company.
4. Do NOT default to intake.profile just because a partner exists.
5. Count/list questions (多少/有哪些/how many + 待办) → query.list_todos, NOT intake.todo.
6. Create/log verbs (建/加/记/创建 + 待办) → intake.todo; follow-up verbs inside the task (看看 poc) stay intake.todo.
7. After listing an entity, field changes (改成/更新/责任人/阶段/金额) → patch.* for that entity, NOT intake.create.

Output exactly one JSON object:
{"actionId":"<id from catalog>","confidence":"high|medium|low","reason":"one short sentence"}`;
}

function normalizeConfidence(raw: unknown): ResolvedAssistantRoute["confidence"] {
  const c = String(raw ?? "").trim().toLowerCase();
  if (c === "high" || c === "medium" || c === "low") return c;
  return "medium";
}

async function classifyActionWithAi(opts: {
  messages: IntakeMessage[];
  partnerId?: string;
  partnerName?: string;
  userId?: string;
  locale: Locale;
  previousActionId?: string;
}): Promise<ResolvedAssistantRoute | null> {
  if (!(await isAiConfigured())) return null;

  const conversation = formatConversation(opts.messages);
  if (!conversation.trim()) return null;

  const contextLines: string[] = [];
  if (opts.partnerId) {
    contextLines.push(
      opts.partnerName
        ? `Bound partner: ${opts.partnerName} (partnerId=${opts.partnerId})`
        : `Bound partner (partnerId=${opts.partnerId})`
    );
  }
  if (opts.previousActionId) {
    contextLines.push(
      `Previous action was "${opts.previousActionId}". Keep it unless the user clearly switched task.`
    );
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
        feature: "Intake action classifier",
        userId: opts.userId,
        taskTier: "fast",
        temperature: 0.1,
      }
    );
    const raw = parseJsonLoose<{ actionId?: unknown; confidence?: unknown; reason?: unknown }>(content ?? "");
    const action = builtinActionById(String(raw.actionId ?? "").trim());
    if (!action) return null;
    return {
      actionId: action.id,
      route: action.route,
      confidence: normalizeConfidence(raw.confidence),
      source: "ai",
      reason: typeof raw.reason === "string" ? raw.reason.trim() : undefined,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[intake-route] AI classification failed: ${msg}`);
    return null;
  }
}

function isLikelyClarificationReply(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^(确认|取消|仅crm|仅CRM)/i.test(t)) return false;
  if (/^(todo|待办|联系人|商机|商务记录|画像|建档|培训|方案|contact|opportunity|profile)/i.test(t)) return false;
  return true;
}

function heuristicRoute(
  messages: IntakeMessage[],
  partnerId?: string,
  previousActionId?: string
): ResolvedAssistantRoute {
  const lastRaw = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const last = stripIntakeSystemHint(lastRaw);

  if (isAgentBuilderIntent(lastRaw)) {
    const action = BUILTIN_ACTIONS.find((a) => a.route.mode === "agent_builder");
    return {
      actionId: action?.id ?? "agent.builder",
      route: { mode: "agent_builder" },
      confidence: "medium",
      source: "heuristic",
    };
  }

  if (previousActionId && isLikelyClarificationReply(last)) {
    const prev = builtinActionById(previousActionId);
    if (prev) {
      return {
        actionId: prev.id,
        route: prev.route,
        confidence: "medium",
        source: "continuity",
      };
    }
  }

  const text = conversationText(messages);
  const top = topBuiltinAction(text);
  if (top) {
    return {
      actionId: top.action.id,
      route: top.action.route,
      confidence: "medium",
      source: "heuristic",
    };
  }

  const profile = builtinActionById("intake.profile")!;
  const fallback: BuiltinActionDef = partnerId ? profile : builtinActionById("intake.new_partner")!;
  return {
    actionId: fallback.id,
    route: fallback.route,
    confidence: "low",
    source: "heuristic",
    reason: partnerId ? "bound partner default" : "no action matched",
  };
}

/** Map prior propose scope to action id for continuity hints */
export function actionIdFromScope(scope: IntakeScope): string {
  return `intake.${scope}`;
}

export async function resolveAssistantRoute(opts: {
  messages: IntakeMessage[];
  partnerId?: string;
  partnerName?: string;
  userId?: string;
  locale: Locale;
  previousScope?: IntakeScope;
  forcedScope?: IntakeScope;
  focus?: FocusEntity | null;
}): Promise<ResolvedAssistantRoute> {
  if (opts.forcedScope) {
    const id = actionIdFromScope(opts.forcedScope);
    const action = builtinActionById(id);
    return {
      actionId: id,
      route: action?.route ?? { mode: "propose", scope: opts.forcedScope },
      confidence: "high",
      source: "forced",
    };
  }

  const lastRaw = [...opts.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  if (opts.focus && focusIsFresh(opts.focus) && isModificationPhrase(lastRaw)) {
    const actionId = patchActionIdForKind(opts.focus.kind);
    const action = builtinActionById(actionId);
    if (action) {
      console.log(`[intake-route] focus → ${actionId} (${opts.focus.label})`);
      return {
        actionId,
        route: action.route,
        confidence: "high",
        source: "forced",
        reason: "focus + modification phrase",
      };
    }
  }

  const previousActionId = opts.previousScope ? actionIdFromScope(opts.previousScope) : undefined;
  const ai = await classifyActionWithAi({ ...opts, previousActionId });
  if (ai) {
    console.log(`[intake-route] AI → ${ai.actionId} (${ai.confidence})${ai.reason ? `: ${ai.reason}` : ""}`);
    return ai;
  }

  const h = heuristicRoute(opts.messages, opts.partnerId, previousActionId);
  console.log(`[intake-route] heuristic → ${h.actionId}${h.reason ? `: ${h.reason}` : ""}`);
  return h;
}

export async function resolveProposeScope(opts: {
  messages: IntakeMessage[];
  partnerId?: string;
  partnerName?: string;
  userId?: string;
  locale: Locale;
  previousScope?: IntakeScope;
  forcedScope?: IntakeScope;
}): Promise<IntakeScope> {
  const route = await resolveAssistantRoute(opts);
  if (route.route.mode === "propose") return route.route.scope;
  const top = topBuiltinAction(conversationText(opts.messages));
  if (top?.action.route.mode === "propose") return top.action.route.scope;
  return opts.previousScope ?? (opts.partnerId ? "profile" : "new_partner");
}

export function detectProposeScopeHeuristic(
  messages: IntakeMessage[],
  partnerId?: string,
  previousScope?: IntakeScope
): IntakeScope {
  const previousActionId = previousScope ? actionIdFromScope(previousScope) : undefined;
  const route = heuristicRoute(messages, partnerId, previousActionId);
  if (route.route.mode === "propose") return route.route.scope;
  return partnerId ? "profile" : "new_partner";
}

export function detectProposeScope(messages: IntakeMessage[], partnerId?: string): IntakeScope {
  return detectProposeScopeHeuristic(messages, partnerId);
}

/** Debug: ranked heuristic scores for a message */
export function debugActionScores(text: string) {
  return scoreBuiltinActions(text);
}
