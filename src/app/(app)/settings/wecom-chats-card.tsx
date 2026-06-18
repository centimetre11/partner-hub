import { Card, EmptyState, fmtDateTime } from "@/components/ui";
import { listWecomChats } from "@/lib/wecom-chats";
import { requireSuperAdmin } from "@/lib/session";
import { getServerI18n } from "@/lib/server-i18n";

export async function WecomChatsCard() {
  await requireSuperAdmin();
  const { bcp47 } = await getServerI18n();
  const chats = await listWecomChats();

  return (
    <Card title="企业微信会话" className="lg:col-span-2">
      <p className="text-xs text-zinc-500 mb-4">
        群聊中 @ 机器人后会自动出现在此列表。复制 Chat ID 到伙伴详情页绑定，即可向该群主动推送消息。
      </p>
      {chats.length === 0 ? (
        <EmptyState text="暂无记录。请先在企微群或单聊中 @ 机器人发一条消息。" />
      ) : (
        <div className="space-y-2">
          {chats.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-zinc-100 px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="font-medium text-zinc-800">
                  {c.label || "（未命名）"}
                  <span className="ml-2 text-xs font-normal text-zinc-400">
                    {c.chatType === "group" ? "群聊" : "单聊"}
                  </span>
                </div>
                <div className="text-xs font-mono text-zinc-500 break-all mt-1">{c.chatId}</div>
                {c.partnerName && (
                  <div className="text-xs text-emerald-600 mt-1">已绑定伙伴：{c.partnerName}</div>
                )}
              </div>
              <div className="text-xs text-zinc-400 shrink-0">
                最近活跃 {fmtDateTime(c.lastSeenAt, bcp47)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
