import type { Locale } from "./i18n/locale";
import {
  builtinActionById,
  getAlternativeActions,
  normalizeActionText,
  type BuiltinActionRoute,
} from "./intake-action-registry";
import type { ResolvedAssistantRoute } from "./intake-route-resolver";
import { stripWecomCommandPrefix } from "./wecom-user-resolve";

export type IntentConfirmAlternative = {
  actionId: string;
  label: string;
  index: number;
};

export type IntentConfirmSession = {
  actionId: string;
  route: BuiltinActionRoute;
  alternatives: IntentConfirmAlternative[];
  sourceText: string;
  partnerName?: string;
};

const INTENT_CONFIRM_RE =
  /^(确认意图|确认操作|确认|confirm intent|confirm)$/i;
const INTENT_CANCEL_RE = /^(取消|放弃|不要了|cancel|discard|abort)$/i;

const WECOM_BOT_NAME_PREFIX_RE = /^[\w.\s-]{1,40}$/;

function matchesIntentCommand(text: string, directRe: RegExp, wordsPattern: string): boolean {
  const t = text.trim();
  if (directRe.test(stripWecomCommandPrefix(t))) return true;
  const atMatch = t.match(new RegExp(`^@(.+)\\s+(${wordsPattern})\\s*$`, "i"));
  if (!atMatch) return false;
  return WECOM_BOT_NAME_PREFIX_RE.test(atMatch[1].trim());
}

export function isIntentConfirmCommand(text: string): boolean {
  return matchesIntentCommand(
    text,
    INTENT_CONFIRM_RE,
    "确认意图|确认操作|确认|confirm intent|confirm"
  );
}

export function isIntentCancelCommand(text: string): boolean {
  return matchesIntentCommand(text, INTENT_CANCEL_RE, "取消|放弃|不要了|cancel|discard|abort");
}

/** Pick alternative by @我 1 / @我 查询待办 / label keyword */
export function parseIntentAlternativePick(
  text: string,
  session: IntentConfirmSession
): string | null {
  const body = stripWecomCommandPrefix(text).trim();
  const numMatch = body.match(/^([1-9])$/);
  if (numMatch) {
    const alt = session.alternatives.find((a) => a.index === Number(numMatch[1]));
    return alt?.actionId ?? null;
  }
  const atNum = text.trim().match(/^@(.+)\s+([1-9])\s*$/i);
  if (atNum && WECOM_BOT_NAME_PREFIX_RE.test(atNum[1].trim())) {
    const alt = session.alternatives.find((a) => a.index === Number(atNum[2]));
    return alt?.actionId ?? null;
  }
  for (const alt of session.alternatives) {
    if (body.includes(alt.label) || body.toLowerCase().includes(alt.actionId)) {
      return alt.actionId;
    }
  }
  return null;
}

export function buildIntentConfirmSession(opts: {
  route: ResolvedAssistantRoute;
  sourceText: string;
  locale: Locale;
  partnerName?: string;
}): IntentConfirmSession {
  const action = builtinActionById(opts.route.actionId);
  const alts = getAlternativeActions(opts.sourceText, opts.route.actionId, 3).map((s, i) => ({
    actionId: s.action.id,
    label: opts.locale === "zh" ? s.action.label.zh : s.action.label.en,
    index: i + 1,
  }));
  return {
    actionId: opts.route.actionId,
    route: opts.route.route,
    alternatives: alts,
    sourceText: opts.sourceText,
    partnerName: opts.partnerName,
  };
}

export function formatIntentConfirmReply(session: IntentConfirmSession, locale: Locale): string {
  const action = builtinActionById(session.actionId);
  const label = action
    ? locale === "zh"
      ? action.label.zh
      : action.label.en
    : session.actionId;
  const partnerLine = session.partnerName
    ? locale === "zh"
      ? `（${session.partnerName}）`
      : ` (${session.partnerName})`
    : "";

  if (locale === "zh") {
    const lines = [
      `**【意图确认】**`,
      "",
      `我理解你要：**${label}**${partnerLine}`,
      "",
      "• 回复 @我 **确认** → 继续生成草案",
    ];
    if (session.alternatives.length) {
      lines.push("• 或改选：");
      for (const alt of session.alternatives) {
        lines.push(`  ${alt.index}️⃣ ${alt.label}`);
      }
      lines.push("  （回复 @我 **1** / **2** … 或动作名称）");
    }
    lines.push("• @我 **取消** 放弃");
    return lines.join("\n");
  }

  const lines = [
    `**Intent confirmation**`,
    "",
    `I think you want: **${label}**${partnerLine}`,
    "",
    "• Reply @me **confirm** → continue to draft",
  ];
  if (session.alternatives.length) {
    lines.push("• Or choose:");
    for (const alt of session.alternatives) {
      lines.push(`  ${alt.index}. ${alt.label}`);
    }
  }
  lines.push("• @me **cancel** to abort");
  return lines.join("\n");
}

export function routeFromConfirmedActionId(actionId: string): ResolvedAssistantRoute | null {
  const action = builtinActionById(actionId);
  if (!action) return null;
  return {
    actionId: action.id,
    route: action.route,
    confidence: "high",
    source: "forced",
  };
}

export function needsIntentConfirm(route: ResolvedAssistantRoute): boolean {
  return route.route.mode === "propose";
}

/** Last user line for scoring — excludes intent-confirm command noise */
export function sourceTextForRouting(messages: Array<{ role: string; content: string }>): string {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => normalizeActionText(m.content))
    .filter((t) => t && !INTENT_CONFIRM_RE.test(t) && !INTENT_CANCEL_RE.test(t))
    .join("\n");
}
