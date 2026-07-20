import { notFound } from "next/navigation";
import type { TimelineEvent, TodoItem, User } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, ScoreBar, fmtDateTime } from "@/components/ui";
import { formatTierLabel, normalizePartnerTier } from "@/lib/tier";
import { PowerMapSection } from "@/components/power-map-flow";
import { computeCompleteness } from "@/lib/completeness";
import { computePartnerStatus, type StatusCopy } from "@/lib/partner-status";
import { buildPartnerInstanceMap, getStageGuidance } from "@/lib/partner-framework";
import { PartnerStatusOverview } from "@/components/partner-status-overview";
import {
  getTaxonomyOptions,
  labelFromMap,
  labelsFromMap,
  loadTaxonomyLabelMaps,
  parseIndustries,
} from "@/lib/taxonomy";
import { ProfileEditor } from "./profile-editor";
import { PartnerWorkspaceShell } from "@/components/partner-workspace-shell";
import {
  addNoteAction,
  deleteTodoAction,
} from "@/lib/actions";
import { AiPanel } from "./ai-panel";
import { PartnerCustomersSection } from "@/components/partner-customers-section";
import { PartnerAgentsPanel } from "@/components/partner-agents-panel";
import { PartnerIntegrationsPanel } from "@/components/partner-integrations-panel";
import { PartnerHierarchySection } from "@/components/partner-hierarchy-section";
import { BusinessRecordsSection, BusinessRecordDialogButton } from "@/components/business-records-section";
import { BUSINESS_RECORD_PAGE_SIZE } from "@/lib/business-record-core";
import { ImportKnownClientsButton } from "@/components/import-known-clients-button";
import { listDistributorCandidates } from "@/lib/partner-hierarchy";
import { TodoItemRow } from "@/components/todo-item-row";
import { CreateTodoDrawer } from "@/components/create-todo-drawer";
import { encodeTodoOwnerRef } from "@/lib/todo-owner-select";
import { getWecomChatForPartner } from "@/lib/wecom-chats";
import { END_CUSTOMER_WHERE } from "@/lib/customer-filters";
import { SentimentMonitorSection } from "@/components/sentiment-monitor-section";
import { SENTIMENT_MONITOR_ENABLED } from "@/lib/feature-flags";
import { AiAddButton } from "@/components/ai-add-button";
import { TodoEditButton } from "@/components/todo-edit-button";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";
import type { Messages } from "@/lib/i18n/messages/en";

