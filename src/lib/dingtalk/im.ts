import { getDingTalkAccessToken } from "./token";
import { resolveDingTalkConfig, isDingTalkConfigured } from "./config";

/** 向钉钉用户发送工作通知文本（需 agentId） */
export async function pushDingTalkWorkNotice(opts: {
  userIds: string[];
  title: string;
  content: string;
}): Promise<{ ok: boolean; error?: string }> {
  const config = await resolveDingTalkConfig();
  if (!isDingTalkConfigured(config) || !config.agentId) {
    return { ok: false, error: "钉钉未配置 agentId，无法推送工作通知" };
  }
  if (!opts.userIds.length) return { ok: false, error: "无接收人" };

  try {
    const token = await getDingTalkAccessToken();
    const res = await fetch(
      `https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: config.agentId,
          userid_list: opts.userIds.join(","),
          msg: {
            msgtype: "markdown",
            markdown: {
              title: opts.title.slice(0, 64),
              text: `### ${opts.title}\n\n${opts.content.slice(0, 3500)}`,
            },
          },
        }),
        cache: "no-store",
      },
    );
    const data = (await res.json()) as { errcode?: number; errmsg?: string };
    if (data.errcode !== 0) {
      return { ok: false, error: data.errmsg ?? "推送失败" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
