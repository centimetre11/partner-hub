import { describeCron } from "./cron";
import { partnerScopeLabel, inferDueWithinDays } from "./automation-push";
import type { AutomationBuilderDraft } from "./automation-builder-types";

export type BuilderDeliveryPrefs = {
  cronExpr: string;
  wecomChatId: string;
  wecomChatLabel?: string;
  email: string;
  partnerId: string;
  partnerName?: string;
};

export function formatBuilderContextPrefix(prefs: BuilderDeliveryPrefs, locale: "zh" | "en"): string {
  const lines: string[] = [];
  if (locale === "zh") {
    lines.push("【构建偏好 — 以下为准，覆盖默认推断】");
    lines.push(
      prefs.partnerId
        ? `伙伴：${prefs.partnerName || prefs.partnerId}（partnerId=${prefs.partnerId}）`
        : "伙伴：不指定（无伙伴关联，如今日新闻/行业资讯）"
    );
    if (prefs.cronExpr) lines.push(`定时：${describeCron(prefs.cronExpr, "zh")}（${prefs.cronExpr}）`);
    if (prefs.wecomChatId) {
      const label = prefs.wecomChatLabel?.trim();
      lines.push(`企微推送：${label ? `${label} · ` : ""}chatId=${prefs.wecomChatId}`);
    } else {
      lines.push("企微推送：不推送（wecomPushChatId 留空）");
    }
    if (prefs.email) {
      lines.push(`邮件推送：${prefs.email}`);
    } else {
      lines.push("邮件推送：不发送（pushEmailTo 留空）");
    }
    lines.push("");
    lines.push("用户需求：");
  } else {
    lines.push("[Build preferences — authoritative over defaults]");
    lines.push(
      prefs.partnerId
        ? `Partner: ${prefs.partnerName || prefs.partnerId} (partnerId=${prefs.partnerId})`
        : `Partner: none (${partnerScopeLabel(undefined, "en")})`
    );
    if (prefs.cronExpr) lines.push(`Schedule: ${describeCron(prefs.cronExpr, "en")} (${prefs.cronExpr})`);
    if (prefs.wecomChatId) {
      const label = prefs.wecomChatLabel?.trim();
      lines.push(`WeCom push: ${label ? `${label} · ` : ""}chatId=${prefs.wecomChatId}`);
    } else {
      lines.push("WeCom push: none (leave wecomPushChatId empty)");
    }
    if (prefs.email) {
      lines.push(`Email push: ${prefs.email}`);
    } else {
      lines.push("Email push: none (leave pushEmailTo empty)");
    }
    lines.push("");
    lines.push("User request:");
  }
  return lines.join("\n");
}

export function wrapBuilderUserMessage(
  text: string,
  prefs: BuilderDeliveryPrefs,
  locale: "zh" | "en",
  includePrefs: boolean
): string {
  const body = text.trim();
  if (!includePrefs) return body;
  return `${formatBuilderContextPrefix(prefs, locale)}${body}`;
}

export function prefsToAutomationDraftFields(prefs: BuilderDeliveryPrefs) {
  return {
    cronExpr: prefs.cronExpr,
    partnerId: prefs.partnerId,
    wecomPushChatId: prefs.wecomChatId,
    pushEmailTo: prefs.email,
  };
}

export function mergeAutomationDraftWithPrefs(
  draft: AutomationBuilderDraft,
  prefs: BuilderDeliveryPrefs
): AutomationBuilderDraft {
  const merged = {
    ...draft,
    cronExpr: prefs.cronExpr || draft.cronExpr,
    partnerId: prefs.partnerId,
    wecomPushChatId: prefs.wecomChatId,
    pushEmailTo: prefs.email,
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
  draft: Pick<AutomationBuilderDraft, "cronExpr" | "description" | "taskMd" | "wecomPushChatId" | "pushEmailTo">
): boolean {
  if (!draft.cronExpr?.trim()) return false;
  if (!draft.description?.trim() && !draft.taskMd?.trim()) return false;
  if (!draft.wecomPushChatId?.trim() && !draft.pushEmailTo?.trim()) return false;
  return true;
}

export function partnerLabelFromPrefs(prefs: BuilderDeliveryPrefs, locale: "zh" | "en"): string {
  if (prefs.partnerId) return prefs.partnerName?.trim() || prefs.partnerId;
  return partnerScopeLabel(undefined, locale);
}

export function pushChannelsLabel(
  draft: Pick<AutomationBuilderDraft, "wecomPushChatId" | "pushEmailTo">,
  locale: "zh" | "en"
): string {
  const parts: string[] = [];
  if (draft.wecomPushChatId?.trim()) parts.push(locale === "zh" ? "企微" : "WeCom");
  if (draft.pushEmailTo?.trim()) parts.push(locale === "zh" ? "邮件" : "Email");
  return parts.length ? parts.join(locale === "zh" ? " + " : " + ") : "—";
}
