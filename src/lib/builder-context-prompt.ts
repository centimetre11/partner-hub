import { describeCron } from "./cron";
import { partnerScopeLabel } from "./automation-push";

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
    lines.push("【构建偏好】");
    lines.push(
      prefs.partnerId
        ? `伙伴：${prefs.partnerName || prefs.partnerId}（partnerId=${prefs.partnerId}）`
        : "范围：全部伙伴"
    );
    if (prefs.cronExpr) lines.push(`定时：${describeCron(prefs.cronExpr, "zh")}（${prefs.cronExpr}）`);
    if (prefs.wecomChatId) {
      const label = prefs.wecomChatLabel?.trim();
      lines.push(`企微推送群：${label ? `${label} · ` : ""}chatId=${prefs.wecomChatId}`);
    }
    if (prefs.email) lines.push(`邮件通知：${prefs.email}`);
    lines.push("");
    lines.push("用户需求：");
  } else {
    lines.push("[Build preferences]");
    lines.push(
      prefs.partnerId
        ? `Partner: ${prefs.partnerName || prefs.partnerId} (partnerId=${prefs.partnerId})`
        : `Scope: ${partnerScopeLabel(undefined, "en")}`
    );
    if (prefs.cronExpr) lines.push(`Schedule: ${describeCron(prefs.cronExpr, "en")} (${prefs.cronExpr})`);
    if (prefs.wecomChatId) {
      const label = prefs.wecomChatLabel?.trim();
      lines.push(`WeCom push: ${label ? `${label} · ` : ""}chatId=${prefs.wecomChatId}`);
    }
    if (prefs.email) lines.push(`Email notify: ${prefs.email}`);
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
  const hasPrefs = prefs.cronExpr || prefs.wecomChatId || prefs.email || prefs.partnerId;
  if (!hasPrefs) return body;
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
