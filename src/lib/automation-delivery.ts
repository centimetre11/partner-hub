/** 企微应用私信：向待办负责人分别推送（运行时按负责人解析） */
export const PUSH_WECOM_APP_ASSIGNEES = "@assignees";

/** 勾选「企微应用」推送渠道时的存储值（不配置具体收件人，由任务/Agent 按上下文发送） */
export const PUSH_WECOM_APP_ENABLED = "1";

export function isWecomAppPushEnabled(value?: string | null): boolean {
  return !!value?.trim();
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
