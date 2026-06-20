import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { INBOX_NAV_ENABLED } from "@/lib/feature-flags";
import { Badge, EmptyState, PageHeader, fmtDateTime } from "@/components/ui";
import { applyAgentProposalAction, markAllReadAction, markReadAction } from "@/lib/agent-actions";
import { saveNotificationAsDocumentAction } from "@/lib/content-actions";
import type { AgentFieldProposal } from "@/lib/skills";
import { getServerI18n } from "@/lib/server-i18n";

export default async function InboxPage() {
  if (!INBOX_NAV_ENABLED) redirect("/");
  await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const notifications = await db.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { agentRun: { include: { agent: true } } },
  });
  const partnerIds = [...new Set(notifications.map((n) => n.partnerId).filter(Boolean))] as string[];
  const partners = await db.partner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, name: true } });
  const partnerName = new Map(partners.map((p) => [p.id, p.name]));
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="pb-16">
      <PageHeader
        title={m.inbox.title}
        desc={unread > 0 ? m.inbox.desc.replace("{count}", String(unread)) : m.inbox.desc.replace(/ · \{count\} unread$/, "").replace(/ · \{count\} 未读$/, "")}
        actions={
          unread > 0 ? (
            <form action={markAllReadAction}>
              <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">{m.inbox.markAllRead}</button>
            </form>
          ) : undefined
        }
      />
      <div className="px-8 max-w-4xl space-y-3">
        {notifications.length === 0 && <EmptyState text={m.inbox.empty} />}
        {notifications.map((n) => {
          const proposal: AgentFieldProposal | null = n.proposal ? JSON.parse(n.proposal) : null;
          return (
            <div
              key={n.id}
              className={`bg-white rounded-lg border shadow-sm p-5 ${n.readAt ? "border-slate-200/80 opacity-75" : "border-slate-200"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {!n.readAt && <span className="w-2 h-2 rounded-full bg-slate-500 shrink-0" />}
                    <h3 className="font-semibold text-slate-900 text-sm">{n.title}</h3>
                    {proposal && (
                      <Badge tone={n.appliedAt ? "green" : "amber"}>{n.appliedAt ? m.inbox.applied : m.inbox.pendingProposal}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {fmtDateTime(n.createdAt, bcp47)}
                    {n.partnerId && partnerName.get(n.partnerId) && (
                      <>
                        {" · "}
                        <Link href={`/partners/${n.partnerId}`} className="text-slate-500 hover:underline">
                          {partnerName.get(n.partnerId)}
                        </Link>
                      </>
                    )}
                    {n.agentRun?.agent && (
                      <>
                        {" · "}
                        <Link href={`/agents/${n.agentRun.agentId}`} className="text-slate-400 hover:text-slate-500">
                          {n.agentRun.agent.name}
                        </Link>
                      </>
                    )}
                  </div>
                </div>
                {!n.readAt && (
                  <div className="flex gap-2 shrink-0">
                    {n.content && (
                      <form action={saveNotificationAsDocumentAction.bind(null, n.id)}>
                        <button className="text-xs text-slate-500 hover:text-sky-700">{m.inbox.saveAsReport}</button>
                      </form>
                    )}
                    <form action={markReadAction.bind(null, n.id)}>
                      <button className="text-xs text-slate-400 hover:text-slate-600">{m.inbox.markRead}</button>
                    </form>
                  </div>
                )}
              </div>

              {n.content && (
                <pre className="mt-3 text-sm text-slate-700 whitespace-pre-wrap font-sans bg-slate-50/70 rounded-lg p-3.5 max-h-80 overflow-auto">{n.content}</pre>
              )}

              {proposal && !n.appliedAt && (
                <div className="mt-3 border border-amber-200 bg-amber-50/50 rounded-lg p-3.5">
                  <p className="text-xs font-medium text-amber-800 mb-2">
                    {m.inbox.proposesUpdateFields.replace("{name}", proposal.partnerName)}
                  </p>
                  <div className="space-y-1 mb-3">
                    {proposal.fieldUpdates.map((f, i) => (
                      <div key={i} className="text-xs text-slate-700">
                        <span className="font-medium">{f.label}</span>:
                        <span className="line-through text-slate-400 mx-1">{f.oldValue || m.inbox.emptyField}</span>→
                        <span className="text-emerald-700 font-medium ml-1">{f.newValue}</span>
                      </div>
                    ))}
                  </div>
                  <form action={applyAgentProposalAction.bind(null, n.id)} className="flex gap-2">
                    <button className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs font-medium hover:bg-slate-800">
                      {m.inbox.confirmApply}
                    </button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
