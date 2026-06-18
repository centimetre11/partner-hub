import { notFound } from "next/navigation";
import type { Opportunity, TimelineEvent, TodoItem, Training, User } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, ScoreBar, fmtDate, fmtDateTime, tierTone } from "@/components/ui";
import { PowerMapSection } from "@/components/power-map-flow";
import { computeCompleteness, staleDays } from "@/lib/completeness";
import { buildPartnerInstanceMap } from "@/lib/partner-framework";
import {
  getTaxonomyOptions,
  labelFromMap,
  labelsFromMap,
  loadTaxonomyLabelMaps,
  parseIndustries,
} from "@/lib/taxonomy";
import { PartnerGtmPanel } from "@/components/partner-gtm-panel";
import { searchGtmLibraryAction } from "@/lib/gtm-library-actions";
import { PartnerWorkspaceShell } from "@/components/partner-workspace-shell";
import { PartnerStageGuidancePanel } from "@/components/partner-stage-guidance";
import {
  addNoteAction, archivePartnerAction, createTodoAction,
  deleteOpportunityAction, deleteTodoAction, deleteTrainingAction, promotePartnerAction,
  restorePartnerAction, setPipelineStageAction, toggleTodoAction,
  upsertOpportunityAction, upsertTrainingAction,
} from "@/lib/actions";
import { ProfileEditor } from "./profile-editor";
import { AiPanel } from "./ai-panel";
import { PartnerSolutionsSection } from "@/components/partner-solutions-section";
import { PartnerAgentsPanel } from "@/components/partner-agents-panel";
import { SentimentMonitorSection } from "@/components/sentiment-monitor-section";
import { AiAddButton } from "@/components/ai-add-button";
import { TodoEditButton } from "@/components/todo-edit-button";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";
import type { Messages } from "@/lib/i18n/messages/en";

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { labels, messages: m, bcp47 } = await getServerI18n();
  const L = labelConstants(labels);
  const monitorDimensions = Object.keys(L.MONITOR_DIMENSION_LABELS);
  const { id } = await params;
  const p = await db.partner.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ attitude: "desc" }, { createdAt: "asc" }] },
      contactLinks: true,
      opportunities: { orderBy: { updatedAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, include: { createdBy: true } },
      trainings: true,
      todos: { orderBy: [{ status: "asc" }, { dueDate: "asc" }], include: { assignee: true } },
      monitorSources: { orderBy: { createdAt: "desc" } },
      monitorItems: {
        where: { status: "NEW" },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: 60,
      },
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
    },
  });
  if (!p) notFound();
  const users = await db.user.findMany();
  const partnerAgents = await db.agent.findMany({
    where: { partnerId: id, isTemplate: false },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, icon: true, description: true, enabled: true, lastRunAt: true },
  });
  const agentTemplates = await db.agent.findMany({
    where: {
      isTemplate: true,
      OR: [
        { name: { contains: "Pre-meeting" } },
        { name: { contains: "Joint Solution" } },
        { name: { contains: "Sentiment" } },
        { name: { contains: "Monitor" } },
        // legacy Chinese names (pre-migration)
        { name: { contains: "会前" } },
        { name: { contains: "联合" } },
        { name: { contains: "舆情" } },
      ],
    },
    select: { id: true, name: true, icon: true, description: true },
    orderBy: { name: "asc" },
  });
  const completeness = computeCompleteness(p, labels);
  const stale = staleDays(p);
  const labelMaps = await loadTaxonomyLabelMaps();
  const taxonomy = {
    ARCHETYPE: await getTaxonomyOptions("ARCHETYPE"),
    INDUSTRY: await getTaxonomyOptions("INDUSTRY"),
    VALUE_PATTERN: await getTaxonomyOptions("VALUE_PATTERN"),
    CATEGORY: await getTaxonomyOptions("CATEGORY"),
  };
  const industryCodes = parseIndustries(p);
  const instanceMap = buildPartnerInstanceMap(p, labelMaps, labels);
  const gtmLibraryItems = await searchGtmLibraryAction("");
  let selectedDims: string[] = [];
  if (p.monitorDims) {
    try {
      const parsed = JSON.parse(p.monitorDims);
      if (Array.isArray(parsed)) selectedDims = parsed.map(String).filter((d) => monitorDimensions.includes(d));
    } catch {
      /* ignore */
    }
  }

  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  const openTodos = p.todos.filter((t) => t.status !== "DONE");
  const doneTodos = p.todos.filter((t) => t.status === "DONE");

  return (
    <div>
      {/* Header: identity + pipeline */}
      <div className="px-8 pt-5 sm:pt-7 pb-4 sm:pb-5 border-b border-zinc-200/60 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 break-words">{p.name}</h1>
              <Badge tone={p.status === "ACTIVE" ? "green" : p.status === "ARCHIVED" ? "zinc" : "blue"}>
                {L.STATUS_LABELS[p.status]}
              </Badge>
              {p.status === "PROSPECT" && <Badge tone="amber">{L.POOL_FLAG_LABELS[p.poolFlag]}</Badge>}
              {p.tier && <Badge tone={tierTone(p.tier)}>{m.common.tier} {p.tier}</Badge>}
              {p.partnerArchetype && (
                <Badge tone="indigo">{labelFromMap(labelMaps.ARCHETYPE, p.partnerArchetype)}</Badge>
              )}
              {industryCodes.map((code) => (
                <Badge key={code} tone="blue">{labelFromMap(labelMaps.INDUSTRY, code)}</Badge>
              ))}
              {p.valuePattern && (
                <Badge tone="purple">{labelFromMap(labelMaps.VALUE_PATTERN, p.valuePattern)}</Badge>
              )}
              {stale > 30 && p.status === "ACTIVE" && <Badge tone="red">{m.partners.stalled.replace("{days}", String(stale))}</Badge>}
            </div>
            <div className="text-sm text-zinc-500 mt-1.5">
              {[p.city, p.country].filter(Boolean).join(" · ") || m.common.unknownRegion}
              {p.website && (
                <>
                  {" · "}
                  <a href={`https://${p.website.replace(/^https?:\/\//, "")}`} target="_blank" className="text-indigo-600 hover:underline">
                    {p.website}
                  </a>
                </>
              )}
              {" · "}{m.partners.salesOwner}: {p.salesUser?.name ?? p.owner?.name ?? m.common.unassigned}
              {" · "}{m.partners.presalesOwner}: {p.presalesUser?.name ?? m.common.unassigned}
              {" · "}{m.partnerDetail.profileCompletenessPct.replace("{score}", String(completeness.score))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <AiAddButton
              scope="profile"
              partnerId={p.id}
              label={m.common.aiCapture}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            />
            {p.status === "PROSPECT" && (
              <form action={promotePartnerAction.bind(null, p.id)}>
                <button className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">
                  {m.partnerDetail.promoteActive}
                </button>
              </form>
            )}
            {p.status !== "ARCHIVED" ? (
              <form action={archivePartnerAction.bind(null, p.id)}>
                <button className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-400 hover:text-red-600">
                  {m.partnerDetail.archive}
                </button>
              </form>
            ) : (
              <form action={restorePartnerAction.bind(null, p.id)}>
                <button className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">
                  {m.common.restore}{p.prevStatus === "ACTIVE" ? m.partnerDetail.restoreAsActive : m.partnerDetail.restoreAsProspect}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-1 overflow-x-auto pb-1">
          {labels.pipelineStages.map((s) => {
            const current = p.pipelineStage === s.stage;
            const passed = p.pipelineStage > s.stage;
            return (
              <form key={s.stage} action={setPipelineStageAction.bind(null, p.id, s.stage)} className="shrink-0">
                <button
                  title={s.desc}
                  className={`rounded-full px-3 py-1.5 text-xs whitespace-nowrap transition-colors border ${
                    current
                      ? "bg-indigo-600 text-white border-indigo-600 font-medium"
                      : passed
                        ? "bg-indigo-50 text-indigo-600 border-indigo-100"
                        : "bg-white text-zinc-400 border-zinc-200 hover:border-indigo-300 hover:text-indigo-600"
                  }`}
                >
                  {s.stage}. {s.name}
                </button>
              </form>
            );
          })}
        </div>
      </div>

      <PartnerWorkspaceShell
        mapNodes={instanceMap}
        partner={p}
        users={users}
        pipelineStages={labels.pipelineStages.map((s) => ({ stage: s.stage, name: s.name }))}
        taxonomy={taxonomy}
        guide={
          <div className="space-y-5">
            <PartnerStageGuidancePanel partner={p} labels={labels} messages={m} />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <Card title={m.partnerDetail.todosOpen.replace("{count}", String(openTodos.length))}>
                <form action={createTodoAction} className="flex gap-2 mb-4">
                  <input type="hidden" name="partnerId" value={p.id} />
                  <input name="title" required placeholder={m.partnerDetail.addTodoPlaceholder} className={input} />
                  <input name="dueDate" type="date" className="rounded-lg border border-zinc-200 px-2 py-2 text-sm w-36 shrink-0" />
                  <button className="rounded-lg bg-zinc-900 text-white px-3 py-2 text-sm shrink-0 hover:bg-zinc-700">+</button>
                </form>
                <TodoList todos={p.todos} users={users} input={input} m={m} L={L} bcp47={bcp47} />
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
                <AiPanel partnerId={p.id} missing={completeness.missing} />
                <PartnerAgentsPanel partnerId={p.id} agents={partnerAgents} templates={agentTemplates} />
              </div>
            </div>
          </div>
        }
        positioning={
          <div className="space-y-5">
            <div className="flex items-center justify-end gap-2">
              <AiAddButton scope="profile" partnerId={p.id} label={m.partnerDetail.aiComplete} variant="soft" />
              <ProfileEditor partner={p} users={users} taxonomy={taxonomy} />
            </div>

            <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-5">
              <h3 className="text-sm font-semibold text-indigo-800 mb-3">{m.partnerDetail.jointValuePattern}</h3>
              <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
                {[
                  [m.partnerDetail.partnerOffers, p.valuePartnerOffer],
                  [m.partnerDetail.fanruanOffers, p.valueFanruanOffer],
                  [m.partnerDetail.customerGets, p.valueCustomerOutcome],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-xs text-zinc-500">{k}</dt>
                    <dd className={v ? "text-zinc-800 mt-1" : "text-zinc-300 mt-1"}>{v || m.partnerDetail.valuePatternTbd}</dd>
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
                    [m.common.tier, p.tier ? `${m.common.tier} ${p.tier}` : null],
                    [m.partnerDetail.partnerType, p.partnerArchetype ? labelFromMap(labelMaps.ARCHETYPE, p.partnerArchetype) : null],
                    [m.partnerDetail.competitiveDna, labelFromMap(labelMaps.CATEGORY, p.category)],
                    [m.partnerDetail.primaryIndustry, industryCodes.length ? labelsFromMap(labelMaps.INDUSTRY, industryCodes) : null],
                    [m.partnerDetail.dedicatedHeadcount, p.dedicatedHeadcount],
                    [m.partners.salesOwner, p.salesUser?.name ?? p.owner?.name],
                    [m.partners.presalesOwner, p.presalesUser?.name],
                    [m.common.priority, p.priority],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex justify-between gap-3">
                      <dt className="text-zinc-400 shrink-0">{k}</dt>
                      <dd className={`text-right ${v ? "text-zinc-800" : "text-zinc-300"}`}>{v || "—"}</dd>
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
                    [m.partnerDetail.bestChannel, p.bestChannel],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <dt className="text-xs text-zinc-400">{k}</dt>
                      <dd className={v ? "text-zinc-800 mt-0.5" : "text-zinc-300 mt-0.5"}>{v || m.common.toBeFilled}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </div>

            <PartnerGtmPanel partner={p} libraryItems={gtmLibraryItems} labelMaps={labelMaps} />
          </div>
        }
        pipeline={
          <Card
            title={m.partnerDetail.opportunitiesActive.replace("{count}", String(p.opportunities.filter((o) => o.status === "ACTIVE").length))}
            actions={<AiAddButton scope="opportunity" partnerId={p.id} label={m.partnerDetail.aiAddOpportunity} variant="soft" />}
          >
            <OpportunityList partnerId={p.id} opportunities={p.opportunities} input={input} m={m} bcp47={bcp47} />
          </Card>
        }
        capability={
          <div className="space-y-5">
            <Card title={m.partnerDetail.trainingCert.replace("{count}", String(p.trainings.length))}>
              <TrainingList partnerId={p.id} trainings={p.trainings} input={input} m={m} />
            </Card>
            <PartnerSolutionsSection partnerId={p.id} solutions={p.solutions} />
          </div>
        }
        relationship={
          <div className="space-y-5">
            <Card
              title={m.partnerDetail.powerMap.replace("{count}", String(p.contacts.length))}
              actions={<AiAddButton scope="powermap" partnerId={p.id} label={m.partnerDetail.aiAddContact} variant="soft" />}
            >
              <PowerMapSection
                partnerId={p.id}
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
            <Card title={m.partnerDetail.activityTimeline.replace("{count}", String(p.events.length))}>
              <form action={addNoteAction.bind(null, p.id)} className="flex gap-2 mb-5">
                <input name="content" required placeholder={m.partnerDetail.logActivityPlaceholder} className={input} />
                <select name="type" className="rounded-lg border border-zinc-200 px-2 py-2 text-sm shrink-0">
                  <option value="NOTE">{m.common.note}</option>
                  <option value="NEWS">{m.common.externalNews}</option>
                </select>
                <button className="rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm shrink-0 hover:bg-zinc-700">{m.common.log}</button>
              </form>
              <TimelineList events={p.events} L={L} bcp47={bcp47} m={m} />
            </Card>
            <SentimentMonitorSection
              partnerId={p.id}
              partnerName={p.name}
              partnerWebsite={p.website}
              sources={p.monitorSources.map((s) => ({
                id: s.id, label: s.label, url: s.url, sourceType: s.sourceType,
                domain: s.domain, title: s.title, thumbnailUrl: s.thumbnailUrl, enabled: s.enabled,
              }))}
              items={p.monitorItems.map((m) => ({
                id: m.id, dimension: m.dimension, sentiment: m.sentiment, title: m.title,
                summary: m.summary, url: m.url, sourceName: m.sourceName,
                publishedAt: m.publishedAt, createdAt: m.createdAt,
              }))}
              selectedDims={selectedDims}
            />
          </div>
        }
      />
    </div>
  );
}

function TodoList({
  todos,
  users,
  input,
  m,
  L,
  bcp47,
}: {
  todos: (TodoItem & { assignee: User | null })[];
  users: User[];
  input: string;
  m: Messages;
  L: ReturnType<typeof labelConstants>;
  bcp47: string;
}) {
  const openTodos = todos.filter((t) => t.status !== "DONE");
  const doneTodos = todos.filter((t) => t.status === "DONE");

  const renderTodo = (t: (typeof todos)[number]) => {
    const overdue = t.status === "OPEN" && t.dueDate && new Date(t.dueDate) < new Date();
    return (
      <div key={t.id} className="flex items-start gap-2.5 group">
        <form action={toggleTodoAction.bind(null, t.id)}>
          <button
            className={`w-4.5 h-4.5 mt-0.5 rounded border flex items-center justify-center text-[10px] ${
              t.status === "DONE" ? "bg-indigo-600 border-indigo-600 text-white" : "border-zinc-300 hover:border-indigo-400"
            }`}
          >
            {t.status === "DONE" && "✓"}
          </button>
        </form>
        <div className="min-w-0 flex-1">
          <div className={`text-sm ${t.status === "DONE" ? "line-through text-zinc-300" : "text-zinc-800"}`}>
            {t.title}
            {t.source === "AI" && <span className="ml-1.5 text-[10px] text-purple-500">AI</span>}
          </div>
          <div className="text-xs text-zinc-400">
            {t.dueDate && (
              <span className={overdue ? "text-red-500 font-medium" : ""}>
                {fmtDate(t.dueDate, bcp47)}{overdue && ` ${m.common.overdue}`}
              </span>
            )}
            {t.assignee && ` · ${t.assignee.name}`}
            {` · ${L.TODO_PRIORITY_LABELS[t.priority]}`}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <TodoEditButton
            todo={{
              id: t.id,
              title: t.title,
              detail: t.detail,
              dueDate: t.dueDate,
              priority: t.priority,
              partnerId: t.partnerId,
              assigneeId: t.assigneeId,
            }}
            users={users}
          />
          <form action={deleteTodoAction.bind(null, t.id)}>
            <button title={m.common.delete} className="text-zinc-300 hover:text-red-500 text-sm opacity-60 group-hover:opacity-100">✕</button>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {openTodos.map(renderTodo)}
      {doneTodos.length > 0 && (
        <details className="group/done">
          <summary className="text-xs text-zinc-400 cursor-pointer list-none py-1">{m.partnerDetail.completedCount.replace("{count}", String(doneTodos.length))}</summary>
          <div className="space-y-2 mt-1">{doneTodos.map(renderTodo)}</div>
        </details>
      )}
      {todos.length === 0 && <EmptyState text={m.partnerDetail.noTodos} />}
    </div>
  );
}

function OpportunityList({
  partnerId,
  opportunities,
  input,
  m,
  bcp47,
}: {
  partnerId: string;
  opportunities: Opportunity[];
  input: string;
  m: Messages;
  bcp47: string;
}) {
  return (
    <div className="space-y-3">
      {opportunities.map((o) => (
        <details key={o.id} className="group rounded-lg border border-zinc-100 hover:border-zinc-200">
          <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-zinc-900">{o.name}</span>
                <Badge tone={o.status === "ACTIVE" ? "green" : o.status === "WON" ? "indigo" : "zinc"}>
                  {o.status === "ACTIVE" ? m.common.active : o.status === "WON" ? m.common.won : o.status === "LOST" ? m.common.lost : m.common.paused}
                </Badge>
                <Badge tone="blue">{o.stage}</Badge>
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">
                {m.common.client}: {o.client ?? "—"} · {m.common.amount}: {o.amount ?? "—"}
                {o.followUpAt && ` · ${m.partnerDetail.followUp}: ${fmtDate(o.followUpAt, bcp47)}`}
              </div>
            </div>
            <span className="text-zinc-300 group-open:rotate-90 transition-transform">›</span>
          </summary>
          <div className="px-4 pb-4 pt-1 border-t border-zinc-50">
            <form action={upsertOpportunityAction.bind(null, partnerId)} className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              <input type="hidden" name="id" value={o.id} />
              <input name="name" defaultValue={o.name} className={input} />
              <input name="client" defaultValue={o.client ?? ""} placeholder={m.common.client} className={input} />
              <input name="amount" defaultValue={o.amount ?? ""} placeholder={m.common.amount} className={input} />
              <input name="stage" defaultValue={o.stage} placeholder={m.common.stage} className={input} />
              <input name="nextStep" defaultValue={o.nextStep ?? ""} placeholder={m.common.nextStep} className={input} />
              <input name="followUpAt" type="date" defaultValue={o.followUpAt ? new Date(o.followUpAt).toISOString().slice(0, 10) : ""} className={input} />
              <select name="status" defaultValue={o.status} className={input}>
                <option value="ACTIVE">{m.common.active}</option>
                <option value="WON">{m.common.won}</option>
                <option value="LOST">{m.common.lost}</option>
                <option value="PAUSED">{m.common.paused}</option>
              </select>
              <div className="col-span-2 md:col-span-3 flex justify-end gap-2">
                <button formAction={deleteOpportunityAction.bind(null, partnerId, o.id)} className="text-xs text-zinc-400 hover:text-red-600">{m.common.delete}</button>
                <button className="rounded-md bg-zinc-900 text-white px-3 py-1.5 text-xs">{m.common.save}</button>
              </div>
            </form>
          </div>
        </details>
      ))}
      {opportunities.length === 0 && <EmptyState text={m.partnerDetail.noOpportunities} />}
      <details className="rounded-lg border border-dashed border-zinc-200">
        <summary className="px-4 py-2.5 text-sm text-indigo-600 cursor-pointer list-none">{m.partnerDetail.addOpportunity}</summary>
        <form action={upsertOpportunityAction.bind(null, partnerId)} className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          <input name="name" required placeholder={m.partnerDetail.opportunityName} className={input} />
          <input name="client" placeholder={m.common.client} className={input} />
          <input name="amount" placeholder={m.common.amount} className={input} />
          <input name="stage" placeholder={m.common.stage} className={input} />
          <input name="nextStep" placeholder={m.common.nextStep} className={input} />
          <input name="followUpAt" type="date" className={input} />
          <div className="col-span-2 md:col-span-3 flex justify-end">
            <button className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-xs">{m.common.add}</button>
          </div>
        </form>
      </details>
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
            <button className="rounded-md bg-zinc-900 text-white px-2.5 py-1.5 text-xs">{m.common.save}</button>
            <button formAction={deleteTrainingAction.bind(null, partnerId, t.id)} className="text-xs text-zinc-400 hover:text-red-600 px-1">{m.partnerDetail.trainingDel}</button>
          </div>
        </form>
      ))}
      <details className="rounded-lg border border-dashed border-zinc-200">
        <summary className="px-4 py-2.5 text-sm text-indigo-600 cursor-pointer list-none">{m.partnerDetail.addTrainingPlan}</summary>
        <form action={upsertTrainingAction.bind(null, partnerId)} className="px-4 pb-4 grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
          <input name="person" required placeholder={m.partnerDetail.personRequired} className={input} />
          <input name="currentSkill" placeholder={m.common.currentSkill} className={input} />
          <input name="targetCert" placeholder={m.common.targetCert} className={input} />
          <input name="deadline" type="date" className={input} />
          <button className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-xs">{m.common.add}</button>
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
          {i < events.length - 1 && <div className="absolute left-[5px] top-5 bottom-0 w-px bg-zinc-100" />}
          <div
            className={`w-[11px] h-[11px] rounded-full mt-1.5 shrink-0 ${
              e.type === "MEETING" ? "bg-emerald-500"
              : e.type === "CHAT_IMPORT" ? "bg-purple-500"
              : e.type === "AI_SUMMARY" ? "bg-indigo-500"
              : e.type === "NEWS" ? "bg-sky-500"
              : e.type === "CHANGE" ? "bg-amber-400"
              : "bg-zinc-300"
            }`}
          />
          <div className="pb-5 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-zinc-800">{e.title}</span>
              <Badge tone="zinc">{L.EVENT_TYPE_LABELS[e.type] ?? e.type}</Badge>
              <span className="text-xs text-zinc-400">
                {fmtDateTime(e.createdAt, bcp47)}
                {e.createdBy && ` · ${e.createdBy.name}`}
              </span>
            </div>
            {e.content && <p className="text-sm text-zinc-600 mt-1 whitespace-pre-wrap leading-relaxed">{e.content}</p>}
          </div>
        </div>
      ))}
      {events.length === 0 && <EmptyState text={m.partnerDetail.noActivity} />}
    </div>
  );
}
