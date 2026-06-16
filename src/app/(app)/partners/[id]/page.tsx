import { notFound } from "next/navigation";
import type { Opportunity, TimelineEvent, TodoItem, Training, User } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, ScoreBar, fmtDate, fmtDateTime, tierTone } from "@/components/ui";
import {
  CATEGORY_LABELS, EVENT_TYPE_LABELS, PIPELINE_STAGES,
  POOL_FLAG_LABELS, STATUS_LABELS, TODO_PRIORITY_LABELS,
} from "@/lib/constants";
import { PowerMapSection } from "@/components/power-map-flow";
import { computeCompleteness, staleDays } from "@/lib/completeness";
import {
  PARTNER_ARCHETYPE_LABELS,
  VALUE_PATTERN_LABELS,
  buildPartnerInstanceMap,
} from "@/lib/partner-framework";
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
    where: { isTemplate: true, OR: [{ name: { contains: "会前" } }, { name: { contains: "联合" } }, { name: { contains: "动态" } }, { name: { contains: "舆情" } }] },
    select: { id: true, name: true, icon: true, description: true },
    orderBy: { name: "asc" },
  });
  const completeness = computeCompleteness(p);
  const stale = staleDays(p);
  const instanceMap = buildPartnerInstanceMap(p);
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
      {/* 顶栏：身份 + Pipeline */}
      <div className="px-8 pt-7 pb-5 border-b border-zinc-200/60 bg-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-zinc-900">{p.name}</h1>
              <Badge tone={p.status === "ACTIVE" ? "green" : p.status === "ARCHIVED" ? "zinc" : "blue"}>
                {STATUS_LABELS[p.status]}
              </Badge>
              {p.status === "PROSPECT" && <Badge tone="amber">{POOL_FLAG_LABELS[p.poolFlag]}</Badge>}
              {p.tier && <Badge tone={tierTone(p.tier)}>Tier {p.tier}</Badge>}
              {p.partnerArchetype && (
                <Badge tone="indigo">{PARTNER_ARCHETYPE_LABELS[p.partnerArchetype] ?? p.partnerArchetype}</Badge>
              )}
              {p.valuePattern && (
                <Badge tone="purple">{VALUE_PATTERN_LABELS[p.valuePattern] ?? p.valuePattern}</Badge>
              )}
              {stale > 30 && p.status === "ACTIVE" && <Badge tone="red">停滞 {stale} 天</Badge>}
            </div>
            <div className="text-sm text-zinc-500 mt-1.5">
              {[p.city, p.country].filter(Boolean).join(" · ") || "地区未知"}
              {p.website && (
                <>
                  {" · "}
                  <a href={`https://${p.website.replace(/^https?:\/\//, "")}`} target="_blank" className="text-indigo-600 hover:underline">
                    {p.website}
                  </a>
                </>
              )}
              {" · 负责人："}
              {p.owner?.name ?? "未指定"}
              {" · 档案完整度 "}
              {completeness.score}%
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AiAddButton
              scope="profile"
              partnerId={p.id}
              label="✦ AI 录入"
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            />
            {p.status === "PROSPECT" && (
              <form action={promotePartnerAction.bind(null, p.id)}>
                <button className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">
                  转为正式伙伴
                </button>
              </form>
            )}
            {p.status !== "ARCHIVED" ? (
              <form action={archivePartnerAction.bind(null, p.id)}>
                <button className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-400 hover:text-red-600">
                  归档
                </button>
              </form>
            ) : (
              <form action={restorePartnerAction.bind(null, p.id)}>
                <button className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">
                  恢复{p.prevStatus === "ACTIVE" ? "为正式伙伴" : "为候选"}
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
        guide={
          <div className="space-y-5">
            <PartnerStageGuidancePanel partner={p} />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <Card title={`待办（${openTodos.length} 项未完成）`}>
                <form action={createTodoAction} className="flex gap-2 mb-4">
                  <input type="hidden" name="partnerId" value={p.id} />
                  <input name="title" required placeholder="添加待办…" className={input} />
                  <input name="dueDate" type="date" className="rounded-lg border border-zinc-200 px-2 py-2 text-sm w-36 shrink-0" />
                  <button className="rounded-lg bg-zinc-900 text-white px-3 py-2 text-sm shrink-0 hover:bg-zinc-700">+</button>
                </form>
                <TodoList todos={p.todos} users={users} input={input} />
              </Card>
              <div className="space-y-5">
                <Card title="档案缺口">
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
              <AiAddButton scope="profile" partnerId={p.id} label="✦ AI 补全" variant="soft" />
              <ProfileEditor partner={p} users={users} />
            </div>

            <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-5">
              <h3 className="text-sm font-semibold text-indigo-800 mb-3">联合价值模式</h3>
              <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
                {[
                  ["伙伴提供", p.valuePartnerOffer],
                  ["帆软提供", p.valueFanruanOffer],
                  ["客户得到", p.valueCustomerOutcome],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-xs text-zinc-500">{k}</dt>
                    <dd className={v ? "text-zinc-800 mt-1" : "text-zinc-300 mt-1"}>{v || "待补充 — 点击上方实例地图「价值模式」编辑"}</dd>
                  </div>
                ))}
              </dl>
              {p.valuePattern && (
                <Badge tone="purple">{VALUE_PATTERN_LABELS[p.valuePattern] ?? p.valuePattern}</Badge>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <Card title="定位标签" className="lg:col-span-1">
                <dl className="space-y-3 text-sm">
                  {[
                    ["Tier", p.tier ? `Tier ${p.tier}` : null],
                    ["伙伴类型", p.partnerArchetype ? PARTNER_ARCHETYPE_LABELS[p.partnerArchetype] : null],
                    ["竞品基因", CATEGORY_LABELS[p.category]],
                    ["专职人数", p.dedicatedHeadcount],
                    ["负责 BD", p.owner?.name],
                    ["优先级", p.priority],
                    ["认证级别", p.certLevel],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex justify-between gap-3">
                      <dt className="text-zinc-400 shrink-0">{k}</dt>
                      <dd className={`text-right ${v ? "text-zinc-800" : "text-zinc-300"}`}>{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
              <Card title="公司画像" className="lg:col-span-2">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {[
                    ["公司规模", p.headcount],
                    ["公司类型", p.companyType],
                    ["核心业务", p.coreBusiness],
                    ["核心能力", p.capability],
                    ["现有 BI 工具", p.currentTools],
                    ["已知客户", p.knownClients],
                    ["关键差异化", p.keyDifferentiator],
                    ["最佳接触渠道", p.bestChannel],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <dt className="text-xs text-zinc-400">{k}</dt>
                      <dd className={v ? "text-zinc-800 mt-0.5" : "text-zinc-300 mt-0.5"}>{v || "待补充"}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </div>

            {(p.playbook || p.pitch) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {p.playbook && (
                  <Card title="playbook · 怎么打">
                    <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">{p.playbook}</p>
                  </Card>
                )}
                {p.pitch && (
                  <Card title="pitch · 30 秒话术">
                    <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">{p.pitch}</p>
                  </Card>
                )}
              </div>
            )}
          </div>
        }
        pipeline={
          <Card
            title={`商机列表（${p.opportunities.filter((o) => o.status === "ACTIVE").length} 个进行中）`}
            actions={<AiAddButton scope="opportunity" partnerId={p.id} label="✦ AI 加商机" variant="soft" />}
          >
            <OpportunityList partnerId={p.id} opportunities={p.opportunities} input={input} />
          </Card>
        }
        capability={
          <div className="space-y-5">
            <Card
              title={`培训认证（${p.trainings.length}）`}
              actions={<AiAddButton scope="training" partnerId={p.id} label="✦ AI 加培训" variant="soft" />}
            >
              <TrainingList partnerId={p.id} trainings={p.trainings} input={input} />
            </Card>
            <PartnerSolutionsSection partnerId={p.id} solutions={p.solutions} />
          </div>
        }
        relationship={
          <div className="space-y-5">
            <Card
              title={`权力地图（${p.contacts.length} 人）`}
              actions={<AiAddButton scope="powermap" partnerId={p.id} label="✦ AI 加人" variant="soft" />}
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
            <Card title={`动态时间线（${p.events.length}）`}>
              <form action={addNoteAction.bind(null, p.id)} className="flex gap-2 mb-5">
                <input name="content" required placeholder="记一条动态 / 接触记录…" className={input} />
                <select name="type" className="rounded-lg border border-zinc-200 px-2 py-2 text-sm shrink-0">
                  <option value="NOTE">笔记</option>
                  <option value="NEWS">外部动态</option>
                </select>
                <button className="rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm shrink-0 hover:bg-zinc-700">记录</button>
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
                {fmtDate(t.dueDate)}{overdue && " 已逾期"}
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
            <button title="删除" className="text-zinc-300 hover:text-red-500 text-sm opacity-60 group-hover:opacity-100">✕</button>
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
          <summary className="text-xs text-zinc-400 cursor-pointer list-none py-1">已完成 ({doneTodos.length})</summary>
          <div className="space-y-2 mt-1">{doneTodos.map(renderTodo)}</div>
        </details>
      )}
      {todos.length === 0 && <EmptyState text="暂无待办" />}
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
                  {o.status === "ACTIVE" ? "进行中" : o.status === "WON" ? "已赢单" : o.status === "LOST" ? "已丢单" : "暂停"}
                </Badge>
                <Badge tone="blue">{o.stage}</Badge>
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">
                客户：{o.client ?? "—"} · 金额：{o.amount ?? "—"}
                {o.followUpAt && ` · 跟进：${fmtDate(o.followUpAt)}`}
              </div>
            </div>
            <span className="text-zinc-300 group-open:rotate-90 transition-transform">›</span>
          </summary>
          <div className="px-4 pb-4 pt-1 border-t border-zinc-50">
            <form action={upsertOpportunityAction.bind(null, partnerId)} className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              <input type="hidden" name="id" value={o.id} />
              <input name="name" defaultValue={o.name} className={input} />
              <input name="client" defaultValue={o.client ?? ""} placeholder="客户" className={input} />
              <input name="amount" defaultValue={o.amount ?? ""} placeholder="金额" className={input} />
              <input name="stage" defaultValue={o.stage} placeholder="阶段" className={input} />
              <input name="nextStep" defaultValue={o.nextStep ?? ""} placeholder="下一步" className={input} />
              <input name="followUpAt" type="date" defaultValue={o.followUpAt ? new Date(o.followUpAt).toISOString().slice(0, 10) : ""} className={input} />
              <select name="status" defaultValue={o.status} className={input}>
                <option value="ACTIVE">进行中</option>
                <option value="WON">已赢单</option>
                <option value="LOST">已丢单</option>
                <option value="PAUSED">暂停</option>
              </select>
              <div className="col-span-2 md:col-span-3 flex justify-end gap-2">
                <button formAction={deleteOpportunityAction.bind(null, partnerId, o.id)} className="text-xs text-zinc-400 hover:text-red-600">删除</button>
                <button className="rounded-md bg-zinc-900 text-white px-3 py-1.5 text-xs">保存</button>
              </div>
            </form>
          </div>
        </details>
      ))}
      {opportunities.length === 0 && <EmptyState text="还没有商机。Stage 5+ 建议绑定至少 1 个 ACTIVE 商机。" />}
      <details className="rounded-lg border border-dashed border-zinc-200">
        <summary className="px-4 py-2.5 text-sm text-indigo-600 cursor-pointer list-none">+ 添加商机</summary>
        <form action={upsertOpportunityAction.bind(null, partnerId)} className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          <input name="name" required placeholder="商机名称 *" className={input} />
          <input name="client" placeholder="客户" className={input} />
          <input name="amount" placeholder="金额" className={input} />
          <input name="stage" placeholder="阶段" className={input} />
          <input name="nextStep" placeholder="下一步" className={input} />
          <input name="followUpAt" type="date" className={input} />
          <div className="col-span-2 md:col-span-3 flex justify-end">
            <button className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-xs">添加</button>
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
          <input name="currentSkill" defaultValue={t.currentSkill ?? ""} placeholder="当前能力" className={input} />
          <input name="targetCert" defaultValue={t.targetCert ?? ""} placeholder="目标认证" className={input} />
          <input name="deadline" type="date" defaultValue={t.deadline ? new Date(t.deadline).toISOString().slice(0, 10) : ""} className={input} />
          <select name="status" defaultValue={t.status} className={input}>
            <option value="PLANNED">待安排</option>
            <option value="IN_PROGRESS">进行中</option>
            <option value="DONE">已完成</option>
          </select>
          <div className="flex gap-1 justify-end">
            <button className="rounded-md bg-zinc-900 text-white px-2.5 py-1.5 text-xs">存</button>
            <button formAction={deleteTrainingAction.bind(null, partnerId, t.id)} className="text-xs text-zinc-400 hover:text-red-600 px-1">删</button>
          </div>
        </form>
      ))}
      <details className="rounded-lg border border-dashed border-zinc-200">
        <summary className="px-4 py-2.5 text-sm text-indigo-600 cursor-pointer list-none">+ 添加培训计划</summary>
        <form action={upsertTrainingAction.bind(null, partnerId)} className="px-4 pb-4 grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
          <input name="person" required placeholder="人员 *" className={input} />
          <input name="currentSkill" placeholder="当前能力" className={input} />
          <input name="targetCert" placeholder="目标认证" className={input} />
          <input name="deadline" type="date" className={input} />
          <button className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-xs">添加</button>
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
      {events.length === 0 && <EmptyState text="暂无动态" />}
    </div>
  );
}
