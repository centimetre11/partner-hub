/** 应用消息里引导用户去智能机器人 / 移动工作台 AI 的文案与链接 */

export function resolveAppBaseUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
}

export function resolveWecomBotDisplayName(): string {
  return process.env.WECOM_BOT_DISPLAY_NAME?.trim() || "MEA 伙伴助手";
}

/** 引导页：说明如何找到机器人 + 一键打开移动工作台 */
export function wecomBotGuidePageUrl(): string {
  return `${resolveAppBaseUrl()}/wecom/bot`;
}

/** 企微内打开移动工作台（OAuth 后进入 /mobile） */
export function wecomMobileAiOAuthUrl(): string {
  const redirect = encodeURIComponent("/mobile");
  return `${resolveAppBaseUrl()}/api/wecom/oauth/start?redirect=${redirect}`;
}

export const DEFAULT_BOT_GUIDE_BTNTXT = "和 AI 对话";

export function appendWecomBotGuideText(content: string): string {
  const name = resolveWecomBotDisplayName();
  const url = wecomBotGuidePageUrl();
  return `${content.trim()}\n\n💬 查待办、录商务：打开 ${url}\n或在企微搜索智能机器人「${name}」私聊。`;
}

/** textcard description（支持企微 HTML：br / div.gray） */
export function buildBotGuideTextcardDescription(body: string): string {
  const name = resolveWecomBotDisplayName();
  const main = body.trim().replace(/\n/g, "<br/>");
  const tail = `<div class="gray">也可在企微搜索智能机器人「${name}」私聊。</div>`;
  return main ? `${main}<br/>${tail}` : tail;
}
