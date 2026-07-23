import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import type { TimelineEvent, TodoItem, User } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, ScoreBar, fmtDateTime } from "@/components/ui";
import { formatTierLabel, normalizePartnerTier } from "@/lib/tier";
import { PowerMapLazy } from "@/components/power-map-lazy";
import { computeCompleteness, type PartnerWithRelations } from "@/lib/completeness";
import { computePartnerStatus, type StatusCopy } from "@/lib/partner-status";
import {
  buildPartnerInstanceMap,
  getStageGuidance,
  type PartnerFrameworkInput,
  type WorkspacePanelId,
} from "@/lib/partner-framework";
import { PartnerStatusOverview } from "@/components/partner-status-overview";
import {
  getTaxonomyOptionsMany,
  labelFromMap,
  labelsFromMap,
  loadTaxonomyLabelMaps,
  parseIndustries,
  type TaxonomyDimension,
  type TaxonomyOptionRow,
} from "@/lib/taxonomy";
import { ProfileEditor } from "./profile-editor";
import { PartnerWorkspaceShell } from "@/components/partner-workspace-shell";
import { addNoteAction, deleteTodoAction } from "@/lib/actions";
import { AiPanel } from "./ai-panel";
import { PartnerCustomersSection } from "@/components/partner-customers-section";
import { PartnerAgentsPanel } from "@/components/partner-agents-panel";
import { PartnerIntegrationsPanel } from "@/components/partner-integrations-panel";
import { PartnerHierarchySection } from "@/components/partner-hierarchy-section";
import { PartnerSolutionsSection } from "@/components/partner-solutions-section";
import { MaterialsSection } from "@/components/materials-section";
import { TrainingList } from "@/components/training-list";
import { BusinessRecordsSection, BusinessRecordDialogButton } from "@/components/business-records-section";
import { BUSINESS_RECORD_PAGE_SIZE } from "@/lib/business-record-core";
import { ImportKnownClientsButton } from "@/components/import-known-clients-button";
import { listDistributorCandidates } from "@/lib/partner-hierarchy";
import { TodoItemRow } from "@/components/todo-item-row";
import { CreateTodoDrawer } from "@/components/create-todo-drawer";
import { encodeTodoOwnerRef } from "@/lib/todo-owner-select";
import { getWecomChatForPartner } from "@/lib/wecom-chats";
import { getAmmoConfigForClient } from "@/lib/ammo-config";
import { END_CUSTOMER_WHERE } from "@/lib/customer-filters";
import { SentimentMonitorSection } from "@/components/sentiment-monitor-section";
import { SENTIMENT_MONITOR_ENABLED } from "@/lib/feature-flags";
import { AiAddButton } from "@/components/ai-add-button";
import { profileEnrichSeedMessage } from "@/lib/intake-profile-enrich";
import { getServerI18n, labelConstants, type Locale } from "@/lib/server-i18n";
import type { Messages } from "@/lib/i18n/messages/en";

async function loadBasePartner(id: string) {
  return db.partner.findUnique({
    where: { id },
    include: {
      contacts: {
        select: {
          id: true,
          name: true,
          role: true,
          attitude: true,
          title: true,
          department: true,
          reportsToId: true,
          x: true,
          y: true,
          contactInfo: true,
          approach: true,
          notes: true,
        },
        orderBy: [{ attitude: "desc" }, { createdAt: "asc" }],
      },
      opportunities: {
        select: { id: true, name: true, status: true, nextStep: true },
        orderBy: { updatedAt: "desc" },
      },
      events: {
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      trainings: {
        select: { id: true, status: true, targetCert: true },
        orderBy: { updatedAt: "desc" },
      },
      solutions: {
        select: { id: true, name: true, status: true },
        orderBy: { updatedAt: "desc" },
      },
      owner: true,
      salesUser: true,
      presalesUser: true,
      parent: { select: { id: true, name: true } },
      children: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          tier: true,
          pipelineStage: true,
          status: true,
          salesUser: { select: { name: true } },
          owner: { select: { name: true } },
        },
      },
    },
  });
}

