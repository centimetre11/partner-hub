import Link from "next/link";
import type { Opportunity, TodoItem, Training } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader, EmptyState, fmtDate } from "@/components/ui";
import { computeCompleteness, staleDays, type PartnerWithRelations } from "@/lib/completeness";
import { getTaxonomyOptions } from "@/lib/taxonomy";
import { AddPartnerForm } from "../pool/add-partner-form";
import { CreateFromCrmButton } from "@/components/create-from-crm-button";
import { getServerI18n } from "@/lib/server-i18n";
import { isTodoOverdue } from "@/lib/todo-dates";
import { PartnerKanbanBoard, type KanbanPartnerCard } from "@/components/partner-kanban";
import {
  indexOpenOpportunitiesByPartner,
  partnersRelatedOpportunityWhere,
} from "@/lib/partner-opportunities";

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
  searchParams: Promise<{
    q?: string;
    stage?: string;
    owner?: string;
    tier?: string;
    industry?: string;
    role?: string;
  }>;
}) {
  await requireUser();
  const [{ labels, messages: m, bcp47 }, sp] = await Promise.all([getServerI18n(), searchParams]);

  const filterStageRaw = sp.stage ? parseInt(sp.stage, 10) : NaN;
  const filterStage =
    Number.isInteger(filterStageRaw) && filterStageRaw >= 1 && filterStageRaw <= 3
      ? filterStageRaw
      : null;

  const roleFilter =
    sp.role === "distributor"
      ? { isDistributor: true }
      : sp.role === "sub"
        ? { parentId: { not: null } }
        : {};

  const [industryOptions, categoryOptions, users, distributorOptions, partners] = await Promise.all([
    getTaxonomyOptions("INDUSTRY"),
    getTaxonomyOptions("CATEGORY"),
    db.user.findMany({ select: { id: true, name: true } }),
    db.partner.findMany({
      where: { isDistributor: true, parentId: null, status: { in: ["ACTIVE", "PROSPECT"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.partner.findMany({
      where: {
        status: "ACTIVE",
        ...(sp.q ? { name: { contains: sp.q } } : {}),
        ...(filterStage ? { pipelineStage: filterStage } : {}),
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
        ...roleFilter,
      },
      include: {
        contacts: { select: { role: true, contactInfo: true } },
        todos: {
          where: { status: "OPEN" },
          select: { title: true, dueDate: true, priority: true, status: true },
          orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
        },
        events: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        owner: { select: { name: true } },
        salesUser: { select: { name: true } },
        presalesUser: { select: { name: true } },
        parent: { select: { id: true, name: true } },
        _count: { select: { contacts: true, opportunities: true, events: true, trainings: true, children: true } },
      },
      orderBy: [{ pipelineStage: "desc" }, { name: "asc" }],
    }),
  ]);

  const partnerIds = partners.map((p) => p.id);
  const relatedOpps =
    partnerIds.length > 0
      ? await db.opportunity.findMany({
          where: partnersRelatedOpportunityWhere(partnerIds),
          select: {
            name: true,
            updatedAt: true,
            partnerId: true,
            customer: { select: { partnerLinks: { select: { partnerId: true } } } },
          },
          orderBy: { updatedAt: "desc" },
        })
      : [];
  const oppsByPartner = indexOpenOpportunitiesByPartner(relatedOpps, partnerIds);

  const kanbanCards: KanbanPartnerCard[] = partners.map((p) => {
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
    const nextTodo = pickNextTodo(p.todos);
    const activeOpp = oppsByPartner.get(p.id)?.[0] ?? null;
    return {
      id: p.id,
      name: p.name,
      pipelineStage: p.pipelineStage,
      tier: p.tier,
      staleDays: stale,
      activityLabel:
        stale === 0
          ? `${fmtDate(activityAt, bcp47)} · ${m.partners.activityToday}`
          : `${fmtDate(activityAt, bcp47)} · ${m.partners.activityDaysAgo.replace("{days}", String(stale))}`,
      activityTone: stale > 30 ? "red" : stale > 14 ? "amber" : "slate",
      openTodoCount: p.todos.length,
      nextTodoTitle: nextTodo?.title ?? null,
      activeOppName: activeOpp?.name ?? null,
      completeness: c.score,
    };
  });

  return (
    <div className="pb-16">
      <PageHeader
        title={m.partners.title}
        desc={m.partners.desc.replace("{count}", String(partners.length))}
        actions={
          <div className="flex gap-2">
            <AddPartnerForm
              intent="active"
              taxonomy={{ CATEGORY: categoryOptions, INDUSTRY: industryOptions }}
              distributorOptions={distributorOptions}
            />
            <CreateFromCrmButton entity="partner" />
          </div>
        }
      />
      <div className="px-8">
        <form className="flex flex-wrap gap-2 mb-4" method="get">
          {filterStage ? <input type="hidden" name="stage" value={filterStage} /> : null}
          <input
            name="q"
            defaultValue={sp.q}
            placeholder={m.partners.searchPlaceholder}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm w-full sm:w-44"
          />
          <select
            name="owner"
            defaultValue={sp.owner ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{m.partners.allTeamMembers}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            name="tier"
            defaultValue={sp.tier ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{m.partners.allTiers}</option>
            <option value="A">{m.partners.tierA}</option>
            <option value="B">{m.partners.tierB}</option>
            <option value="C">{m.partners.tierC}</option>
          </select>
          <select
            name="industry"
            defaultValue={sp.industry ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{m.partners.allIndustries}</option>
            {industryOptions.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            name="role"
            defaultValue={sp.role ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{m.partners.roleAll}</option>
            <option value="distributor">{m.partners.roleDistributor}</option>
            <option value="sub">{m.partners.roleSub}</option>
          </select>
          <button className="rounded-lg bg-slate-900 text-white px-4 py-1.5 text-sm hover:bg-slate-700">
            {m.common.filter}
          </button>
        </form>

        {partners.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm">
            <EmptyState text={m.partners.empty} />
            <div className="text-center pb-8 -mt-4">
              <Link href="/pool" className="text-sm text-sky-600 hover:underline">
                {m.partners.goToPool}
              </Link>
            </div>
          </div>
        ) : (
          <PartnerKanbanBoard
            initialCards={kanbanCards}
            stages={labels.pipelineStages.map((s) => ({
              stage: s.stage,
              name: s.name,
              desc: s.desc,
            }))}
            filterStage={filterStage}
            copy={{
              emptyColumn: m.partners.kanbanEmptyColumn,
              dragHint: m.partners.kanbanDragHint,
              stalled: m.partners.stalled,
              openTodosCount: m.partners.openTodosCount,
              noOpenTodos: m.partners.noOpenTodos,
              noActiveDeal: m.partners.noActiveDeal,
            }}
          />
        )}
      </div>
    </div>
  );
}
