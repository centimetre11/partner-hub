import { describeCron } from "./cron";
import { partnerScopeLabel, inferDueWithinDays } from "./automation-push";
import type { AutomationBuilderDraft } from "./automation-builder-types";
import { hasAutomationDeliveryChannel } from "./automation-delivery";

export type BuilderDeliveryPrefs = {
  cronExpr: string;
  wecomChatId: string;
  wecomChatLabel?: string;
  email: string;
  wecomAppTo: string;
  partnerId: string;
  partnerName?: string;
};

export function hasExplicitPrefs(prefs: BuilderDeliveryPrefs): boolean {
  return !!(
    prefs.cronExpr?.trim() ||
    prefs.partnerId?.trim() ||
    prefs.wecomChatId?.trim() ||
    prefs.email?.trim() ||
    prefs.wecomAppTo?.trim()
  );
}

/** 仅列出用户手动选过的字段，避免空栏误写「不推送」等推断 */
export function formatBuilderContextPrefix(prefs: BuilderDeliveryPrefs, locale: "zh" | "en"): string {
  const lines: string[] = [];
  if (locale === "zh") {
    lines.push("【用户手动指定的构建偏好 — 覆盖 AI 推断】");
    if (prefs.cronExpr?.trim()) {
      lines.push(`定时：${describeCron(prefs.cronExpr, "zh")}（${prefs.cronExpr}）`);
    }
    if (prefs.partnerId?.trim()) {
      lines.push(`伙伴：${prefs.partnerName || prefs.partnerId}（partnerId=${prefs.partnerId}）`);
    }
    if (prefs.wecomChatId?.trim()) {
      const label = prefs.wecomChatLabel?.trim();
      lines.push(`企微群推送：${label ? `${label} · ` : ""}chatId=${prefs.wecomChatId}`);
    }
    if (prefs.wecomAppTo?.trim()) {
      lines.push(`企微应用私信：${prefs.wecomAppTo}`);
    }
    if (prefs.email?.trim()) {
      lines.push(`邮件推送：${prefs.email}`);
    }
    lines.push("");
    lines.push("用户需求：");
  } else {
    lines.push("[Manual build preferences — override AI inference]");
    if (prefs.cronExpr?.trim()) {
      lines.push(`Schedule: ${describeCron(prefs.cronExpr, "en")} (${prefs.cronExpr})`);
    }
    if (prefs.partnerId?.trim()) {
      lines.push(`Partner: ${prefs.partnerName || prefs.partnerId} (partnerId=${prefs.partnerId})`);
    }
    if (prefs.wecomChatId?.trim()) {
      const label = prefs.wecomChatLabel?.trim();
      lines.push(`WeCom group push: ${label ? `${label} · ` : ""}chatId=${prefs.wecomChatId}`);
    }
    if (prefs.wecomAppTo?.trim()) {
      lines.push(`WeCom app message: ${prefs.wecomAppTo}`);
    }
    if (prefs.email?.trim()) {
      lines.push(`Email push: ${prefs.email}`);
    }
    lines.push("");
    lines.push("User request:");
  }
  return lines.join("\n");
}

export function wrapBuilderUserMessage(
  text: string,
  prefs: BuilderDeliveryPrefs,
  locale: "zh" | "en"
): string {
  const body = text.trim();
  if (!hasExplicitPrefs(prefs)) return body;
  return `${formatBuilderContextPrefix(prefs, locale)}${body}`;
}

export function prefsToAutomationDraftFields(prefs: BuilderDeliveryPrefs) {
  return {
    cronExpr: prefs.cronExpr,
    partnerId: prefs.partnerId,
    wecomPushChatId: prefs.wecomChatId,
    pushEmailTo: prefs.email,
    pushWecomAppTo: prefs.wecomAppTo,
  };
}

export function mergeAutomationDraftWithPrefs(
  draft: AutomationBuilderDraft,
  prefs: BuilderDeliveryPrefs
): AutomationBuilderDraft {
  const merged = {
    ...draft,
    cronExpr: prefs.cronExpr || draft.cronExpr,
    partnerId: prefs.partnerId || draft.partnerId,
    wecomPushChatId: prefs.wecomChatId || draft.wecomPushChatId,
    pushEmailTo: prefs.email || draft.pushEmailTo,
    pushWecomAppTo: prefs.wecomAppTo || draft.pushWecomAppTo,
  };
  // 从描述推断待办到期天数（若 AI 未写入 draft.dueWithinDays）
  if (!merged.dueWithinDays && merged.description) {
    const inferred = inferDueWithinDays(merged.description, undefined);
    if (inferred) merged.dueWithinDays = inferred;
  }
  return merged;
}

/** Required: cron + task goal + at least one push channel. Partner optional. */
export function isAutomationDraftReady(
  draft: Pick<
    AutomationBuilderDraft,
    "cronExpr" | "description" | "taskMd" | "wecomPushChatId" | "pushEmailTo" | "pushWecomAppTo"
  >
): boolean {
  if (!draft.cronExpr?.trim()) return false;
  if (!draft.description?.trim() && !draft.taskMd?.trim()) return false;
  if (!hasAutomationDeliveryChannel(draft)) return false;
  return true;
}

export function partnerLabelFromPrefs(prefs: BuilderDeliveryPrefs, locale: "zh" | "en"): string {
  if (prefs.partnerId) return prefs.partnerName?.trim() || prefs.partnerId;
  return partnerScopeLabel(undefined, locale);
}

export function pushChannelsLabel(
  draft: Pick<AutomationBuilderDraft, "wecomPushChatId" | "pushEmailTo" | "pushWecomAppTo">,
  locale: "zh" | "en"
): string {
  const parts: string[] = [];
  if (draft.wecomPushChatId?.trim()) parts.push(locale === "zh" ? "企微群" : "WeCom group");
  if (draft.pushWecomAppTo?.trim()) parts.push(locale === "zh" ? "企微应用" : "WeCom app");
  if (draft.pushEmailTo?.trim()) parts.push(locale === "zh" ? "邮件" : "Email");
  return parts.length ? parts.join(locale === "zh" ? " + " : " + ") : "—";
}
