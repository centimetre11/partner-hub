import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, ScoreBar, fmtDate, fmtDateTime, tierTone } from "@/components/ui";
import {
  ATTITUDE_LABELS, CATEGORY_LABELS, CONTACT_ROLE_CODES, CONTACT_ROLE_LABELS,
  EVENT_TYPE_LABELS, PIPELINE_STAGES, POOL_FLAG_LABELS, STATUS_LABELS,
  TODO_PRIORITY_LABELS, attitudeLabel, stageName,
} from "@/lib/constants";
import { attitudeDotClass } from "@/components/power-map";
import { PowerMapFlow } from "@/components/power-map-flow";
import { computeCompleteness, staleDays } from "@/lib/completeness";
import {
  addNoteAction, archivePartnerAction, createTodoAction, deleteContactAction,
  deleteOpportunityAction, deleteTodoAction, deleteTrainingAction, promotePartnerAction,
  restorePartnerAction, setPipelineStageAction, toggleTodoAction, updatePartnerAction,
  upsertContactAction, upsertOpportunityAction, upsertTrainingAction,
} from "@/lib/actions";
import { ProfileEditor } from "./profile-editor";
import { AiPanel } from "./ai-panel";
import { PartnerSolutionsSection } from "@/components/partner-solutions-section";
import { PartnerAgentsPanel } from "@/components/partner-agents-panel";
import { AiAddButton } from "@/components/ai-add-button";

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
    where: { isTemplate: true, OR: [{ name: { contains: "会前" } }, { name: { contains: "联合" } }, { name: { contains: "动态" } }] },
    select: { id: true, name: true, icon: true, description: true },
    orderBy: { name: "asc" },
  });
  const completeness = computeCompleteness(p);
  const stale = staleDays(p);

  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="pb-16">
      {/* 头部 */}
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
              <Badge tone="zinc">{CATEGORY_LABELS[p.category]}</Badge>
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

        {/* Pipeline 十阶段 */}
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

      <div className="px-8 pt-6 grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* ===== 左侧 2/3 ===== */}
        <div className="xl:col-span-2 space-y-5">
          {/* 模块一：伙伴画像 */}
          <Card
            title="① 伙伴画像"
            actions={
              <div className="flex items-center gap-2">
                <AiAddButton scope="profile" partnerId={p.id} label="✦ AI 补全" variant="soft" />
                <ProfileEditor partner={p} users={users} />
              </div>
            }
          >
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 text-sm">
              {[
                ["公司规模", p.headcount],
                ["公司类型", p.companyType],
                ["核心业务", p.coreBusiness],
                ["核心能力", p.capability],
                ["现有BI工具", p.currentTools],
                ["认证级别", p.certLevel],
                ["已知客户", p.knownClients],
                ["关键差异化", p.keyDifferentiator],
                ["最佳接触渠道", p.bestChannel],
                ["契合度评分", p.fitScore != null ? `${p.fitScore}/10` : null],
                ["优先级", p.priority],
                ["人工核对", p.manualChecked ? "☑ 已核对" : "☐ 待核对"],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-xs text-zinc-400 mb-0.5">{k}</dt>
                  <dd className={v ? "text-zinc-800" : "text-zinc-300"}>{v || "待补充"}</dd>
                </div>
              ))}
            </dl>
            {(p.playbook || p.pitch) && (
              <div className="mt-4 pt-4 border-t border-zinc-100 space-y-3 text-sm">
                {p.playbook && (
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">核心打法 / 切入方案</div>
                    <p className="text-zinc-700 leading-relaxed">{p.playbook}</p>
                  </div>
                )}
                {p.pitch && (
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">话术</div>
                    <p className="text-zinc-700 leading-relaxed whitespace-pre-wrap">{p.pitch}</p>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* 模块二：权力地图 */}
          <Card
            title={`② 权力地图（${p.contacts.length} 人）`}
            actions={<AiAddButton scope="powermap" partnerId={p.id} label="✦ AI 加人" variant="soft" />}
          >
            {p.contacts.length > 0 && (
              <div className="mb-5 border-b border-zinc-100 pb-4">
                <PowerMapFlow
                  partnerId={p.id}
                  contacts={p.contacts.map((c) => ({
                    id: c.id, name: c.name, role: c.role, title: c.title,
                    department: c.department, attitude: c.attitude, reportsToId: c.reportsToId,
                    x: c.x, y: c.y,
                  }))}
                  links={p.contactLinks.map((l) => ({
                    id: l.id, subordinateId: l.subordinateId, superiorId: l.superiorId, kind: l.kind,
                  }))}
                />
              </div>
            )}
            <div className="space-y-3">
              {p.contacts.map((c) => (
                <details key={c.id} className="group rounded-lg border border-zinc-100 hover:border-zinc-200">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
                    <div className="relative shrink-0">
                      <div className="w-9 h-9 rounded-full bg-zinc-100 text-zinc-600 flex items-center justify-center text-sm font-semibold">
                        {c.name.slice(0, 1)}
                      </div>
                      <span
                        className={`absolute -top-1 -right-1.5 w-4.5 h-4.5 rounded-full text-[10px] font-bold flex items-center justify-center ${attitudeDotClass(c.attitude)}`}
                      >
                        {c.attitude}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-zinc-900">{c.name}</span>
                        <Badge tone={c.role === "DECISION_MAKER" || c.role === "APPROVER" ? "red" : "zinc"}>
                          {CONTACT_ROLE_CODES[c.role] ?? "I"} · {CONTACT_ROLE_LABELS[c.role] ?? c.role}
                        </Badge>
                        {c.title && <span className="text-xs text-zinc-500">{c.title}</span>}
                        {c.department && <span className="text-xs text-zinc-400">{c.department}</span>}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        态度：{attitudeLabel(c.attitude)}
                        {c.reportsToId && ` · 汇报给 ${p.contacts.find((x) => x.id === c.reportsToId)?.name ?? "?"}`}
                        {c.contactInfo && ` · ${c.contactInfo}`}
                      </div>
                    </div>
                    <span className="text-zinc-300 group-open:rotate-90 transition-transform">›</span>
                  </summary>
                  <div className="px-4 pb-4 pt-1 border-t border-zinc-50">
                    <form action={upsertContactAction.bind(null, p.id)} className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                      <input type="hidden" name="id" value={c.id} />
                      <input name="name" defaultValue={c.name} placeholder="姓名" className={input} />
                      <select name="role" defaultValue={c.role} className={input}>
                        {Object.entries(CONTACT_ROLE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{CONTACT_ROLE_CODES[k]} · {v}</option>
                        ))}
                      </select>
                      <select name="attitude" defaultValue={c.attitude} className={input}>
                        {Object.entries(ATTITUDE_LABELS).sort((a, b) => Number(b[0]) - Number(a[0])).map(([k, v]) => (
                          <option key={k} value={k}>{k} · {v}</option>
                        ))}
                      </select>
                      <input name="title" defaultValue={c.title ?? ""} placeholder="职位" className={input} />
                      <input name="department" defaultValue={c.department ?? ""} placeholder="部门" className={input} />
                      <select name="reportsToId" defaultValue={c.reportsToId ?? ""} className={input}>
                        <option value="">汇报上级（无 = 顶层）</option>
                        {p.contacts.filter((x) => x.id !== c.id).map((x) => (
                          <option key={x.id} value={x.id}>汇报给 {x.name}</option>
                        ))}
                      </select>
                      <input name="contactInfo" defaultValue={c.contactInfo ?? ""} placeholder="联系方式" className={input} />
                      <input name="approach" defaultValue={c.approach ?? ""} placeholder="最佳接触方式" className={input} />
                      <input name="notes" defaultValue={c.notes ?? ""} placeholder="备注" className={input} />
                      <div className="col-span-2 md:col-span-3 flex justify-end gap-2">
                        <button formAction={deleteContactAction.bind(null, p.id, c.id)} className="text-xs text-zinc-400 hover:text-red-600 px-2">
                          删除
                        </button>
                        <button className="rounded-md bg-zinc-900 text-white px-3 py-1.5 text-xs hover:bg-zinc-700">保存</button>
                      </div>
                    </form>
                  </div>
                </details>
              ))}
              {p.contacts.length === 0 && <EmptyState text="还没有关键人物。开会或导入聊天记录时 AI 会自动帮你建立权力地图。" />}

              <details className="rounded-lg border border-dashed border-zinc-200">
                <summary className="px-4 py-2.5 text-sm text-indigo-600 cursor-pointer list-none">+ 手动添加人物</summary>
                <form action={upsertContactAction.bind(null, p.id)} className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  <input name="name" required placeholder="姓名 *" className={input} />
                  <select name="role" className={input}>
                    {Object.entries(CONTACT_ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{CONTACT_ROLE_CODES[k]} · {v}</option>
                    ))}
                  </select>
                  <select name="attitude" defaultValue="0" className={input}>
                    {Object.entries(ATTITUDE_LABELS).sort((a, b) => Number(b[0]) - Number(a[0])).map(([k, v]) => (
                      <option key={k} value={k}>{k} · {v}</option>
                    ))}
                  </select>
                  <input name="title" placeholder="职位" className={input} />
                  <input name="department" placeholder="部门" className={input} />
                  <select name="reportsToId" className={input}>
                    <option value="">汇报上级（无 = 顶层）</option>
                    {p.contacts.map((x) => (
                      <option key={x.id} value={x.id}>汇报给 {x.name}</option>
                    ))}
                  </select>
                  <input name="contactInfo" placeholder="联系方式" className={input} />
                  <div className="col-span-2 md:col-span-3 flex justify-end">
                    <button className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-xs hover:bg-indigo-700">添加</button>
                  </div>
                </form>
              </details>
            </div>
          </Card>

          {/* 模块三/四：商机 Pipeline */}
          <Card
            title={`③ 商机跟踪（${p.opportunities.filter((o) => o.status === "ACTIVE").length} 个进行中）`}
            actions={<AiAddButton scope="opportunity" partnerId={p.id} label="✦ AI 加商机" variant="soft" />}
          >
            <div className="space-y-3">
              {p.opportunities.map((o) => (
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
                        {o.followUpAt && ` · 下次跟进：${fmtDate(o.followUpAt)}`}
                        {o.nextStep && ` · 下一步：${o.nextStep}`}
                      </div>
                    </div>
                    <span className="text-zinc-300 group-open:rotate-90 transition-transform">›</span>
                  </summary>
                  <div className="px-4 pb-4 pt-1 border-t border-zinc-50">
                    <form action={upsertOpportunityAction.bind(null, p.id)} className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                      <input type="hidden" name="id" value={o.id} />
                      <input name="name" defaultValue={o.name} className={input} />
                      <input name="client" defaultValue={o.client ?? ""} placeholder="客户" className={input} />
                      <input name="amount" defaultValue={o.amount ?? ""} placeholder="金额（如 $30K）" className={input} />
                      <input name="stage" defaultValue={o.stage} placeholder="阶段" className={input} />
                      <input name="nextStep" defaultValue={o.nextStep ?? ""} placeholder="下一步动作" className={input} />
                      <input name="followUpAt" type="date" defaultValue={o.followUpAt ? new Date(o.followUpAt).toISOString().slice(0, 10) : ""} className={input} />
                      <select name="status" defaultValue={o.status} className={input}>
                        <option value="ACTIVE">进行中</option>
                        <option value="WON">已赢单</option>
                        <option value="LOST">已丢单</option>
                        <option value="PAUSED">暂停</option>
                      </select>
                      <input name="notes" defaultValue={o.notes ?? ""} placeholder="备注" className={`${input} md:col-span-2`} />
                      <div className="col-span-2 md:col-span-3 flex justify-end gap-2">
                        <button formAction={deleteOpportunityAction.bind(null, p.id, o.id)} className="text-xs text-zinc-400 hover:text-red-600 px-2">
                          删除
                        </button>
                        <button className="rounded-md bg-zinc-900 text-white px-3 py-1.5 text-xs hover:bg-zinc-700">保存</button>
                      </div>
                    </form>
                  </div>
                </details>
              ))}
              {p.opportunities.length === 0 && <EmptyState text="还没有商机。每个商机一行，从线索到成交全程跟踪。" />}

              <details className="rounded-lg border border-dashed border-zinc-200">
                <summary className="px-4 py-2.5 text-sm text-indigo-600 cursor-pointer list-none">+ 添加商机</summary>
                <form action={upsertOpportunityAction.bind(null, p.id)} className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  <input name="name" required placeholder="商机名称 *" className={input} />
                  <input name="client" placeholder="客户" className={input} />
                  <input name="amount" placeholder="金额（如 $30K）" className={input} />
                  <input name="stage" placeholder="阶段（如 需求诊断）" className={input} />
                  <input name="nextStep" placeholder="下一步动作" className={input} />
                  <input name="followUpAt" type="date" className={input} />
                  <div className="col-span-2 md:col-span-3 flex justify-end">
                    <button className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-xs hover:bg-indigo-700">添加</button>
                  </div>
                </form>
              </details>
            </div>
          </Card>

          {/* 模块五：培训认证 */}
          <Card
            title={`④ 能力培训（${p.trainings.length}）`}
            actions={<AiAddButton scope="training" partnerId={p.id} label="✦ AI 加培训" variant="soft" />}
          >
            <div className="space-y-2">
              {p.trainings.map((t) => (
                <form key={t.id} action={upsertTrainingAction.bind(null, p.id)} className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm items-center">
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
                    <button formAction={deleteTrainingAction.bind(null, p.id, t.id)} className="text-xs text-zinc-400 hover:text-red-600 px-1">
                      删
                    </button>
                  </div>
                </form>
              ))}
              <details className="rounded-lg border border-dashed border-zinc-200">
                <summary className="px-4 py-2.5 text-sm text-indigo-600 cursor-pointer list-none">+ 添加培训计划（目标：FCA-FineBI / FCA-FineReport 认证）</summary>
                <form action={upsertTrainingAction.bind(null, p.id)} className="px-4 pb-4 grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                  <input name="person" required placeholder="人员 *" className={input} />
                  <input name="currentSkill" placeholder="当前能力" className={input} />
                  <input name="targetCert" placeholder="目标认证" className={input} />
                  <input name="deadline" type="date" className={input} />
                  <button className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-xs hover:bg-indigo-700">添加</button>
                </form>
              </details>
            </div>
          </Card>

          <PartnerSolutionsSection partnerId={p.id} solutions={p.solutions} />

          {/* 时间线 */}
          <Card title={`⑤ 动态时间线（${p.events.length}）`}>
            <form action={addNoteAction.bind(null, p.id)} className="flex gap-2 mb-5">
              <input name="content" required placeholder="记一条动态 / 接触记录 / 新闻…" className={input} />
              <select name="type" className="rounded-lg border border-zinc-200 px-2 py-2 text-sm shrink-0">
                <option value="NOTE">笔记</option>
                <option value="NEWS">外部动态</option>
              </select>
              <button className="rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm shrink-0 hover:bg-zinc-700">记录</button>
            </form>
            <div className="space-y-0">
              {p.events.map((e, i) => (
                <div key={e.id} className="flex gap-3 relative">
                  {i < p.events.length - 1 && <div className="absolute left-[5px] top-5 bottom-0 w-px bg-zinc-100" />}
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
              {p.events.length === 0 && <EmptyState text="暂无动态" />}
            </div>
          </Card>
        </div>

        {/* ===== 右侧 1/3 ===== */}
        <div className="space-y-5">
          {/* 信息完整度 */}
          <Card title="信息完整度">
            <ScoreBar score={completeness.score} />
            {completeness.missing.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-zinc-400 mb-2">缺失项（{completeness.missing.length}）</div>
                <div className="flex flex-wrap gap-1.5">
                  {completeness.missing.map((m) => (
                    <span key={m} className="text-xs px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">{m}</span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* AI 面板：补全助手 + 动态摘要 */}
          <AiPanel partnerId={p.id} missing={completeness.missing} />

          <PartnerAgentsPanel partnerId={p.id} agents={partnerAgents} templates={agentTemplates} />

          {/* 待办 */}
          <Card
            title={`待办（${p.todos.filter((t) => t.status === "OPEN").length} 项未完成）`}
          >
            <form action={createTodoAction} className="flex gap-2 mb-4">
              <input type="hidden" name="partnerId" value={p.id} />
              <input name="title" required placeholder="添加待办…" className={input} />
              <input name="dueDate" type="date" className="rounded-lg border border-zinc-200 px-2 py-2 text-sm w-36 shrink-0" />
              <button className="rounded-lg bg-zinc-900 text-white px-3 py-2 text-sm shrink-0 hover:bg-zinc-700">+</button>
            </form>
            <div className="space-y-2">
              {(() => {
                const openTodos = p.todos.filter((t) => t.status !== "DONE");
                const doneTodos = p.todos.filter((t) => t.status === "DONE");
                const renderTodo = (t: (typeof p.todos)[number]) => {
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
                      <form action={deleteTodoAction.bind(null, t.id)}>
                        <button
                          title="删除待办"
                          className="text-zinc-300 hover:text-red-500 text-sm transition-colors opacity-60 group-hover:opacity-100"
                        >
                          ✕
                        </button>
                      </form>
                    </div>
                  );
                };
                return (
                  <>
                    {openTodos.map(renderTodo)}
                    {doneTodos.length > 0 && (
                      <details open={openTodos.length === 0} className="group/done -mx-1">
                        <summary className="flex items-center gap-1.5 px-1 py-1.5 cursor-pointer select-none text-xs text-zinc-400 hover:text-zinc-600 list-none">
                          <span className="transition-transform group-open/done:rotate-90">▸</span>
                          已完成 ({doneTodos.length})
                        </summary>
                        <div className="space-y-2 mt-1">
                          {doneTodos.map(renderTodo)}
                        </div>
                      </details>
                    )}
                    {p.todos.length === 0 && <EmptyState text="暂无待办" />}
                  </>
                );
              })()}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
