import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, fmtDateTime } from "@/components/ui";
import { cloneAgentAction, toggleAgentAction } from "@/lib/agent-actions";
import { getToolLabel } from "@/lib/tools-registry";
import { AiCenterNav } from "@/components/ai-center-nav";
import { getServerI18n } from "@/lib/server-i18n";

export default async function AgentsPage() {
  const user = await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const [agents, templates] = await Promise.all([
    db.agent.findMany({
      where: { isTemplate: false },
      include: { partner: true, createdBy: true, runs: { orderBy: { startedAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    }),
    db.agent.findMany({ where: { isTemplate: true }, orderBy: { createdAt: "asc" } }),
  ]);

  const mine = agents.filter((a) => a.createdById === user.id);
  const shared = agents.filter((a) => a.createdById !== user.id && a.shared);

  const WEEKDAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const FREQ_LABELS: Record<string, string> = {
    HOURLY: m.agents.hourly,
    DAILY: m.agents.daily,
    WEEKLY: m.agents.weekly,
  };

  function AgentCard({ a }: { a: (typeof agents)[number] }) {
    const skills: string[] = JSON.parse(a.skills || "[]");
    const lastRun = a.runs[0];
    return (
      <div className={`bg-white rounded-xl border shadow-sm p-5 ${a.enabled ? "border-zinc-200/80" : "border-zinc-200/80 opacity-60"}`}>
        <div className="flex items-start justify-between gap-2">
          <Link href={`/agents/${a.id}`} className="flex items-center gap-2.5 min-w-0 group">
            <span className="text-2xl">{a.icon}</span>
            <div className="min-w-0">
              <div className="font-semibold text-zinc-900 group-hover:text-indigo-600 truncate">{a.name}</div>
              <div className="text-xs text-zinc-400 truncate">{a.description ?? "—"}</div>
            </div>
          </Link>
          <form action={toggleAgentAction.bind(null, a.id)}>
            <button
              className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${a.enabled ? "bg-indigo-600" : "bg-zinc-200"}`}
              title={a.enabled ? m.agents.enabledTitle : m.agents.disabledTitle}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${a.enabled ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </form>
        </div>
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <Badge tone={a.trigger === "SCHEDULE" ? "purple" : "zinc"}>
            {a.trigger === "SCHEDULE"
              ? `${FREQ_LABELS[a.frequency ?? "DAILY"]}${a.frequency === "WEEKLY" ? ` ${WEEKDAYS[a.runWeekday]}` : ""}${a.frequency !== "HOURLY" ? ` ${a.runHour}:00` : ""}`
              : m.agents.manualTrigger}
          </Badge>
          {a.partner && <Badge tone="blue">{m.agents.boundTo.replace("{name}", a.partner.name)}</Badge>}
          {a.webhookUrl && <Badge tone="green">{m.agents.webhook}</Badge>}
          {skills.slice(0, 3).map((s) => (
            <Badge key={s} tone="zinc">{getToolLabel(s)}</Badge>
          ))}
          {skills.length > 3 && <span className="text-xs text-zinc-400">+{skills.length - 3}</span>}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
          <span>
            {a.createdBy?.name ?? m.agents.system} · {lastRun ? m.agents.lastRunAt.replace("{time}", fmtDateTime(lastRun.startedAt, bcp47)) : m.agents.lastRunNever}
            {lastRun?.status === "FAILED" && <span className="text-red-500 ml-1">{m.agents.lastRunFailed}</span>}
          </span>
          <span className="flex gap-2">
            <form action={cloneAgentAction.bind(null, a.id)}>
              <button className="text-zinc-400 hover:text-indigo-600">{m.common.clone}</button>
            </form>
            <Link href={`/agents/${a.id}`} className="text-indigo-600 hover:underline">
              {m.agents.detailsArrow}
            </Link>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        title={m.agents.title}
        desc={m.agents.desc}
        actions={
          <Link href="/agents/new" className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">
            {m.agents.buildAgent}
          </Link>
        }
      />
      <AiCenterNav />
      <div className="px-8 space-y-7">
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">{m.agents.templateLibrary}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {templates.map((t) => (
              <div key={t.id} className="bg-gradient-to-br from-zinc-50 to-indigo-50/50 rounded-xl border border-dashed border-zinc-300 p-4 flex items-start gap-3">
                <span className="text-2xl">{t.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-zinc-800">{t.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{t.description}</div>
                  <form action={cloneAgentAction.bind(null, t.id)} className="mt-2">
                    <button className="text-xs rounded-md bg-white border border-zinc-200 px-2.5 py-1 text-indigo-600 hover:border-indigo-300">
                      {m.agents.createFromTemplate}
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">{m.agents.myAgentsCount.replace("{count}", String(mine.length))}</h2>
          {mine.length ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {mine.map((a) => (
                <AgentCard key={a.id} a={a} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-zinc-400 bg-white rounded-xl border border-zinc-200/80 p-6 text-center">
              {m.agents.emptyMine}
            </div>
          )}
        </div>

        {shared.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 mb-3">{m.agents.teamSharedCount.replace("{count}", String(shared.length))}</h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {shared.map((a) => (
                <AgentCard key={a.id} a={a} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
