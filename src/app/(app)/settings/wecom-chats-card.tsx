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
      <p className="text-xs text-slate-500 mb-4">
        将机器人拉入群聊后会自动登记。在客户/伙伴详情 → 帆软连接 从下拉选择绑定，或在群内发送
        「@我 绑定客户」/「@我 绑定伙伴」。
      </p>
      {chats.length === 0 ? (
        <EmptyState text="暂无记录。请先将机器人拉入企微群。" />
      ) : (
        <div className="space-y-2">
          {chats.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-slate-100 px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="font-medium text-slate-800">
                  {c.label || "（未命名）"}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {c.chatType === "group" ? "群聊" : "单聊"}
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-500 break-all mt-1">{c.chatId}</div>
                {c.partnerName && (
                  <div className="text-xs text-emerald-600 mt-1">已绑定伙伴：{c.partnerName}</div>
                )}
                {c.customerName && (
                  <div className="text-xs text-emerald-600 mt-1">已绑定客户：{c.customerName}</div>
                )}
                {!c.partnerName && !c.customerName && (
                  <div className="text-xs text-amber-600 mt-1">未绑定</div>
                )}
              </div>
              <div className="text-xs text-slate-400 shrink-0">
                最近活跃 {fmtDateTime(c.lastSeenAt, bcp47)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