export async function PartnerDetailBody({ id }: { id: string }) {
  const user = await requireUser();
  const { labels, messages: m, bcp47, locale } = await getServerI18n();
  const L = labelConstants(labels);
  const monitorDimensions = SENTIMENT_MONITOR_ENABLED ? Object.keys(L.MONITOR_DIMENSION_LABELS) : [];
  const p = await db.partner.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ attitude: "desc" }, { createdAt: "asc" }] },
      contactLinks: true,
      opportunities: { orderBy: { updatedAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 100, include: { createdBy: true } },
      trainings: true,
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
      solutions: {
        orderBy: { updatedAt: "desc" },
        include: {
          assets: { include: { asset: true } },
          documents: { select: { id: true, title: true, type: true } },
        },
      },
      businessRecords: {
        orderBy: { occurredAt: "desc" },
        take: BUSINESS_RECORD_PAGE_SIZE,
        include: {
          createdBy: true,
          contact: { select: { name: true } },
        },
      },
      _count: { select: { businessRecords: true } },
      customerLinks: { include: { customer: true }, orderBy: { customer: { name: "asc" } } },
    },
  });
  if (!p) notFound();

  const partnerCustomers = p.customerLinks.map((link) => link.customer);
  const contactOptions = p.contacts.map((c) => ({ id: c.id, name: c.name }));
  const completeness = computeCompleteness(p, labels);
  const industryCodes = parseIndustries(p);
  const networkPartnerIds = [p.id, ...p.children.map((c) => c.id)];
  const reviewSince = new Date(Date.now() - 90 * 24 * 3600 * 1000);

  const [
    users,
    unboundCustomers,
    relatedOpportunities,
    partnerAgents,
    wecomChat,
    matchedCrmCustomer,
    agentTemplates,
    labelMaps,
    taxonomyArchetype,
    taxonomyIndustry,
    taxonomyValuePattern,
    taxonomyCategory,
    taxonomyCapability,
    taxonomyCustomerSegment,
    taxonomyBuyingTrigger,
    taxonomyEntryPath,
    taxonomyIcpTier,
    taxonomyWinFactor,
    taxonomyLossReason,
    allPartners,
    allCustomers,
    distributorOptions,
    attachCandidates,
    rollupOpportunities,
    rollupProjects,
    recentReviewItems,
  ] = await Promise.all([
    db.user.findMany(),
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
    loadTaxonomyLabelMaps(),
    getTaxonomyOptions("ARCHETYPE"),
    getTaxonomyOptions("INDUSTRY"),
    getTaxonomyOptions("VALUE_PATTERN"),
    getTaxonomyOptions("CATEGORY"),
    getTaxonomyOptions("CAPABILITY"),
    getTaxonomyOptions("CUSTOMER_SEGMENT"),
    getTaxonomyOptions("BUYING_TRIGGER"),
    getTaxonomyOptions("ENTRY_PATH"),
    getTaxonomyOptions("ICP_TIER"),
    getTaxonomyOptions("WIN_FACTOR"),
    getTaxonomyOptions("LOSS_REASON"),
    db.partner.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.customer.findMany({
      where: { status: { in: ["ACTIVE", "PROSPECT"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    listDistributorCandidates(id),
    db.partner.findMany({
      where: {
        id: { not: id },
        isDistributor: false,
        parentId: null,
        status: { in: ["ACTIVE", "PROSPECT"] },
      },
      select: { id: true, name: true, status: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
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
      businessRecords: p.businessRecords.map((r) => ({ occurredAt: r.occurredAt })),
      events: p.events.map((e) => ({ createdAt: e.createdAt })),
      reviewItems: recentReviewItems,
    },
    p.statusOverview,
    statusCopy,
  );

  const taxonomy = {
    ARCHETYPE: taxonomyArchetype,
    INDUSTRY: taxonomyIndustry,
    VALUE_PATTERN: taxonomyValuePattern,
    CATEGORY: taxonomyCategory,
    CAPABILITY: taxonomyCapability,
    CUSTOMER_SEGMENT: taxonomyCustomerSegment,
    BUYING_TRIGGER: taxonomyBuyingTrigger,
    ENTRY_PATH: taxonomyEntryPath,
    ICP_TIER: taxonomyIcpTier,
    WIN_FACTOR: taxonomyWinFactor,
    LOSS_REASON: taxonomyLossReason,
  };
  const instanceMap = buildPartnerInstanceMap(p, labelMaps, labels);
  const stageGuidance = getStageGuidance(p, labels);
  let selectedDims: string[] = [];
  if (SENTIMENT_MONITOR_ENABLED && p.monitorDims) {
    try {
      const parsed = JSON.parse(p.monitorDims);
      if (Array.isArray(parsed)) selectedDims = parsed.map(String).filter((d) => monitorDimensions.includes(d));
    } catch {
      /* ignore */
    }
  }

  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  const openTodos = p.todos.filter((t) => t.status !== "DONE");
  const doneTodos = p.todos.filter((t) => t.status === "DONE");

  return (
      <PartnerWorkspaceShell
        mapNodes={instanceMap}
        partner={p}
        users={users}
        pipelineStages={labels.pipelineStages.map((s) => ({ stage: s.stage, name: s.name }))}
        taxonomy={taxonomy}
        guide={
          <div className="space-y-5">
            <PartnerStatusOverview partnerId={p.id} overview={statusOverview} />
            {SENTIMENT_MONITOR_ENABLED && (
              <SentimentMonitorSection
                partnerId={p.id}
                partnerName={p.name}
                partnerWebsite={p.website}
                disabled
                sources={(p.monitorSources ?? []).map((s) => ({
                  id: s.id, label: s.label, url: s.url, sourceType: s.sourceType,
                  domain: s.domain, title: s.title, thumbnailUrl: s.thumbnailUrl, enabled: s.enabled,
                }))}
                items={(p.monitorItems ?? []).map((m) => ({
                  id: m.id, dimension: m.dimension, sentiment: m.sentiment, title: m.title,
                  summary: m.summary, url: m.url, sourceName: m.sourceName,
                  publishedAt: m.publishedAt, createdAt: m.createdAt,
                }))}
                selectedDims={selectedDims}
              />
            )}
            <BusinessRecordsSection
              owner={{ kind: "partner", id: p.id }}
              records={p.businessRecords}
              totalCount={p._count.businessRecords}
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
                <TodoList todos={p.todos} users={users} partnerId={p.id} m={m} L={L} bcp47={bcp47} />
              </Card>
              <div className="space-y-5">
                <Card title={m.partnerDetail.profileGaps}>
                  <ScoreBar score={completeness.score} />
                  {completeness.missing.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {completeness.missing.map((m) => (
                        <span key={m} className="text-xs px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">{m}</span>
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
        }
        positioning={
          <div className="space-y-5">
            <div className="flex items-center justify-end gap-2">
              <AiAddButton scope="profile" partnerId={p.id} label={m.partnerDetail.aiComplete} variant="soft" />
              <ProfileEditor
                partner={p}
                users={users}
                taxonomy={taxonomy}
                distributorOptions={distributorOptions}
              />
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
                    <dd className={v ? "text-slate-800 mt-1" : "text-slate-300 mt-1"}>{v || m.partnerDetail.valuePatternTbd}</dd>
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
                    [m.common.tier, (() => { const t = normalizePartnerTier(p.tier); return t ? formatTierLabel(t) : null; })()],
                    [m.partnerDetail.partnerType, p.partnerArchetype ? labelFromMap(labelMaps.ARCHETYPE, p.partnerArchetype) : null],
                    [m.partnerDetail.competitiveDna, labelFromMap(labelMaps.CATEGORY, p.category)],
                    [m.partnerDetail.primaryIndustry, industryCodes.length ? labelsFromMap(labelMaps.INDUSTRY, industryCodes) : null],
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
                      <dd className={v ? "text-slate-800 mt-0.5" : "text-slate-300 mt-0.5"}>{v || m.common.toBeFilled}</dd>
                    </div>
                  ))}
                  <div className="sm:col-span-2 pt-1">
                    <ImportKnownClientsButton partnerId={p.id} knownClients={p.knownClients} />
                  </div>
                </dl>
              </Card>
            </div>
          </div>
        }
        pipeline={
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
                id: cust.id, name: cust.name, status: cust.status,
                industry: cust.industry, city: cust.city, country: cust.country,
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
        }
        relationship={
          <div className="space-y-5">
            <Card title={m.partnerDetail.powerMap.replace("{count}", String(p.contacts.length))}>
              <PowerMapSection
                owner={{ kind: "partner", id: p.id }}
                toolbarExtra={
                  <AiAddButton scope="powermap" partnerId={p.id} label={m.partnerDetail.aiAddContact} variant="soft" />
                }
                contacts={p.contacts.map((c) => ({
                  id: c.id, name: c.name, role: c.role, title: c.title,
                  department: c.department, attitude: c.attitude, reportsToId: c.reportsToId,
                  x: c.x, y: c.y,
                  contactInfo: c.contactInfo, approach: c.approach, notes: c.notes,
                }))}
                links={p.contactLinks.map((l) => ({
                  id: l.id, subordinateId: l.subordinateId, superiorId: l.superiorId, kind: l.kind,
                }))}
              />
            </Card>
            <Card
              title={m.partnerDetail.activityTimeline.replace("{count}", String(p.events.length))}
              actions={<BusinessRecordDialogButton owner={{ kind: "partner", id: p.id }} contacts={contactOptions} />}
            >
              <form action={addNoteAction.bind(null, { kind: "partner", id: p.id })} className="flex gap-2 mb-5">
                <input name="content" required placeholder={m.partnerDetail.logActivityPlaceholder} className={input} />
                <select name="type" className="rounded-lg border border-slate-200 px-2 py-2 text-sm shrink-0">
                  <option value="NOTE">{m.common.note}</option>
                  <option value="NEWS">{m.common.externalNews}</option>
                </select>
                <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm shrink-0 hover:bg-slate-700">{m.common.log}</button>
              </form>
              <TimelineList events={p.events} L={L} bcp47={bcp47} m={m} />
            </Card>
          </div>
        }
      />
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
  todos: (TodoItem & { assignee: User | null })[];
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
          <button title={m.common.delete} className="text-slate-300 hover:text-red-500 text-sm opacity-60 group-hover:opacity-100">✕</button>
        </form>
      }
    />
  );

  return (
    <div className="space-y-2">
      {openTodos.map(renderTodo)}
      {doneTodos.length > 0 && (
        <details className="group/done">
          <summary className="text-xs text-slate-400 cursor-pointer list-none py-1">{m.partnerDetail.completedCount.replace("{count}", String(doneTodos.length))}</summary>
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
              e.type === "MEETING" ? "bg-emerald-500"
              : e.type === "CHAT_IMPORT" ? "bg-purple-500"
              : e.type === "AI_SUMMARY" ? "bg-slate-500"
              :               e.type === "NEWS" ? "bg-sky-500"
              : e.type === "MILESTONE" ? "bg-amber-500"
              : e.type === "CHANGE" ? "bg-amber-400"
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
            {e.content && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap leading-relaxed">{e.content}</p>}
          </div>
        </div>
      ))}
      {events.length === 0 && <EmptyState text={m.partnerDetail.noActivity} />}
    </div>
  );
}