type BasePartner = NonNullable<Awaited<ReturnType<typeof loadBasePartner>>>;

const ALL_TAXONOMY_DIMS: TaxonomyDimension[] = [
  "ARCHETYPE",
  "INDUSTRY",
  "VALUE_PATTERN",
  "CATEGORY",
  "CAPABILITY",
  "CUSTOMER_SEGMENT",
  "BUYING_TRIGGER",
  "ENTRY_PATH",
  "ICP_TIER",
  "WIN_FACTOR",
  "LOSS_REASON",
];

function buildShellTaxonomy(
  loaded: Partial<Record<TaxonomyDimension, TaxonomyOptionRow[]>>,
): Record<TaxonomyDimension, TaxonomyOptionRow[]> {
  return Object.fromEntries(ALL_TAXONOMY_DIMS.map((d) => [d, loaded[d] ?? []])) as Record<
    TaxonomyDimension,
    TaxonomyOptionRow[]
  >;
}

function PanelContentFallback() {
  return (
    <div className="space-y-4">
      <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="h-36 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-36 animate-pulse rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}

export async function PartnerDetailBody({ id, panel }: { id: string; panel: WorkspacePanelId }) {
  await requireUser();
  const { labels } = await getServerI18n();

  const [p, users, labelMaps, taxonomyByDim] = await Promise.all([
    loadBasePartner(id),
    db.user.findMany(),
    loadTaxonomyLabelMaps(),
    getTaxonomyOptionsMany(["ARCHETYPE", "INDUSTRY", "VALUE_PATTERN", "CATEGORY", "CAPABILITY"]),
  ]);
  if (!p) notFound();

  const frameworkInput = p as unknown as PartnerFrameworkInput;
  const instanceMap = buildPartnerInstanceMap(frameworkInput, labelMaps, labels);
  const taxonomy = buildShellTaxonomy(taxonomyByDim);

  return (
    <PartnerWorkspaceShell
      mapNodes={instanceMap}
      partner={p}
      users={users}
      pipelineStages={labels.pipelineStages.map((s) => ({ stage: s.stage, name: s.name }))}
      taxonomy={taxonomy}
      activePanel={panel}
    >
      <Suspense key={panel} fallback={<PanelContentFallback />}>
        <PartnerPanelContent
          id={id}
          panel={panel}
          p={p}
          users={users}
          labelMaps={labelMaps}
          taxonomy={taxonomy}
          taxonomyByDim={taxonomyByDim}
        />
      </Suspense>
    </PartnerWorkspaceShell>
  );
}

async function PartnerPanelContent({
  id,
  panel,
  p,
  users,
  labelMaps,
  taxonomy,
  taxonomyByDim,
}: {
  id: string;
  panel: WorkspacePanelId;
  p: BasePartner;
  users: User[];
  labelMaps: Awaited<ReturnType<typeof loadTaxonomyLabelMaps>>;
  taxonomy: Record<TaxonomyDimension, TaxonomyOptionRow[]>;
  taxonomyByDim: Partial<Record<TaxonomyDimension, TaxonomyOptionRow[]>>;
}) {
  const user = await requireUser();
  const { labels, messages: m, bcp47, locale } = await getServerI18n();
  const L = labelConstants(labels);
  const monitorDimensions = SENTIMENT_MONITOR_ENABLED ? Object.keys(L.MONITOR_DIMENSION_LABELS) : [];
  const input =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  switch (panel) {
    case "guide":
      return renderGuidePanel({
        id,
        p,
        user,
        users,
        labels,
        m,
        L,
        bcp47,
        monitorDimensions,
      });
    case "positioning":
      return renderPositioningPanel({ id, p, users, labelMaps, taxonomy, m, locale });
    case "capability":
      return renderCapabilityPanel({ id, p, m, input });
    case "pipeline":
      return renderPipelinePanel({ id, p, m, labels, bcp47, locale, taxonomyByDim });
    case "relationship":
      return renderRelationshipPanel({ id, p, L, bcp47, m, input });
  }
}

async function renderGuidePanel({
  id,
  p,
  user,
  users,
  labels,
  m,
  L,
  bcp47,
  monitorDimensions,
}: {
  id: string;
  p: BasePartner;
  user: User;
  users: User[];
  labels: Awaited<ReturnType<typeof getServerI18n>>["labels"];
  m: Messages;
  L: ReturnType<typeof labelConstants>;
  bcp47: string;
  monitorDimensions: string[];
}) {
  const reviewSince = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const frameworkInput = p as unknown as PartnerFrameworkInput;

  const [
    guideData,
    relatedOpportunities,
    partnerAgents,
    wecomChat,
    matchedCrmCustomer,
    agentTemplates,
    allPartners,
    allCustomers,
    recentReviewItems,
  ] = await Promise.all([
    db.partner.findUnique({
      where: { id },
      select: {
        businessRecords: {
          orderBy: { occurredAt: "desc" },
          take: BUSINESS_RECORD_PAGE_SIZE,
          include: {
            createdBy: true,
            contact: { select: { name: true } },
          },
        },
        _count: { select: { businessRecords: true } },
        todos: {
          orderBy: [{ status: "asc" }, { dueDate: "asc" }],
          include: {
            assignee: true,
            opportunity: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
          },
        },
        ...(SENTIMENT_MONITOR_ENABLED
          ? {
              monitorSources: { orderBy: { createdAt: "desc" as const } },
              monitorItems: {
                where: { status: "NEW" as const },
                orderBy: [{ publishedAt: "desc" as const }, { createdAt: "desc" as const }],
                take: 60,
              },
            }
          : {}),
      },
    }),
    db.opportunity.findMany({
      where: { OR: [{ partnerId: id }, { customer: { partnerLinks: { some: { partnerId: id } } } }] },
      select: { status: true },
    }),
    db.agent.findMany({
      where: { partnerId: id, isTemplate: false },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, icon: true, description: true, enabled: true, lastRunAt: true },
    }),
    getWecomChatForPartner(id),
    p.crmCustomerId
      ? db.crmCustomer.findUnique({
          where: { id: p.crmCustomerId },
          select: { id: true, name: true, city: true, status: true, salesman: true, presales: true },
        })
      : Promise.resolve(null),
    db.agent.findMany({
      where: {
        isTemplate: true,
        OR: [
          { name: { contains: "Pre-meeting" } },
          { name: { contains: "Joint Solution" } },
          { name: { contains: "Sentiment" } },
          { name: { contains: "Monitor" } },
          { name: { contains: "会前" } },
          { name: { contains: "联合" } },
          { name: { contains: "舆情" } },
        ],
      },
      select: { id: true, name: true, icon: true, description: true },
      orderBy: { name: "asc" },
    }),
    db.partner.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.customer.findMany({
      where: { status: { in: ["ACTIVE", "PROSPECT"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.partnerReviewItem.findMany({
      where: {
        partnerId: id,
        OR: [
          { discussedAt: { gte: reviewSince } },
          { updatedAt: { gte: reviewSince }, status: { in: ["DISCUSSED", "CONFIRMED"] } },
        ],
      },
      select: { discussedAt: true, status: true, updatedAt: true },
      take: 20,
    }),
  ]);

  const businessRecords = guideData?.businessRecords ?? [];
  const businessRecordCount = guideData?._count.businessRecords ?? 0;
  const todos = guideData?.todos ?? [];
  const contactOptions = p.contacts.map((c) => ({ id: c.id, name: c.name }));
  const completeness = computeCompleteness(p as unknown as PartnerWithRelations, labels);
  const stageGuidance = getStageGuidance(frameworkInput, labels);

  const statusCopy: StatusCopy = {
    evidence: m.partnerStatus.evidenceCopy,
    next: m.partnerStatus.nextCopy,
  };
  const statusOverview = computePartnerStatus(
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
      contacts: p.contacts.map((c) => ({ name: c.name, role: c.role, attitude: c.attitude })),
      solutions: p.solutions.map((s) => ({ name: s.name, status: s.status })),
      trainings: p.trainings.map((t) => ({ status: t.status })),
      opportunities: relatedOpportunities.map((o) => ({ status: o.status })),
      businessRecords: businessRecords.map((r) => ({ occurredAt: r.occurredAt })),
      events: p.events.map((e) => ({ createdAt: e.createdAt })),
      reviewItems: recentReviewItems,
    },
    p.statusOverview,
    statusCopy,
  );

  let selectedDims: string[] = [];
  if (SENTIMENT_MONITOR_ENABLED && p.monitorDims) {
    try {
      const parsed = JSON.parse(p.monitorDims);
      if (Array.isArray(parsed)) selectedDims = parsed.map(String).filter((d) => monitorDimensions.includes(d));
    } catch {
      /* ignore */
    }
  }

  const openTodos = todos.filter((t) => t.status !== "DONE");

  return (
    <div className="space-y-5">
      <PartnerStatusOverview partnerId={p.id} overview={statusOverview} />
      {SENTIMENT_MONITOR_ENABLED && (
        <SentimentMonitorSection
          partnerId={p.id}
          partnerName={p.name}
          partnerWebsite={p.website}
          disabled
          sources={(guideData?.monitorSources ?? []).map((s) => ({
            id: s.id,
            label: s.label,
            url: s.url,
            sourceType: s.sourceType,
            domain: s.domain,
            title: s.title,
            thumbnailUrl: s.thumbnailUrl,
            enabled: s.enabled,
          }))}
          items={(guideData?.monitorItems ?? []).map((item) => ({
            id: item.id,
            dimension: item.dimension,
            sentiment: item.sentiment,
            title: item.title,
            summary: item.summary,
            url: item.url,
            sourceName: item.sourceName,
            publishedAt: item.publishedAt,
            createdAt: item.createdAt,
          }))}
          selectedDims={selectedDims}
        />
      )}
      <BusinessRecordsSection
        owner={{ kind: "partner", id: p.id }}
        records={businessRecords}
        totalCount={businessRecordCount}
        contacts={contactOptions}
      />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card
          title={m.partnerDetail.todosOpen.replace("{count}", String(openTodos.length))}
          actions={
            <CreateTodoDrawer
              userId={user.id}
              partners={allPartners}
              customers={allCustomers}
              users={users.map((u) => ({ id: u.id, name: u.name }))}
              defaultOwnerRef={encodeTodoOwnerRef("partner", p.id)}
            />
          }
        >
          <TodoList todos={todos} users={users} partnerId={p.id} m={m} L={L} bcp47={bcp47} />
        </Card>
        <div className="space-y-5">
          <Card title={m.partnerDetail.profileGaps}>
            <ScoreBar score={completeness.score} />
            {completeness.missing.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {completeness.missing.map((missing) => (
                  <span key={missing} className="text-xs px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">
                    {missing}
                  </span>
                ))}
              </div>
            )}
          </Card>
          <AiPanel
            partnerId={p.id}
            missing={completeness.missing}
            stageGuidance={stageGuidance}
            labels={labels}
          />
          <PartnerAgentsPanel
            partnerId={p.id}
            agents={partnerAgents}
            templates={agentTemplates}
            copy={m.partnerDetail.agentsPanel}
            bcp47={bcp47}
          />
        </div>
      </div>
      <PartnerIntegrationsPanel
        partnerId={p.id}
        partnerName={p.name}
        kmsRootPath={p.kmsRootPath}
        crmCustomerId={p.crmCustomerId}
        matchedCrmCustomer={matchedCrmCustomer}
        boundChat={
          wecomChat
            ? {
                chatId: wecomChat.chatId,
                chatType: wecomChat.chatType,
                label: wecomChat.label,
              }
            : null
        }
      />
    </div>
  );
}

async function renderPositioningPanel({
  id,
  p,
  users,
  labelMaps,
  taxonomy,
  m,
  locale,
}: {
  id: string;
  p: BasePartner;
  users: User[];
  labelMaps: Awaited<ReturnType<typeof loadTaxonomyLabelMaps>>;
  taxonomy: Record<TaxonomyDimension, TaxonomyOptionRow[]>;
  m: Messages;
  locale: Locale;
}) {
  const distributorOptions = await listDistributorCandidates(id);
  const industryCodes = parseIndustries(p);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end gap-2">
        <AiAddButton
          scope="profile"
          partnerId={p.id}
          label={m.partnerDetail.aiComplete}
          variant="soft"
          seedMessage={profileEnrichSeedMessage(locale, "partner")}
          autoStart
        />
        <ProfileEditor partner={p} users={users} taxonomy={taxonomy} distributorOptions={distributorOptions} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/30 p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">{m.partnerDetail.jointValuePattern}</h3>
        <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
          {[
            [m.partnerDetail.partnerOffers, p.valuePartnerOffer],
            [m.partnerDetail.fanruanOffers, p.valueFanruanOffer],
            [m.partnerDetail.customerGets, p.valueCustomerOutcome],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className={v ? "text-slate-800 mt-1" : "text-slate-300 mt-1"}>
                {v || m.partnerDetail.valuePatternTbd}
              </dd>
            </div>
          ))}
        </dl>
        {p.valuePattern && (
          <Badge tone="purple">{labelFromMap(labelMaps.VALUE_PATTERN, p.valuePattern)}</Badge>
        )}
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-1">{m.partnerDetail.annualValueEstimate}</h3>
        <p className="text-xs text-slate-500 mb-4">{m.partnerDetail.annualValueHint}</p>
        <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {[
            [m.partnerDetail.partnerAnnualRevenue, p.partnerAnnualRevenue],
            [m.partnerDetail.partnerDealsPerYear, p.partnerDealsPerYear],
            [m.partnerDetail.estimatedAnnualValue, p.estimatedAnnualValue],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className={`mt-1 font-medium ${v ? "text-emerald-900" : "text-slate-300 font-normal"}`}>
                {v || m.common.toBeFilled}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card title={m.partnerDetail.positioningTags} className="lg:col-span-1">
          <dl className="space-y-3 text-sm">
            {[
              [
                m.common.tier,
                (() => {
                  const t = normalizePartnerTier(p.tier);
                  return t ? formatTierLabel(t) : null;
                })(),
              ],
              [
                m.partnerDetail.partnerType,
                p.partnerArchetype ? labelFromMap(labelMaps.ARCHETYPE, p.partnerArchetype) : null,
              ],
              [m.partnerDetail.competitiveDna, labelFromMap(labelMaps.CATEGORY, p.category)],
              [
                m.partnerDetail.primaryIndustry,
                industryCodes.length ? labelsFromMap(labelMaps.INDUSTRY, industryCodes) : null,
              ],
              [m.partnerDetail.dedicatedHeadcount, p.dedicatedHeadcount],
              [m.partners.salesOwner, p.salesUser?.name ?? p.owner?.name],
              [m.partners.presalesOwner, p.presalesUser?.name],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-3">
                <dt className="text-slate-400 shrink-0">{k}</dt>
                <dd className={`text-right ${v ? "text-slate-800" : "text-slate-300"}`}>{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title={m.partnerDetail.companyProfile} className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {[
              [m.partnerDetail.companySize, p.headcount],
              [m.partnerDetail.coreBusiness, p.coreBusiness],
              [m.partnerDetail.coreCapabilities, p.capability],
              [m.partnerDetail.currentTools, p.currentTools],
              [m.partnerDetail.knownClients, p.knownClients],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-xs text-slate-400">{k}</dt>
                <dd className={v ? "text-slate-800 mt-0.5" : "text-slate-300 mt-0.5"}>
                  {v || m.common.toBeFilled}
                </dd>
              </div>
            ))}
            <div className="sm:col-span-2 pt-1">
              <ImportKnownClientsButton partnerId={p.id} knownClients={p.knownClients} />
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}

async function renderCapabilityPanel({
  id,
  p,
  m,
  input,
}: {
  id: string;
  p: BasePartner;
  m: Messages;
  input: string;
}) {
  const [capabilityData, ammoConfig] = await Promise.all([
    db.partner.findUnique({
      where: { id },
      select: {
        trainings: { orderBy: { updatedAt: "desc" } },
        assets: { orderBy: { createdAt: "desc" } },
        solutions: {
          orderBy: { updatedAt: "desc" },
          include: {
            assets: { include: { asset: true } },
            documents: { select: { id: true, title: true, type: true } },
          },
        },
      },
    }),
    getAmmoConfigForClient(),
  ]);

  const trainings = capabilityData?.trainings ?? [];
  const linkAssets = (capabilityData?.assets ?? []).filter((a) => !(a.provider === "gdrive" && a.size > 0));
  const solutions = capabilityData?.solutions ?? [];

  return (
    <div className="space-y-5">
      <Card title={m.partnerDetail.trainingCert.replace("{count}", String(trainings.length))}>
        <TrainingList owner={{ partnerId: p.id }} trainings={trainings} input={input} m={m} />
      </Card>
      <MaterialsSection
        partnerId={p.id}
        entityName={p.name}
        folderUrl={p.gdriveFolderUrl}
        browseReady={ammoConfig.gdriveServiceAccountConfigured}
        uploaderConnected={ammoConfig.gdriveUploaderConnected}
        assets={linkAssets.map((a) => ({
          id: a.id,
          filename: a.filename,
          url: a.url,
          thumbnailUrl: a.thumbnailUrl,
          provider: a.provider,
        }))}
        copy={m.gdriveMaterials}
      />
      <PartnerSolutionsSection partnerId={p.id} solutions={solutions} copy={m.partnerDetail.solutionsSection} />
    </div>
  );
}

async function renderPipelinePanel({
  id,
  p,
  m,
  labels,
  bcp47,
  locale,
  taxonomyByDim,
}: {
  id: string;
  p: BasePartner;
  m: Messages;
  labels: Awaited<ReturnType<typeof getServerI18n>>["labels"];
  bcp47: string;
  locale: Locale;
  taxonomyByDim: Partial<Record<TaxonomyDimension, TaxonomyOptionRow[]>>;
}) {
  const networkPartnerIds = [p.id, ...p.children.map((c) => c.id)];
  const taxonomyCategory = taxonomyByDim.CATEGORY ?? [];
  const taxonomyIndustry = taxonomyByDim.INDUSTRY ?? [];

  const [pipelineData, unboundCustomers, relatedOpportunities, attachCandidates, rollupOpportunities, rollupProjects] =
    await Promise.all([
      db.partner.findUnique({
        where: { id },
        select: {
          customerLinks: {
            include: { customer: true },
            orderBy: { customer: { name: "asc" } },
          },
        },
      }),
      db.customer.findMany({
        where: { ...END_CUSTOMER_WHERE, partnerLinks: { none: { partnerId: id } } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.opportunity.findMany({
        where: { OR: [{ partnerId: id }, { customer: { partnerLinks: { some: { partnerId: id } } } }] },
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { updatedAt: "desc" },
      }),
      p.isDistributor
        ? db.partner.findMany({
            where: {
              id: { not: id },
              isDistributor: false,
              parentId: null,
              status: { in: ["ACTIVE", "PROSPECT"] },
            },
            select: { id: true, name: true, status: true },
            orderBy: { name: "asc" },
            take: 500,
          })
        : Promise.resolve([]),
      p.isDistributor
        ? db.opportunity.findMany({
            where: { partnerId: { in: networkPartnerIds } },
            include: { partner: { select: { id: true, name: true } } },
            orderBy: { updatedAt: "desc" },
            take: 50,
          })
        : Promise.resolve([]),
      p.isDistributor
        ? db.project.findMany({
            where: { partnerId: { in: networkPartnerIds } },
            include: { partner: { select: { id: true, name: true } } },
            orderBy: { updatedAt: "desc" },
            take: 50,
          })
        : Promise.resolve([]),
    ]);

  const partnerCustomers = (pipelineData?.customerLinks ?? []).map((link) => link.customer);

  return (
    <div className="space-y-5">
      {p.isDistributor && (
        <PartnerHierarchySection
          partnerId={p.id}
          partnerName={p.name}
          children={p.children}
          opportunities={rollupOpportunities}
          projects={rollupProjects}
          attachCandidates={attachCandidates}
          m={m}
          labels={labels}
          bcp47={bcp47}
          locale={locale}
          taxonomy={{ CATEGORY: taxonomyCategory, INDUSTRY: taxonomyIndustry }}
        />
      )}
      <PartnerCustomersSection
        partnerId={p.id}
        customers={partnerCustomers.map((cust) => ({
          id: cust.id,
          name: cust.name,
          status: cust.status,
          industry: cust.industry,
          city: cust.city,
          country: cust.country,
          partnerRelation: cust.partnerRelation,
        }))}
        unboundCustomers={unboundCustomers}
        opportunities={relatedOpportunities.map((o) => ({
          id: o.id,
          name: o.name,
          status: o.status,
          stage: o.stage,
          nextStep: o.nextStep,
          dealType: o.dealType,
          amount: o.amount,
          followUpAt: o.followUpAt,
          client: o.client,
          customerId: o.customerId,
          customer: o.customer,
        }))}
        copy={m.partnerDetail.customersSection}
        statusLabels={{
          ACTIVE: m.customers.statusActive,
          PROSPECT: m.customers.statusProspect,
          INACTIVE: m.customers.statusInactive,
        }}
        m={m}
        bcp47={bcp47}
        locale={locale}
      />
    </div>
  );
}

async function renderRelationshipPanel({
  id,
  p,
  L,
  bcp47,
  m,
  input,
}: {
  id: string;
  p: BasePartner;
  L: ReturnType<typeof labelConstants>;
  bcp47: string;
  m: Messages;
  input: string;
}) {
  const relationshipData = await db.partner.findUnique({
    where: { id },
    select: {
      contactLinks: true,
      events: { orderBy: { createdAt: "desc" }, take: 100, include: { createdBy: true } },
    },
  });

  const contactLinks = relationshipData?.contactLinks ?? [];
  const events = relationshipData?.events ?? [];
  const contactOptions = p.contacts.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-5">
      <Card title={m.partnerDetail.powerMap.replace("{count}", String(p.contacts.length))}>
        <PowerMapLazy
          owner={{ kind: "partner", id: p.id }}
          toolbarExtra={
            <AiAddButton scope="powermap" partnerId={p.id} label={m.partnerDetail.aiAddContact} variant="soft" />
          }
          contacts={p.contacts.map((c) => ({
            id: c.id,
            name: c.name,
            role: c.role,
            title: c.title,
            department: c.department,
            attitude: c.attitude,
            reportsToId: c.reportsToId,
            x: c.x,
            y: c.y,
            contactInfo: c.contactInfo,
            approach: c.approach,
            notes: c.notes,
          }))}
          links={contactLinks.map((l) => ({
            id: l.id,
            subordinateId: l.subordinateId,
            superiorId: l.superiorId,
            kind: l.kind,
          }))}
        />
      </Card>
      <Card
        title={m.partnerDetail.activityTimeline.replace("{count}", String(events.length))}
        actions={<BusinessRecordDialogButton owner={{ kind: "partner", id: p.id }} contacts={contactOptions} />}
      >
        <form action={addNoteAction.bind(null, { kind: "partner", id: p.id })} className="flex gap-2 mb-5">
          <input name="content" required placeholder={m.partnerDetail.logActivityPlaceholder} className={input} />
          <select name="type" className="rounded-lg border border-slate-200 px-2 py-2 text-sm shrink-0">
            <option value="NOTE">{m.common.note}</option>
            <option value="NEWS">{m.common.externalNews}</option>
          </select>
          <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm shrink-0 hover:bg-slate-700">
            {m.common.log}
          </button>
        </form>
        <TimelineList events={events} L={L} bcp47={bcp47} m={m} />
      </Card>
    </div>
  );
}

function TodoList({
  todos,
  users,
  partnerId,
  m,
  L,
  bcp47,
}: {
  todos: (TodoItem & {
    assignee: User | null;
    opportunity: { id: string; name: string } | null;
    project: { id: string; name: string } | null;
  })[];
  users: User[];
  partnerId: string;
  m: Messages;
  L: ReturnType<typeof labelConstants>;
  bcp47: string;
}) {
  const openTodos = todos.filter((t) => t.status !== "DONE");
  const doneTodos = todos.filter((t) => t.status === "DONE");

  const renderTodo = (t: (typeof todos)[number]) => (
    <TodoItemRow
      key={t.id}
      todo={t}
      partnerId={partnerId}
      users={users}
      bcp47={bcp47}
      deleteAction={
        <form action={deleteTodoAction.bind(null, t.id)}>
          <button
            title={m.common.delete}
            className="text-slate-300 hover:text-red-500 text-sm opacity-60 group-hover:opacity-100"
          >
            ✕
          </button>
        </form>
      }
    />
  );

  return (
    <div className="space-y-2">
      {openTodos.map(renderTodo)}
      {doneTodos.length > 0 && (
        <details className="group/done">
          <summary className="text-xs text-slate-400 cursor-pointer list-none py-1">
            {m.partnerDetail.completedCount.replace("{count}", String(doneTodos.length))}
          </summary>
          <div className="space-y-2 mt-1">{doneTodos.map(renderTodo)}</div>
        </details>
      )}
      {todos.length === 0 && <EmptyState text={m.partnerDetail.noTodos} />}
    </div>
  );
}

function TimelineList({
  events,
  L,
  bcp47,
  m,
}: {
  events: (TimelineEvent & { createdBy: User | null })[];
  L: ReturnType<typeof labelConstants>;
  bcp47: string;
  m: Messages;
}) {
  return (
    <div className="space-y-0">
      {events.map((e, i) => (
        <div key={e.id} className="flex gap-3 relative">
          {i < events.length - 1 && <div className="absolute left-[5px] top-5 bottom-0 w-px bg-slate-100" />}
          <div
            className={`w-[11px] h-[11px] rounded-full mt-1.5 shrink-0 ${
              e.type === "MEETING"
                ? "bg-emerald-500"
                : e.type === "CHAT_IMPORT"
                  ? "bg-purple-500"
                  : e.type === "AI_SUMMARY"
                    ? "bg-slate-500"
                    : e.type === "NEWS"
                      ? "bg-sky-500"
                      : e.type === "MILESTONE"
                        ? "bg-amber-500"
                        : e.type === "CHANGE"
                          ? "bg-amber-400"
                          : "bg-slate-300"
            }`}
          />
          <div className="pb-5 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-slate-800">{e.title}</span>
              <Badge tone="zinc">{L.EVENT_TYPE_LABELS[e.type] ?? e.type}</Badge>
              <span className="text-xs text-slate-400">
                {fmtDateTime(e.createdAt, bcp47)}
                {e.createdBy && ` · ${e.createdBy.name}`}
              </span>
            </div>
            {e.content && (
              <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap leading-relaxed">{e.content}</p>
            )}
          </div>
        </div>
      ))}
      {events.length === 0 && <EmptyState text={m.partnerDetail.noActivity} />}
    </div>
  );
}
