/** 企微应用私信：向待办负责人分别推送 */
export const PUSH_WECOM_APP_ASSIGNEES = "@assignees";

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
