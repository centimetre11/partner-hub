import { notFound } from "next/navigation";
import type { Opportunity, TimelineEvent, TodoItem, Training, User } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, ScoreBar, fmtDate, fmtDateTime, tierTone } from "@/components/ui";
import {
  EVENT_TYPE_LABELS, PIPELINE_STAGES,
  POOL_FLAG_LABELS, STATUS_LABELS, TODO_PRIORITY_LABELS,
} from "@/lib/constants";
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
import { MONITOR_DIMENSIONS } from "@/lib/constants";
import { AiAddButton } from "@/components/ai-add-button";
import { TodoEditButton } from "@/components/todo-edit-button";

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
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
  const completeness = computeCompleteness(p);
  const stale = staleDays(p);
  const labelMaps = await loadTaxonomyLabelMaps();
  const taxonomy = {
    ARCHETYPE: await getTaxonomyOptions("ARCHETYPE"),
    INDUSTRY: await getTaxonomyOptions("INDUSTRY"),
    VALUE_PATTERN: await getTaxonomyOptions("VALUE_PATTERN"),
    CATEGORY: await getTaxonomyOptions("CATEGORY"),
  };
  const industryCodes = parseIndustries(p);
  const instanceMap = buildPartnerInstanceMap(p, labelMaps);
  const gtmLibraryItems = await searchGtmLibraryAction("");
  let selectedDims: string[] = [];
  if (p.monitorDims) {
    try {
      const parsed = JSON.parse(p.monitorDims);
      if (Array.isArray(parsed)) selectedDims = parsed.map(String).filter((d) => MONITOR_DIMENSIONS.includes(d));
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
                {STATUS_LABELS[p.status]}
              </Badge>
              {p.status === "PROSPECT" && <Badge tone="amber">{POOL_FLAG_LABELS[p.poolFlag]}</Badge>}
              {p.tier && <Badge tone={tierTone(p.tier)}>Tier {p.tier}</Badge>}
              {p.partnerArchetype && (
                <Badge tone="indigo">{labelFromMap(labelMaps.ARCHETYPE, p.partnerArchetype)}</Badge>
              )}
              {industryCodes.map((code) => (
                <Badge key={code} tone="blue">{labelFromMap(labelMaps.INDUSTRY, code)}</Badge>
              ))}
              {p.valuePattern && (
                <Badge tone="purple">{labelFromMap(labelMaps.VALUE_PATTERN, p.valuePattern)}</Badge>
              )}
              {stale > 30 && p.status === "ACTIVE" && <Badge tone="red">Stalled {stale} days</Badge>}
            </div>
            <div className="text-sm text-zinc-500 mt-1.5">
              {[p.city, p.country].filter(Boolean).join(" · ") || "Region unknown"}
              {p.website && (
                <>
                  {" · "}
                  <a href={`https://${p.website.replace(/^https?:\/\//, "")}`} target="_blank" className="text-indigo-600 hover:underline">
                    {p.website}
                  </a>
                </>
              )}
              {" · Sales: "}
              {p.salesUser?.name ?? p.owner?.name ?? "Unassigned"}
              {" · Pre-sales: "}
              {p.presalesUser?.name ?? "Unassigned"}
              {" · Profile completeness "}
              {completeness.score}%
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <AiAddButton
              scope="profile"
              partnerId={p.id}
              label="✦ AI capture"
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            />
            {p.status === "PROSPECT" && (
              <form action={promotePartnerAction.bind(null, p.id)}>
                <button className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">
                  Promote to active partner
                </button>
              </form>
            )}
            {p.status !== "ARCHIVED" ? (
              <form action={archivePartnerAction.bind(null, p.id)}>
                <button className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-400 hover:text-red-600">
                  Archive
                </button>
              </form>
            ) : (
              <form action={restorePartnerAction.bind(null, p.id)}>
                <button className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">
                  Restore{p.prevStatus === "ACTIVE" ? " as active partner" : " as prospect"}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-1 overflow-x-auto pb-1">
          {PIPELINE_STAGES.map((s) => {
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
        pipelineStages={PIPELINE_STAGES.map((s) => ({ stage: s.stage, name: s.name }))}
        taxonomy={taxonomy}
        guide={
          <div className="space-y-5">
            <PartnerStageGuidancePanel partner={p} />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <Card title={`Todos (${openTodos.length} open)`}>
                <form action={createTodoAction} className="flex gap-2 mb-4">
                  <input type="hidden" name="partnerId" value={p.id} />
                  <input name="title" required placeholder="Add todo…" className={input} />
                  <input name="dueDate" type="date" className="rounded-lg border border-zinc-200 px-2 py-2 text-sm w-36 shrink-0" />
                  <button className="rounded-lg bg-zinc-900 text-white px-3 py-2 text-sm shrink-0 hover:bg-zinc-700">+</button>
                </form>
                <TodoList todos={p.todos} users={users} input={input} />
              </Card>
              <div className="space-y-5">
                <Card title="Profile gaps">
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
              <AiAddButton scope="profile" partnerId={p.id} label="✦ AI complete" variant="soft" />
              <ProfileEditor partner={p} users={users} taxonomy={taxonomy} />
            </div>

            <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-5">
              <h3 className="text-sm font-semibold text-indigo-800 mb-3">Joint value pattern</h3>
              <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
                {[
                  ["Partner offers", p.valuePartnerOffer],
                  ["FanRuan offers", p.valueFanruanOffer],
                  ["Customer gets", p.valueCustomerOutcome],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-xs text-zinc-500">{k}</dt>
                    <dd className={v ? "text-zinc-800 mt-1" : "text-zinc-300 mt-1"}>{v || "To be filled — edit Value pattern on the instance map above"}</dd>
                  </div>
                ))}
              </dl>
              {p.valuePattern && (
                <Badge tone="purple">{labelFromMap(labelMaps.VALUE_PATTERN, p.valuePattern)}</Badge>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <Card title="Positioning tags" className="lg:col-span-1">
                <dl className="space-y-3 text-sm">
                  {[
                    ["Tier", p.tier ? `Tier ${p.tier}` : null],
                    ["Partner type", p.partnerArchetype ? labelFromMap(labelMaps.ARCHETYPE, p.partnerArchetype) : null],
                    ["Competitive DNA", labelFromMap(labelMaps.CATEGORY, p.category)],
                    ["Primary industry", industryCodes.length ? labelsFromMap(labelMaps.INDUSTRY, industryCodes) : null],
                    ["Dedicated headcount", p.dedicatedHeadcount],
                    ["Sales", p.salesUser?.name ?? p.owner?.name],
                    ["Pre-sales", p.presalesUser?.name],
                    ["Priority", p.priority],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex justify-between gap-3">
                      <dt className="text-zinc-400 shrink-0">{k}</dt>
                      <dd className={`text-right ${v ? "text-zinc-800" : "text-zinc-300"}`}>{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
              <Card title="Company profile" className="lg:col-span-2">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {[
                    ["Company size", p.headcount],
                    ["Core business", p.coreBusiness],
                    ["Core capabilities", p.capability],
                    ["Current tools", p.currentTools],
                    ["Known clients", p.knownClients],
                    ["Best outreach channel", p.bestChannel],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <dt className="text-xs text-zinc-400">{k}</dt>
                      <dd className={v ? "text-zinc-800 mt-0.5" : "text-zinc-300 mt-0.5"}>{v || "To be filled"}</dd>
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
            title={`Opportunities (${p.opportunities.filter((o) => o.status === "ACTIVE").length} active)`}
            actions={<AiAddButton scope="opportunity" partnerId={p.id} label="✦ AI add opportunity" variant="soft" />}
          >
            <OpportunityList partnerId={p.id} opportunities={p.opportunities} input={input} />
          </Card>
        }
        capability={
          <div className="space-y-5">
            <Card title={`Training & certification (${p.trainings.length})`}>
              <TrainingList partnerId={p.id} trainings={p.trainings} input={input} />
            </Card>
            <PartnerSolutionsSection partnerId={p.id} solutions={p.solutions} />
          </div>
        }
        relationship={
          <div className="space-y-5">
            <Card
              title={`Power map (${p.contacts.length} people)`}
              actions={<AiAddButton scope="powermap" partnerId={p.id} label="✦ AI add contact" variant="soft" />}
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
            <Card title={`Activity timeline (${p.events.length})`}>
              <form action={addNoteAction.bind(null, p.id)} className="flex gap-2 mb-5">
                <input name="content" required placeholder="Log activity or touchpoint…" className={input} />
                <select name="type" className="rounded-lg border border-zinc-200 px-2 py-2 text-sm shrink-0">
                  <option value="NOTE">Note</option>
                  <option value="NEWS">External news</option>
                </select>
                <button className="rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm shrink-0 hover:bg-zinc-700">Log</button>
              </form>
              <TimelineList events={p.events} />
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
}: {
  todos: (TodoItem & { assignee: User | null })[];
  users: User[];
  input: string;
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
                {fmtDate(t.dueDate)}{overdue && " overdue"}
              </span>
            )}
            {t.assignee && ` · ${t.assignee.name}`}
            {` · ${TODO_PRIORITY_LABELS[t.priority]}`}
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
            <button title="Delete" className="text-zinc-300 hover:text-red-500 text-sm opacity-60 group-hover:opacity-100">✕</button>
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
          <summary className="text-xs text-zinc-400 cursor-pointer list-none py-1">Completed ({doneTodos.length})</summary>
          <div className="space-y-2 mt-1">{doneTodos.map(renderTodo)}</div>
        </details>
      )}
      {todos.length === 0 && <EmptyState text="No todos yet" />}
    </div>
  );
}

function OpportunityList({
  partnerId,
  opportunities,
  input,
}: {
  partnerId: string;
  opportunities: Opportunity[];
  input: string;
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
                  {o.status === "ACTIVE" ? "Active" : o.status === "WON" ? "Won" : o.status === "LOST" ? "Lost" : "Paused"}
                </Badge>
                <Badge tone="blue">{o.stage}</Badge>
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">
                Client: {o.client ?? "—"} · Amount: {o.amount ?? "—"}
                {o.followUpAt && ` · Follow-up: ${fmtDate(o.followUpAt)}`}
              </div>
            </div>
            <span className="text-zinc-300 group-open:rotate-90 transition-transform">›</span>
          </summary>
          <div className="px-4 pb-4 pt-1 border-t border-zinc-50">
            <form action={upsertOpportunityAction.bind(null, partnerId)} className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              <input type="hidden" name="id" value={o.id} />
              <input name="name" defaultValue={o.name} className={input} />
              <input name="client" defaultValue={o.client ?? ""} placeholder="Client" className={input} />
              <input name="amount" defaultValue={o.amount ?? ""} placeholder="Amount" className={input} />
              <input name="stage" defaultValue={o.stage} placeholder="Stage" className={input} />
              <input name="nextStep" defaultValue={o.nextStep ?? ""} placeholder="Next step" className={input} />
              <input name="followUpAt" type="date" defaultValue={o.followUpAt ? new Date(o.followUpAt).toISOString().slice(0, 10) : ""} className={input} />
              <select name="status" defaultValue={o.status} className={input}>
                <option value="ACTIVE">Active</option>
                <option value="WON">Won</option>
                <option value="LOST">Lost</option>
                <option value="PAUSED">Paused</option>
              </select>
              <div className="col-span-2 md:col-span-3 flex justify-end gap-2">
                <button formAction={deleteOpportunityAction.bind(null, partnerId, o.id)} className="text-xs text-zinc-400 hover:text-red-600">Delete</button>
                <button className="rounded-md bg-zinc-900 text-white px-3 py-1.5 text-xs">Save</button>
              </div>
            </form>
          </div>
        </details>
      ))}
      {opportunities.length === 0 && <EmptyState text="No opportunities yet. At Stage 5+, bind at least 1 ACTIVE opportunity." />}
      <details className="rounded-lg border border-dashed border-zinc-200">
        <summary className="px-4 py-2.5 text-sm text-indigo-600 cursor-pointer list-none">+ Add opportunity</summary>
        <form action={upsertOpportunityAction.bind(null, partnerId)} className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          <input name="name" required placeholder="Opportunity name *" className={input} />
          <input name="client" placeholder="Client" className={input} />
          <input name="amount" placeholder="Amount" className={input} />
          <input name="stage" placeholder="Stage" className={input} />
          <input name="nextStep" placeholder="Next step" className={input} />
          <input name="followUpAt" type="date" className={input} />
          <div className="col-span-2 md:col-span-3 flex justify-end">
            <button className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-xs">Add</button>
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
}: {
  partnerId: string;
  trainings: Training[];
  input: string;
}) {
  return (
    <div className="space-y-2">
      {trainings.map((t) => (
        <form key={t.id} action={upsertTrainingAction.bind(null, partnerId)} className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm items-center">
          <input type="hidden" name="id" value={t.id} />
          <input name="person" defaultValue={t.person} className={input} />
          <input name="currentSkill" defaultValue={t.currentSkill ?? ""} placeholder="Current skill" className={input} />
          <input name="targetCert" defaultValue={t.targetCert ?? ""} placeholder="Target certification" className={input} />
          <input name="deadline" type="date" defaultValue={t.deadline ? new Date(t.deadline).toISOString().slice(0, 10) : ""} className={input} />
          <select name="status" defaultValue={t.status} className={input}>
            <option value="PLANNED">Planned</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="DONE">Completed</option>
          </select>
          <div className="flex gap-1 justify-end">
            <button className="rounded-md bg-zinc-900 text-white px-2.5 py-1.5 text-xs">Save</button>
            <button formAction={deleteTrainingAction.bind(null, partnerId, t.id)} className="text-xs text-zinc-400 hover:text-red-600 px-1">Del</button>
          </div>
        </form>
      ))}
      <details className="rounded-lg border border-dashed border-zinc-200">
        <summary className="px-4 py-2.5 text-sm text-indigo-600 cursor-pointer list-none">+ Add training plan</summary>
        <form action={upsertTrainingAction.bind(null, partnerId)} className="px-4 pb-4 grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
          <input name="person" required placeholder="Person *" className={input} />
          <input name="currentSkill" placeholder="Current skill" className={input} />
          <input name="targetCert" placeholder="Target certification" className={input} />
          <input name="deadline" type="date" className={input} />
          <button className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-xs">Add</button>
        </form>
      </details>
    </div>
  );
}

function TimelineList({
  events,
}: {
  events: (TimelineEvent & { createdBy: User | null })[];
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
              <Badge tone="zinc">{EVENT_TYPE_LABELS[e.type] ?? e.type}</Badge>
              <span className="text-xs text-zinc-400">
                {fmtDateTime(e.createdAt)}
                {e.createdBy && ` · ${e.createdBy.name}`}
              </span>
            </div>
            {e.content && <p className="text-sm text-zinc-600 mt-1 whitespace-pre-wrap leading-relaxed">{e.content}</p>}
          </div>
        </div>
      ))}
      {events.length === 0 && <EmptyState text="No activity yet" />}
    </div>
  );
}
