import Link from "next/link";
import type { TodoItem } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader, EmptyState, fmtDate } from "@/components/ui";
import { staleDays } from "@/lib/completeness";
import { computePartnerStatus, type StatusCopy } from "@/lib/partner-status";
import { getTaxonomyOptionsMany } from "@/lib/taxonomy";
import { AddPartnerForm } from "../pool/add-partner-form";
import { CreateFromCrmButton } from "@/components/create-from-crm-button";
import { getServerI18n } from "@/lib/server-i18n";
import { isTodoOverdue } from "@/lib/todo-dates";
import { PartnerKanbanBoardLazy } from "@/components/partner-kanban-lazy";
import type { KanbanPartnerCard } from "@/components/partner-kanban";
import { PartnerCoverageMap } from "@/components/partner-coverage-map";
import { indexOpenOpportunitiesByPartner } from "@/lib/partner-opportunities";
import { OPEN_OPPORTUNITY_STATUSES } from "@/lib/opportunity-status";
import { nameContainsWhere } from "@/lib/name-search";
import { InstantSearchInput } from "@/components/instant-search-input";

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

function buildFilterQuery(sp: {
  q?: string;
  stage?: string;
  owner?: string;
  tier?: string;
  industry?: string;
  role?: string;
  view?: string;
}) {
  const params = new URLSearchParams();
  if (sp.q) params.set("q", sp.q);
  if (sp.stage) params.set("stage", sp.stage);
  if (sp.owner) params.set("owner", sp.owner);
  if (sp.tier) params.set("tier", sp.tier);
  if (sp.industry) params.set("industry", sp.industry);
  if (sp.role) params.set("role", sp.role);
  return params;
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
    view?: string;
  }>;
}) {
  await requireUser();
  const [{ labels, messages: m, bcp47, locale }, sp] = await Promise.all([getServerI18n(), searchParams]);

  const view = sp.view === "coverage" ? "coverage" : "kanban";
  const filterStageRaw = sp.stage ? parseInt(sp.stage, 10) : NaN;
  const filterStage =
    Number.isInteger(filterStageRaw) && filterStageRaw >= 1 && filterStageRaw <= 3
      ? filterStageRaw
      : null;
  const nameFilter = nameContainsWhere(sp.q);

  const roleFilter =
    sp.role === "distributor"
      ? { isDistributor: true }
      : sp.role === "sub"
        ? { parentId: { not: null } }
        : {};

  const [taxonomyByDim, users, distributorOptions, partners] =
    await Promise.all([
      getTaxonomyOptionsMany(["INDUSTRY", "CAPABILITY", "CATEGORY"]),
      db.user.findMany({ select: { id: true, name: true } }),
      db.partner.findMany({
        where: { isDistributor: true, parentId: null, status: { in: ["ACTIVE", "PROSPECT"] } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.partner.findMany({
        where: {
          status: "ACTIVE",
          ...(nameFilter ? { name: nameFilter } : {}),
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
          contacts: { select: { name: true, role: true, attitude: true } },
          todos: {
            where: { status: "OPEN" },
            select: { title: true, dueDate: true, priority: true, status: true },
            orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
          },
          events: { orderBy: { createdAt: "desc" }, take: 5, select: { createdAt: true } },
          solutions: { select: { name: true, status: true } },
          trainings: { select: { status: true } },
          businessRecords: {
            select: { occurredAt: true },
            orderBy: { occurredAt: "desc" },
            take: 12,
          },
          owner: { select: { name: true } },
          salesUser: { select: { name: true } },
          presalesUser: { select: { name: true } },
          parent: { select: { id: true, name: true } },
          _count: { select: { contacts: true, opportunities: true, events: true, trainings: true, children: true } },
        },
        orderBy: [{ pipelineStage: "desc" }, { name: "asc" }],
      }),
    ]);

  const industryOptions = taxonomyByDim.INDUSTRY ?? [];
  const capabilityOptions = taxonomyByDim.CAPABILITY ?? [];
  const categoryOptions = taxonomyByDim.CATEGORY ?? [];

  const partnerIds = partners.map((p) => p.id);
  const reviewSince = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const openStatusSet = new Set(OPEN_OPPORTUNITY_STATUSES);

  const [relatedOpps, recentReviewItems] =
    view === "kanban" && partnerIds.length > 0
      ? await Promise.all([
          db.opportunity.findMany({
            where: {
              OR: [
                { partnerId: { in: partnerIds } },
                { customer: { partnerLinks: { some: { partnerId: { in: partnerIds } } } } },
              ],
            },
            select: {
              name: true,
              status: true,
              updatedAt: true,
              partnerId: true,
              customer: { select: { partnerLinks: { select: { partnerId: true } } } },
            },
            orderBy: { updatedAt: "desc" },
          }),
          db.partnerReviewItem.findMany({
            where: {
              partnerId: { in: partnerIds },
              OR: [
                { discussedAt: { gte: reviewSince } },
                { updatedAt: { gte: reviewSince }, status: { in: ["DISCUSSED", "CONFIRMED"] } },
              ],
            },
            select: { partnerId: true, discussedAt: true, status: true, updatedAt: true },
          }),
        ])
      : [[], []];

  const oppsByPartner = indexOpenOpportunitiesByPartner(relatedOpps, partnerIds);
  const reviewsByPartner = new Map<string, typeof recentReviewItems>();
  for (const id of partnerIds) reviewsByPartner.set(id, []);
  for (const item of recentReviewItems) {
    reviewsByPartner.get(item.partnerId)?.push(item);
  }

  const statusCopy: StatusCopy = {
    evidence: m.partnerStatus.evidenceCopy,
    next: m.partnerStatus.nextCopy,
  };

  const kanbanCards: KanbanPartnerCard[] =
    view === "kanban"
      ? partners.map((p) => {
          const partnerOpps = oppsByPartner.get(p.id) ?? [];
          const health = computePartnerStatus(
            {
              dedicatedHeadcount: p.dedicatedHeadcount,
              valuePattern: p.valuePattern,
              valuePartnerOffer: p.valuePartnerOffer,
              valueFanruanOffer: p.valueFanruanOffer,
              valueCustomerOutcome: p.valueCustomerOutcome,
              playbook: p.playbook,
              pitch: p.pitch,
              certLevel: p.certLevel,
              capabilities: p.capabilities,
              pipelineStage: p.pipelineStage,
              updatedAt: p.updatedAt,
              contacts: p.contacts,
              solutions: p.solutions,
              trainings: p.trainings,
              opportunities: partnerOpps.map((o) => ({ status: o.status })),
              businessRecords: p.businessRecords,
              events: p.events,
              reviewItems: reviewsByPartner.get(p.id) ?? [],
            },
            p.statusOverview,
            statusCopy,
          );
          const stale = staleDays(p);
          const activityAt = lastActivityAt(p);
          const nextTodo = pickNextTodo(p.todos);
          const activeOpp = partnerOpps.find((o) => openStatusSet.has(o.status)) ?? null;
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
            healthScore: health.healthScore,
          };
        })
      : [];

  const filterBase = buildFilterQuery(sp);
  const kanbanHref = (() => {
    const q = new URLSearchParams(filterBase);
    q.delete("view");
    const s = q.toString();
    return s ? `/partners?${s}` : "/partners";
  })();
  const coverageHref = (() => {
    const q = new URLSearchParams(filterBase);
    q.set("view", "coverage");
    return `/partners?${q.toString()}`;
  })();

  const desc =
    view === "coverage"
      ? m.partners.descCoverage.replace("{count}", String(partners.length))
      : m.partners.desc.replace("{count}", String(partners.length));

  return (
    <div className="pb-16">
      <PageHeader
        title={m.partners.title}
        desc={desc}
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
        <div className="flex flex-wrap gap-2 mb-4">
          <Link
            href={kanbanHref}
            className={`rounded-lg px-3 py-1.5 text-sm border ${
              view === "kanban"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {m.partners.viewKanban}
          </Link>
          <Link
            href={coverageHref}
            className={`rounded-lg px-3 py-1.5 text-sm border ${
              view === "coverage"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {m.partners.viewCoverage}
          </Link>
        </div>

        <form className="flex flex-wrap gap-2 mb-4" method="get">
          {view === "coverage" ? <input type="hidden" name="view" value="coverage" /> : null}
          {filterStage ? <input type="hidden" name="stage" value={filterStage} /> : null}
          <InstantSearchInput
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
        ) : view === "coverage" ? (
          <PartnerCoverageMap
            partners={partners.map((p) => ({
              id: p.id,
              name: p.name,
              tier: p.tier,
              pipelineStage: p.pipelineStage,
              country: p.country,
              city: p.city,
              industries: p.industries,
              capabilities: p.capabilities,
            }))}
            locale={locale === "zh" ? "zh" : "en"}
            industryLabels={Object.fromEntries(industryOptions.map((o) => [o.code, o.label]))}
            capabilityLabels={Object.fromEntries(capabilityOptions.map((o) => [o.code, o.label]))}
            industryOrder={industryOptions.map((o) => o.code)}
            capabilityOrder={capabilityOptions.map((o) => o.code)}
            stages={labels.pipelineStages.map((s) => ({
              stage: s.stage as 1 | 2 | 3,
              name: s.name,
              desc: s.desc,
            }))}
            copy={{
              pairRegionIndustry: m.partners.coveragePairRegionIndustry,
              pairRegionCapability: m.partners.coveragePairRegionCapability,
              pairIndustryCapability: m.partners.coveragePairIndustryCapability,
              gapsTitle: m.partners.coverageGapsTitle,
              shallowTitle: m.partners.coverageShallowTitle,
              gapsEmpty: m.partners.coverageGapsEmpty,
              shallowEmpty: m.partners.coverageShallowEmpty,
              legendTitle: m.partners.coverageLegendTitle,
              legendGap: m.partners.coverageLegendGap,
              legendStage1: m.partners.coverageLegendStage1,
              legendStage2: m.partners.coverageLegendStage2,
              legendStage3: m.partners.coverageLegendStage3,
              gapsOnly: m.partners.coverageGapsOnly,
              partnersInCell: m.partners.coveragePartnersInCell,
              noPartnersInCell: m.partners.coverageNoPartnersInCell,
              clickCellHint: m.partners.coverageClickCellHint,
              gapRegion: m.partners.coverageGapRegion,
              gapCapability: m.partners.coverageGapCapability,
              gapIndustry: m.partners.coverageGapIndustry,
              shallowCell: m.partners.coverageShallowCell,
              shallowRegion: m.partners.coverageShallowRegion,
              shallowCapability: m.partners.coverageShallowCapability,
              shallowIndustry: m.partners.coverageShallowIndustry,
              noneIndustry: m.partners.coverageNoneIndustry,
              noneCapability: m.partners.coverageNoneCapability,
              showAllRegions: m.partners.coverageShowAllRegions,
              hideEmptyRegions: m.partners.coverageHideEmptyRegions,
              stageFilterHint: m.partners.coverageStageFilterHint,
              stageOf: m.partners.stageOf,
            }}
          />
        ) : (
          <PartnerKanbanBoardLazy
            initialCards={kanbanCards}
            stages={labels.pipelineStages.map((s) => ({
              stage: s.stage,
              name: s.name,
              desc: s.desc,
            }))}
            filterStage={filterStage}
            filterTier={sp.tier ?? null}
            copy={{
              emptyColumn: m.partners.kanbanEmptyColumn,
              dragHint: m.partners.kanbanDragHint,
              stalled: m.partners.stalled,
              openTodosCount: m.partners.openTodosCount,
              noOpenTodos: m.partners.noOpenTodos,
              noActiveDeal: m.partners.noActiveDeal,
              tierCFoldLabel: m.common.tierCFoldLabel,
              tierCFoldHint: m.common.tierCFoldHint,
            }}
          />
        )}
      </div>
    </div>
  );
}
