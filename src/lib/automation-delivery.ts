/** 企微应用私信：向待办负责人分别推送（运行时按负责人解析） */
export const PUSH_WECOM_APP_ASSIGNEES = "@assignees";

/** 推送给自动化创建者 */
export const PUSH_WECOM_APP_ENABLED = "1";

export type WecomAppRecipientMode = "creator" | "assignees" | "user";

export function isWecomAppPushEnabled(value?: string | null): boolean {
  return !!value?.trim();
}

export function parseWecomAppRecipient(raw?: string | null): {
  enabled: boolean;
  mode: WecomAppRecipientMode;
  hubUserId: string;
} {
  const v = raw?.trim() ?? "";
  if (!v) return { enabled: false, mode: "creator", hubUserId: "" };
  if (v === PUSH_WECOM_APP_ASSIGNEES) return { enabled: true, mode: "assignees", hubUserId: "" };
  if (v === PUSH_WECOM_APP_ENABLED) return { enabled: true, mode: "creator", hubUserId: "" };
  return { enabled: true, mode: "user", hubUserId: v };
}

export function serializeWecomAppRecipient(input: {
  enabled: boolean;
  mode: WecomAppRecipientMode;
  hubUserId?: string;
}): string {
  if (!input.enabled) return "";
  if (input.mode === "assignees") return PUSH_WECOM_APP_ASSIGNEES;
  if (input.mode === "user") return input.hubUserId?.trim() ?? "";
  return PUSH_WECOM_APP_ENABLED;
}

/** 人类可读：企微应用收件人（预览/推送渠道摘要） */
export function wecomAppRecipientLabel(
  raw: string | null | undefined,
  ctx: { locale: "zh" | "en"; userName?: string }
): string | null {
  const parsed = parseWecomAppRecipient(raw);
  if (!parsed.enabled) return null;
  const zh = ctx.locale === "zh";
  if (parsed.mode === "assignees") return zh ? "按负责人" : "Per assignee";
  if (parsed.mode === "user") {
    const who = ctx.userName?.trim() || parsed.hubUserId;
    return zh ? `指定：${who}` : `User: ${who}`;
  }
  return zh ? "创建者" : "Creator";
}

export function hasAutomationDeliveryChannel(input: {
  wecomPushChatId?: string | null;
  pushEmailTo?: string | null;
  pushWecomAppTo?: string | null;
}): boolean {
  return !!(
    input.wecomPushChatId?.trim() ||
    input.pushEmailTo?.trim() ||
    input.pushWecomAppTo?.trim()
  );
}

/** 「推给我 / 推给本人」 */
export function mentionsPushToSelf(...texts: (string | null | undefined)[]): boolean {
  const blob = texts.filter(Boolean).join("\n");
  return /推给我|推给.*本人|推送到.*我|发给我|推送?给.*我\b|to me\b/i.test(blob);
}

/** 「按负责人 / 推给负责人」分别推送 */
export function mentionsPushToAssignees(...texts: (string | null | undefined)[]): boolean {
  const blob = texts.filter(Boolean).join("\n");
  return /推给.*负责人|按负责人|每位负责人|分别推|per assignee|to assignees/i.test(blob);
}
