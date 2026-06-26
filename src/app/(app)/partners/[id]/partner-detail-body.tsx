import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Opportunity, TimelineEvent, TodoItem, Training, User } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, ScoreBar, fmtDate, fmtDateTime } from "@/components/ui";
import { NavLink } from "@/components/nav-link";
import { formatTierLabel, normalizePartnerTier } from "@/lib/tier";
import { PowerMapSection } from "@/components/power-map-flow";
import { computeCompleteness } from "@/lib/completeness";
import { buildPartnerInstanceMap, getStageGuidance } from "@/lib/partner-framework";
import {
  getTaxonomyOptions,
  labelFromMap,
  labelsFromMap,
  loadTaxonomyLabelMaps,
  parseIndustries,
} from "@/lib/taxonomy";
import { PartnerGtmPanelLoader } from "@/components/partner-gtm-panel-loader";
import { PartnerWorkspaceShell } from "@/components/partner-workspace-shell";
import {
  addNoteAction, createTodoAction,
  deleteTodoAction, deleteTrainingAction,
  upsertTrainingAction,
} from "@/lib/actions";
import { ProfileEditor } from "./profile-editor";
import { AiPanel } from "./ai-panel";
import { PartnerSolutionsSection } from "@/components/partner-solutions-section";
import { MaterialsSection } from "@/components/materials-section";
import { getAmmoConfigForClient } from "@/lib/ammo-config";
import { PartnerCustomersSection } from "@/components/partner-customers-section";
import { PartnerAgentsPanel } from "@/components/partner-agents-panel";
import { PartnerIntegrationsPanel } from "@/components/partner-integrations-panel";
import { BusinessRecordsSection, BusinessRecordDialogButton } from "@/components/business-records-section";
import { TodoItemRow } from "@/components/todo-item-row";
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
  const { labels, messages: m, bcp47 } = await getServerI18n();
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
      todos: { orderBy: [{ status: "asc" }, { dueDate: "asc" }], include: { assignee: true } },
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
      solutions: {
        orderBy: { updatedAt: "desc" },
        include: {
          assets: { include: { asset: true } },
          documents: { select: { id: true, title: true, type: true } },
        },
      },
      businessRecords: {
        orderBy: { occurredAt: "desc" },
        take: 20,
        include: {
          createdBy: true,
          contact: { select: { name: true } },
        },
      },
      customerLinks: { include: { customer: true }, orderBy: { customer: { name: "asc" } } },
      assets: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!p) notFound();

  const partnerCustomers = p.customerLinks.map((link) => link.customer);
  const contactOptions = p.contacts.map((c) => ({ id: c.id, name: c.name }));
  const completeness = computeCompleteness(p, labels);
  const industryCodes = parseIndustries(p);

  const [
    users,
    ammoConfig,
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
  ] = await Promise.all([
    db.user.findMany(),
    getAmmoConfigForClient(),
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
          select: { id: true, name: true, city: true, status: true, salesman: true },
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
  ]);

  const taxonomy = {
    ARCHETYPE: taxonomyArchetype,
    INDUSTRY: taxonomyIndustry,
    VALUE_PATTERN: taxonomyValuePattern,
    CATEGORY: taxonomyCategory,
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
              contacts={contactOptions}
            />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <Card title={m.partnerDetail.todosOpen.replace("{count}", String(openTodos.length))}>
                <form action={createTodoAction} className="flex flex-wrap gap-2 mb-4">
                  <input type="hidden" name="partnerId" value={p.id} />
                  <input name="title" required placeholder={m.partnerDetail.addTodoPlaceholder} className={`${input} flex-1 min-w-[140px]`} />
                  <select name="assigneeId" defaultValue={user.id} className="rounded-lg border border-slate-200 px-2 py-2 text-sm shrink-0" aria-label={m.common.owner}>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <input name="dueDate" type="date" className="rounded-lg border border-slate-200 px-2 py-2 text-sm w-36 shrink-0" />
                  <button className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm shrink-0 hover:bg-slate-700">+</button>
                </form>
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
              <ProfileEditor partner={p} users={users} taxonomy={taxonomy} />
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
                </dl>
              </Card>
            </div>

            <Suspense
              fallback={
                <div className="rounded-lg border border-slate-200 bg-slate-50/30 p-5 space-y-3 animate-pulse">
                  <div className="h-4 w-32 bg-slate-200/80 rounded" />
                  <div className="h-24 bg-slate-200/80 rounded" />
                </div>
              }
            >
              <PartnerGtmPanelLoader partner={p} labelMaps={labelMaps} />
            </Suspense>
          </div>
        }
        pipeline={
          <div className="space-y-5">
            <PartnerCustomersSection
              partnerId={p.id}
              customers={partnerCustomers.map((cust) => ({
                id: cust.id, name: cust.name, status: cust.status,
                industry: cust.industry, city: cust.city, country: cust.country,
                partnerRelation: cust.partnerRelation,
              }))}
              unboundCustomers={unboundCustomers}
              copy={m.partnerDetail.customersSection}
              statusLabels={{
                ACTIVE: m.customers.statusActive,
                PROSPECT: m.customers.statusProspect,
                INACTIVE: m.customers.statusInactive,
              }}
            />
            <Card title={m.partnerDetail.relatedOpportunities.replace("{count}", String(relatedOpportunities.length))}>
              <RelatedOpportunityList opportunities={relatedOpportunities} m={m} bcp47={bcp47} />
            </Card>
          </div>
        }
        capability={
          <div className="space-y-5">
            <Card title={m.partnerDetail.trainingCert.replace("{count}", String(p.trainings.length))}>
              <TrainingList partnerId={p.id} trainings={p.trainings} input={input} m={m} />
            </Card>
            <PartnerSolutionsSection
              partnerId={p.id}
              solutions={p.solutions}
              copy={m.partnerDetail.solutionsSection}
            />
            <MaterialsSection
              partnerId={p.id}
              entityName={p.name}
              folderUrl={p.gdriveFolderUrl}
              uploaderConnected={ammoConfig.gdriveUploaderConnected}
              assets={p.assets.map((a) => ({
                id: a.id,
                filename: a.filename,
                url: a.url,
                thumbnailUrl: a.thumbnailUrl,
                provider: a.provider,
              }))}
              copy={m.gdriveMaterials}
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

function RelatedOpportunityList({
  opportunities,
  m,
  bcp47,
}: {
  opportunities: (Opportunity & { customer: { id: string; name: string } | null })[];
  m: Messages;
  bcp47: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">{m.partnerDetail.relatedOpportunitiesHint}</p>
      {opportunities.map((o) => (
        <div key={o.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-slate-900">{o.name}</span>
              <Badge tone={o.status === "ACTIVE" ? "green" : o.status === "WON" ? "indigo" : "zinc"}>
                {o.status === "ACTIVE" ? m.common.active : o.status === "WON" ? m.common.won : o.status === "LOST" ? m.common.lost : m.common.paused}
              </Badge>
              <Badge tone="blue">{o.stage}</Badge>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {o.customer ? (
                <NavLink href={`/customers/${o.customer.id}`} className="text-sky-600 hover:underline">{o.customer.name}</NavLink>
              ) : (o.client ?? "—")}
              {" · "}{m.common.amount}: {o.amount ?? "—"}
              {o.followUpAt && ` · ${m.partnerDetail.followUp}: ${fmtDate(o.followUpAt, bcp47)}`}
            </div>
          </div>
          {o.customer && (
            <NavLink href={`/customers/${o.customer.id}`} className="text-xs text-sky-600 hover:underline shrink-0">
              {m.partnerDetail.customersSection.viewDetail}
            </NavLink>
          )}
        </div>
      ))}
      {opportunities.length === 0 && <EmptyState text={m.partnerDetail.noOpportunities} />}
    </div>
  );
}

function TrainingList({
  partnerId,
  trainings,
  input,
  m,
}: {
  partnerId: string;
  trainings: Training[];
  input: string;
  m: Messages;
}) {
  return (
    <div className="space-y-2">
      {trainings.map((t) => (
        <form key={t.id} action={upsertTrainingAction.bind(null, partnerId)} className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm items-center">
          <input type="hidden" name="id" value={t.id} />
          <input name="person" defaultValue={t.person} className={input} />
          <input name="currentSkill" defaultValue={t.currentSkill ?? ""} placeholder={m.common.currentSkill} className={input} />
          <input name="targetCert" defaultValue={t.targetCert ?? ""} placeholder={m.common.targetCert} className={input} />
          <input name="deadline" type="date" defaultValue={t.deadline ? new Date(t.deadline).toISOString().slice(0, 10) : ""} className={input} />
          <select name="status" defaultValue={t.status} className={input}>
            <option value="PLANNED">{m.common.planned}</option>
            <option value="IN_PROGRESS">{m.common.inProgress}</option>
            <option value="DONE">{m.common.completed}</option>
          </select>
          <div className="flex gap-1 justify-end">
            <button className="rounded-md bg-slate-900 text-white px-2.5 py-1.5 text-xs">{m.common.save}</button>
            <button formAction={deleteTrainingAction.bind(null, partnerId, t.id)} className="text-xs text-slate-400 hover:text-red-600 px-1">{m.partnerDetail.trainingDel}</button>
          </div>
        </form>
      ))}
      <details className="rounded-lg border border-dashed border-slate-200">
        <summary className="px-4 py-2.5 text-sm text-sky-600 cursor-pointer list-none">{m.partnerDetail.addTrainingPlan}</summary>
        <form action={upsertTrainingAction.bind(null, partnerId)} className="px-4 pb-4 grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
          <input name="person" required placeholder={m.partnerDetail.personRequired} className={input} />
          <input name="currentSkill" placeholder={m.common.currentSkill} className={input} />
          <input name="targetCert" placeholder={m.common.targetCert} className={input} />
          <input name="deadline" type="date" className={input} />
          <button className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs">{m.common.add}</button>
        </form>
      </details>
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
