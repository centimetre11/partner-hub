import Link from "next/link";
import type { Opportunity, TodoItem, Training } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, ScoreBar, TierBadge, EmptyState, fmtDate } from "@/components/ui";
import { computeCompleteness, staleDays, type PartnerWithRelations } from "@/lib/completeness";
import { getTaxonomyOptions, labelFromMap, loadTaxonomyLabelMaps, parseIndustries } from "@/lib/taxonomy";
import { AddPartnerForm } from "../pool/add-partner-form";
import { getServerI18n, stageName } from "@/lib/server-i18n";
import { isTodoOverdue } from "@/lib/todo-dates";

function truncate(text: string, max = 22) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function lastActivityAt(p: { events: { createdAt: Date }[]; updatedAt: Date }) {
  return p.events.length ? new Date(p.events[0].createdAt) : new Date(p.updatedAt);
}

function pickNextTodo(todos: Pick<TodoItem, "title" | "dueDate" | "priority" | "status">[]) {
  if (!todos.length) return null;
  const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return [...todos].sort((a, b) => {
    const aOverdue = a.dueDate && isTodoOverdue(a.dueDate) ? 0 : 1;
    const bOverdue = b.dueDate && isTodoOverdue(b.dueDate) ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    const pd =
      (priorityRank[a.priority as keyof typeof priorityRank] ?? 1) -
      (priorityRank[b.priority as keyof typeof priorityRank] ?? 1);
    if (pd !== 0) return pd;
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return ad - bd;
  })[0];
}

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; owner?: string; tier?: string; industry?: string }>;
}) {
  await requireUser();
  const [{ labels, messages: m, bcp47 }, sp] = await Promise.all([getServerI18n(), searchParams]);

  const [labelMaps, industryOptions, categoryOptions, users, partners] = await Promise.all([
    loadTaxonomyLabelMaps(),
    getTaxonomyOptions("INDUSTRY"),
    getTaxonomyOptions("CATEGORY"),
    db.user.findMany({ select: { id: true, name: true } }),
    db.partner.findMany({
      where: {
        status: "ACTIVE",
        ...(sp.q ? { name: { contains: sp.q } } : {}),
        ...(sp.stage ? { pipelineStage: parseInt(sp.stage, 10) } : {}),
        ...(sp.owner
          ? {
              OR: [
                { salesUserId: sp.owner },
                { ownerId: sp.owner },
                { presalesUserId: sp.owner },
              ],
            }
          : {}),
        ...(sp.tier ? { tier: sp.tier } : {}),
        ...(sp.industry
          ? {
              OR: [{ industries: { contains: `"${sp.industry}"` } }],
            }
          : {}),
      },
      include: {
        contacts: { select: { role: true, contactInfo: true } },
        opportunities: {
          where: { status: "ACTIVE" },
          select: { name: true, amount: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
        todos: {
          where: { status: "OPEN" },
          select: { title: true, dueDate: true, priority: true, status: true },
          orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
        },
        events: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        owner: { select: { name: true } },
        salesUser: { select: { name: true } },
        presalesUser: { select: { name: true } },
        _count: { select: { contacts: true, opportunities: true, events: true, trainings: true } },
      },
      orderBy: { pipelineStage: "desc" },
    }),
  ]);

  return (
    <div className="pb-16">
      <PageHeader
        title={m.partners.title}
        desc={m.partners.desc.replace("{count}", String(partners.length))}
        actions={<AddPartnerForm intent="active" taxonomy={{ CATEGORY: categoryOptions, INDUSTRY: industryOptions }} />}
      />
      <div className="px-8">
        <form className="flex flex-wrap gap-2 mb-4" method="get">
          <input name="q" defaultValue={sp.q} placeholder={m.partners.searchPlaceholder} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm w-full sm:w-44" />
          <select name="stage" defaultValue={sp.stage ?? ""} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{m.partners.allStages}</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => (
              <option key={s} value={s}>{s}. {stageName(labels, s)}</option>
            ))}
          </select>
          <select name="owner" defaultValue={sp.owner ?? ""} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{m.partners.allTeamMembers}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select name="tier" defaultValue={sp.tier ?? ""} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{m.partners.allTiers}</option>
            <option value="A">{m.partners.tierA}</option>
            <option value="B">{m.partners.tierB}</option>
            <option value="C">{m.partners.tierC}</option>
          </select>
          <select name="industry" defaultValue={sp.industry ?? ""} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{m.partners.allIndustries}</option>
            {industryOptions.map((o) => (
              <option key={o.code} value={o.code}>{o.label}</option>
            ))}
          </select>
          <button className="rounded-lg bg-slate-900 text-white px-4 py-1.5 text-sm hover:bg-slate-700">{m.common.filter}</button>
        </form>

        {partners.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm">
            <EmptyState text={m.partners.empty} />
            <div className="text-center pb-8 -mt-4">
              <Link href="/pool" className="text-sm text-sky-600 hover:underline">{m.partners.goToPool}</Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {partners.map((p) => {
              const c = computeCompleteness(
                {
                  ...p,
                  opportunities: Array.from({ length: p._count.opportunities }, () => ({ id: "_" })) as Opportunity[],
                  trainings: Array.from({ length: p._count.trainings }, () => ({ id: "_" })) as Training[],
                } as unknown as PartnerWithRelations,
                labels,
              );
              const stale = staleDays(p);
              const activityAt = lastActivityAt(p);
              const openTodos = p.todos;
              const nextTodo = pickNextTodo(p.todos);
              const activeOpp = p.opportunities[0] ?? null;
              const activityTone = stale > 30 ? "text-red-600" : stale > 14 ? "text-amber-600" : "text-slate-700";
              return (
                <Link
                  key={p.id}
                  href={`/partners/${p.id}`}
                  className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 hover:border-slate-300 block"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900">{p.name}</span>
                        <TierBadge tier={p.tier} />
                        <Badge tone="zinc">{labelFromMap(labelMaps.CATEGORY, p.category)}</Badge>
                        {parseIndustries(p).map((code) => (
                          <Badge key={code} tone="blue">{labelFromMap(labelMaps.INDUSTRY, code)}</Badge>
                        ))}
                        {stale > 30 && <Badge tone="red">{m.partners.stalled.replace("{days}", String(stale))}</Badge>}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {p.city ?? p.country ?? "—"} · {m.partners.salesOwner}: {p.salesUser?.name ?? p.owner?.name ?? "—"} · {m.partners.presalesOwner}: {p.presalesUser?.name ?? "—"}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-slate-400">{m.partners.stageOf.replace("{n}", String(p.pipelineStage))}</div>
                      <div className="text-sm font-medium text-sky-700">{stageName(labels, p.pipelineStage)}</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 min-w-0">
                      <div className="text-[11px] text-slate-400">{m.partners.lastActivity}</div>
                      <div className={`text-xs font-medium mt-0.5 truncate ${activityTone}`}>
                        {fmtDate(activityAt, bcp47)}
                        {" · "}
                        {stale === 0 ? m.partners.activityToday : m.partners.activityDaysAgo.replace("{days}", String(stale))}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 min-w-0">
                      <div className="text-[11px] text-slate-400">{m.partners.openTodos}</div>
                      {openTodos.length > 0 ? (
                        <div className="text-xs text-slate-700 mt-0.5 truncate" title={nextTodo?.title}>
                          {m.partners.openTodosCount.replace("{n}", String(openTodos.length))}
                          {nextTodo ? ` · ${truncate(nextTodo.title)}` : ""}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 mt-0.5">{m.partners.noOpenTodos}</div>
                      )}
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 min-w-0">
                      <div className="text-[11px] text-slate-400">{m.partners.activeDeal}</div>
                      {activeOpp ? (
                        <div className="text-xs text-slate-700 mt-0.5 truncate" title={activeOpp.name}>
                          {truncate(activeOpp.name)}
                          {activeOpp.amount ? ` · ${activeOpp.amount}` : ""}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 mt-0.5">{m.partners.noActiveDeal}</div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {m.partners.contactsCount.replace("{n}", String(p._count.contacts))} · {m.partners.opportunitiesCount.replace("{n}", String(p._count.opportunities))} · {m.partners.activitiesCount.replace("{n}", String(p._count.events))}
                    </span>
                    <div className="w-32">
                      <ScoreBar score={c.score} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
