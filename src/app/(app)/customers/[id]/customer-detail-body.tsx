import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, fmtDate } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import { PowerMapSection } from "@/components/power-map-flow";
import { BusinessRecordsSection, BusinessRecordDialogButton } from "@/components/business-records-section";
import { CustomerWorkspaceShell, type CustomerTab } from "@/components/customer-workspace-shell";
import { AiAddButton } from "@/components/ai-add-button";
import { CustomerIntegrationsPanel } from "@/components/customer-integrations-panel";
import { MaterialsSection } from "@/components/materials-section";
import { TrainingList } from "@/components/training-list";
import { getAmmoConfigForClient } from "@/lib/ammo-config";
import { getWecomChatForCustomer } from "@/lib/wecom-chats";
import { CustomerProfilePanel } from "@/components/customer-profile-panel";
import { CustomerStockPanel } from "@/components/customer-stock-panel";
import { CustomerTodoRow } from "@/components/customer-todo-row";
import {
  upsertOpportunityAction,
  deleteOpportunityAction,
  upsertProjectAction,
  deleteProjectAction,
  convertOpportunityToProjectAction,
  addNoteAction,
  createTodoAction,
  deleteTodoAction,
} from "@/lib/actions";

export async function CustomerDetailBody({ id }: { id: string }) {
  const user = await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const c = m.customers;
  const pd = m.partnerDetail;

  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      partnerLinks: { include: { partner: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      owner: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      contacts: true,
      contactLinks: true,
      opportunities: {
        include: { partner: { select: { id: true, name: true } }, project: { select: { id: true } } },
        orderBy: { updatedAt: "desc" },
      },
      projects: {
        include: {
          partner: { select: { id: true, name: true } },
          todos: { orderBy: [{ status: "asc" }, { dueDate: "asc" }], include: { assignee: true } },
        },
        orderBy: { updatedAt: "desc" },
      },
      todos: { orderBy: [{ status: "asc" }, { dueDate: "asc" }], include: { assignee: true } },
      events: { orderBy: { createdAt: "desc" }, take: 100, include: { createdBy: { select: { name: true } } } },
      businessRecords: {
        orderBy: { occurredAt: "desc" },
        include: { createdBy: { select: { name: true } }, contact: { select: { name: true } } },
      },
      assets: { orderBy: { createdAt: "desc" } },
      trainings: { orderBy: { updatedAt: "desc" } },
    },
  });
  if (!customer) notFound();

  const [partners, users, wecomChat, matchedCrmCustomer, ammoConfig, linkedSolutions] = await Promise.all([
    db.partner.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ select: { id: true, name: true } }),
    getWecomChatForCustomer(id),
    customer.crmCustomerId
      ? db.crmCustomer.findUnique({
          where: { id: customer.crmCustomerId },
          select: { id: true, name: true, city: true, status: true, salesman: true },
        })
      : Promise.resolve(null),
    getAmmoConfigForClient(),
    db.solution.findMany({
      where: { partnerId: { in: customer.partnerLinks.map((l) => l.partner.id) } },
      orderBy: { updatedAt: "desc" },
      include: { assets: { include: { asset: true } } },
    }),
  ]);

  const owner = { kind: "customer" as const, id: customer.id };
  const contactOptions = customer.contacts.map((ct) => ({ id: ct.id, name: ct.name }));
  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";
  const openTodos = customer.todos.filter((t) => t.status !== "DONE").length;

  // 待办归属（机会/项目）名称查找，用于在待办行上打小标签
  const oppNameById = new Map(customer.opportunities.map((o) => [o.id, o.name] as const));
  const projNameById = new Map(customer.projects.map((p) => [p.id, p.name] as const));
  const todoTag = (t: { opportunityId?: string | null; projectId?: string | null }) => {
    if (t.projectId && projNameById.has(t.projectId)) return { label: `${c.belongsToProject}: ${projNameById.get(t.projectId)}` };
    if (t.opportunityId && oppNameById.has(t.opportunityId)) return { label: `${c.belongsToOpportunity}: ${oppNameById.get(t.opportunityId)}` };
    return null;
  };

  const phaseLabel = (p: string): string =>
    (({ KICKOFF: c.phaseKICKOFF, IMPLEMENT: c.phaseIMPLEMENT, ACCEPTANCE: c.phaseACCEPTANCE, GOLIVE: c.phaseGOLIVE, MAINTENANCE: c.phaseMAINTENANCE } as Record<string, string>)[p] ?? p);
  const projStatusLabel = (s: string): string =>
    (({ ACTIVE: c.projectStatusACTIVE, ON_HOLD: c.projectStatusON_HOLD, DONE: c.projectStatusDONE, CLOSED: c.projectStatusCLOSED } as Record<string, string>)[s] ?? s);

  // ============ 资料 ============
  const profilePanel = (
    <CustomerProfilePanel
      customer={{
        id: customer.id,
        name: customer.name,
        status: customer.status,
        industry: customer.industry,
        scale: customer.scale,
        city: customer.city,
        country: customer.country,
        website: customer.website,
        notes: customer.notes,
        ownerId: customer.ownerId,
        owner: customer.owner,
        boundPartners: customer.partnerLinks.map((l) => ({ id: l.partner.id, name: l.partner.name, relation: l.relation })),
        partnerRelation: customer.partnerRelation,
      }}
      users={users}
      partners={partners}
    />
  );

  // ============ 三连接 ============
  const integrationsPanel = (
    <CustomerIntegrationsPanel
      customerId={customer.id}
      customerName={customer.name}
      kmsRootPath={customer.kmsRootPath}
      crmCustomerId={customer.crmCustomerId}
      matchedCrmCustomer={matchedCrmCustomer}
      boundChat={wecomChat ? { chatId: wecomChat.chatId, chatType: wecomChat.chatType, label: wecomChat.label } : null}
    />
  );

  // ============ 待办 ============
  const todosContent = (
    <>
      <form action={createTodoAction} className="flex flex-wrap gap-2 mb-4">
        <input type="hidden" name="customerId" value={customer.id} />
        <input name="title" required placeholder={c.addTodoPlaceholder} className={`${input} flex-1 min-w-[140px]`} />
        {(customer.opportunities.length > 0 || customer.projects.length > 0) && (
          <select name="link" defaultValue="" className="rounded-lg border border-slate-200 px-2 py-2 text-sm shrink-0 max-w-[160px]">
            <option value="">{c.linkNone}</option>
            {customer.opportunities.length > 0 && (
              <optgroup label={c.belongsToOpportunity}>
                {customer.opportunities.map((o) => (
                  <option key={o.id} value={`opp:${o.id}`}>{o.name}</option>
                ))}
              </optgroup>
            )}
            {customer.projects.length > 0 && (
              <optgroup label={c.belongsToProject}>
                {customer.projects.map((p) => (
                  <option key={p.id} value={`proj:${p.id}`}>{p.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        )}
        <input name="dueDate" type="date" className="rounded-lg border border-slate-200 px-2 py-2 text-sm shrink-0" />
        <select name="assigneeId" defaultValue={customer.ownerId ?? user.id} className="rounded-lg border border-slate-200 px-2 py-2 text-sm shrink-0 max-w-[140px]">
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <button className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm shrink-0 hover:bg-slate-700">+</button>
      </form>
      <div className="divide-y divide-slate-50">
        {customer.todos.map((t) => (
          <CustomerTodoRow
            key={t.id}
            todo={t}
            customerId={customer.id}
            bcp47={bcp47}
            tag={todoTag(t)}
          />
        ))}
        {customer.todos.length === 0 && <EmptyState text={c.noTodos} />}
      </div>
    </>
  );

  const linkAssets = customer.assets.filter((a) => !(a.provider === "gdrive" && a.size > 0));

  // ============ 客户概览（三连接 + 商务记录 + 待办） ============
  const overviewPanel = (
    <div className="space-y-5">
      <BusinessRecordsSection owner={owner} records={customer.businessRecords} contacts={contactOptions} />
      <Card title={m.partnerDetail.todosOpen.replace("{count}", String(openTodos))}>
        {todosContent}
      </Card>
      {integrationsPanel}
    </div>
  );

  // ============ 能力建设（培训 + 材料） ============
  const capabilityPanel = (
    <div className="space-y-5">
      <Card title={pd.trainingCert.replace("{count}", String(customer.trainings.length))}>
        <TrainingList owner={{ customerId: customer.id }} trainings={customer.trainings} input={input} m={m} />
      </Card>
      <MaterialsSection
        customerId={customer.id}
        entityName={customer.name}
        folderUrl={customer.gdriveFolderUrl}
        browseReady={ammoConfig.gdriveServiceAccountConfigured}
        uploaderConnected={ammoConfig.gdriveUploaderConnected}
        solutions={linkedSolutions.map((s) => ({
        id: s.id,
        partnerId: s.partnerId,
        name: s.name,
        notes: s.notes,
        assets: s.assets,
      }))}
        solutionCopy={pd.solutionsSection}
        assets={linkAssets.map((a) => ({
          id: a.id,
          filename: a.filename,
          url: a.url,
          thumbnailUrl: a.thumbnailUrl,
          provider: a.provider,
        }))}
        copy={m.gdriveMaterials}
      />
    </div>
  );

  // ============ 商机推进 ============
  const opportunitiesPanel = (
    <div className="space-y-3">
      {customer.opportunities.map((o) => (
        <details key={o.id} className="group rounded-lg border border-slate-100 hover:border-slate-200">
          <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-900">{o.name}</span>
                <Badge tone={o.status === "ACTIVE" ? "green" : o.status === "WON" ? "indigo" : "zinc"}>
                  {o.status === "ACTIVE" ? m.common.active : o.status === "WON" ? m.common.won : o.status === "LOST" ? m.common.lost : m.common.paused}
                </Badge>
                <Badge tone="blue">{o.stage}</Badge>
                {o.dealType === "PRODUCT" && <Badge tone="amber">{c.dealTypeProduct}</Badge>}
                {o.dealType === "PROJECT" && <Badge tone="indigo">{c.dealTypeProject}</Badge>}
                {o.project && <Badge tone="indigo">{c.projectConverted}</Badge>}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {m.common.amount}: {o.amount ?? "—"}
                {o.partner && ` · ${c.viaPartner}: ${o.partner.name}`}
                {o.followUpAt && ` · ${m.partnerDetail.followUp}: ${fmtDate(o.followUpAt, bcp47)}`}
              </div>
            </div>
            <span className="text-slate-300 group-open:rotate-90">›</span>
          </summary>
          <div className="px-4 pb-4 pt-1 border-t border-slate-50">
            <form action={upsertOpportunityAction.bind(null, owner)} className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              <input type="hidden" name="id" value={o.id} />
              <input name="name" defaultValue={o.name} className={input} />
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
              <select name="dealType" defaultValue={o.dealType ?? ""} className={input}>
                <option value="">{c.dealTypeNone}</option>
                <option value="PROJECT">{c.dealTypeProject}</option>
                <option value="PRODUCT">{c.dealTypeProduct}</option>
              </select>
              <select name="partnerId" defaultValue={o.partnerId ?? ""} className={`${input} md:col-span-3`}>
                <option value="">{c.viaPartnerNone}</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div className="col-span-2 md:col-span-3 flex justify-end gap-2">
                <button formAction={deleteOpportunityAction.bind(null, owner, o.id)} className="text-xs text-slate-400 hover:text-red-600">{m.common.delete}</button>
                <button className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs">{m.common.save}</button>
              </div>
            </form>
            {!o.project && o.dealType !== "PRODUCT" && (
              <form action={convertOpportunityToProjectAction.bind(null, owner, o.id)} className="mt-2 flex items-center justify-end gap-2">
                <span className="text-[11px] text-slate-400">{c.convertHint}</span>
                <button className="rounded-md border border-indigo-200 bg-indigo-50 text-indigo-600 px-3 py-1.5 text-xs hover:bg-indigo-100">
                  {c.convertToProject}
                </button>
              </form>
            )}
            <form action={createTodoAction} className="mt-3 flex flex-wrap gap-2 border-t border-slate-50 pt-3">
              <input type="hidden" name="customerId" value={customer.id} />
              <input type="hidden" name="opportunityId" value={o.id} />
              <input name="title" required placeholder={c.addTodoPlaceholder} className={`${input} flex-1 min-w-[140px]`} />
              <input name="dueDate" type="date" className="rounded-lg border border-slate-200 px-2 py-2 text-sm shrink-0" />
              <select name="assigneeId" defaultValue={customer.ownerId ?? user.id} className="rounded-lg border border-slate-200 px-2 py-2 text-sm shrink-0 max-w-[140px]">
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <button className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm shrink-0 hover:bg-slate-700">+</button>
            </form>
          </div>
        </details>
      ))}
      {customer.opportunities.length === 0 && <EmptyState text={c.noOpportunities} />}
      <details className="rounded-lg border border-dashed border-slate-200">
        <summary className="px-4 py-2.5 text-sm text-sky-600 cursor-pointer list-none">{c.addOpportunity}</summary>
        <form action={upsertOpportunityAction.bind(null, owner)} className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          <input name="name" required placeholder={c.opportunityName} className={input} />
          <input name="amount" placeholder={m.common.amount} className={input} />
          <input name="stage" placeholder={m.common.stage} className={input} />
          <input name="nextStep" placeholder={m.common.nextStep} className={input} />
          <input name="followUpAt" type="date" className={input} />
          <select name="dealType" defaultValue="" className={input}>
            <option value="">{c.dealTypeNone}</option>
            <option value="PROJECT">{c.dealTypeProject}</option>
            <option value="PRODUCT">{c.dealTypeProduct}</option>
          </select>
          <select name="partnerId" defaultValue={customer.partnerLinks[0]?.partner.id ?? ""} className={input}>
            <option value="">{c.viaPartnerNone}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="col-span-2 md:col-span-3 flex justify-end">
            <button className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs">{m.common.add}</button>
          </div>
        </form>
      </details>
    </div>
  );

  // ============ 合作项目 ============
  const projectsPanel = (
    <div className="space-y-3">
      {customer.projects.map((p) => {
        const total = p.todos.length;
        const done = p.todos.filter((t) => t.status === "DONE").length;
        const pct = total ? Math.round((done / total) * 100) : 0;
        return (
          <details key={p.id} className="group rounded-lg border border-slate-100 hover:border-slate-200">
            <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-900">{p.name}</span>
                  <Badge tone="blue">{phaseLabel(p.phase)}</Badge>
                  <Badge tone={p.status === "ACTIVE" ? "green" : p.status === "DONE" ? "indigo" : "zinc"}>
                    {projStatusLabel(p.status)}
                  </Badge>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 max-w-[160px] rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[11px] text-slate-400">{c.projectProgress}: {done}/{total}</span>
                  {p.partner && <span className="text-[11px] text-slate-400">· {c.deliveryPartner}: {p.partner.name}</span>}
                </div>
              </div>
              <span className="text-slate-300 group-open:rotate-90">›</span>
            </summary>
            <div className="px-4 pb-4 pt-1 border-t border-slate-50">
              <form action={upsertProjectAction.bind(null, owner)} className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <input type="hidden" name="id" value={p.id} />
                <input name="name" defaultValue={p.name} className={input} />
                <input name="amount" defaultValue={p.amount ?? ""} placeholder={m.common.amount} className={input} />
                <select name="phase" defaultValue={p.phase} className={input}>
                  <option value="KICKOFF">{c.phaseKICKOFF}</option>
                  <option value="IMPLEMENT">{c.phaseIMPLEMENT}</option>
                  <option value="ACCEPTANCE">{c.phaseACCEPTANCE}</option>
                  <option value="GOLIVE">{c.phaseGOLIVE}</option>
                  <option value="MAINTENANCE">{c.phaseMAINTENANCE}</option>
                </select>
                <select name="status" defaultValue={p.status} className={input}>
                  <option value="ACTIVE">{c.projectStatusACTIVE}</option>
                  <option value="ON_HOLD">{c.projectStatusON_HOLD}</option>
                  <option value="DONE">{c.projectStatusDONE}</option>
                  <option value="CLOSED">{c.projectStatusCLOSED}</option>
                </select>
                <input name="startDate" type="date" defaultValue={p.startDate ? new Date(p.startDate).toISOString().slice(0, 10) : ""} className={input} placeholder={c.projectStartDate} />
                <input name="endDate" type="date" defaultValue={p.endDate ? new Date(p.endDate).toISOString().slice(0, 10) : ""} className={input} placeholder={c.projectEndDate} />
                <select name="partnerId" defaultValue={p.partnerId ?? ""} className={`${input} md:col-span-3`}>
                  <option value="">{c.deliveryPartnerNone}</option>
                  {partners.map((pp) => (
                    <option key={pp.id} value={pp.id}>{pp.name}</option>
                  ))}
                </select>
                <div className="col-span-2 md:col-span-3 flex justify-end gap-2">
                  <button formAction={deleteProjectAction.bind(null, owner, p.id)} className="text-xs text-slate-400 hover:text-red-600">{m.common.delete}</button>
                  <button className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs">{m.common.save}</button>
                </div>
              </form>

              <div className="mt-4 border-t border-slate-50 pt-3">
                <div className="text-xs font-semibold text-slate-500 mb-2">{c.projectTodos}</div>
                <form action={createTodoAction} className="flex flex-wrap gap-2 mb-3">
                  <input type="hidden" name="customerId" value={customer.id} />
                  <input type="hidden" name="projectId" value={p.id} />
                  <input name="title" required placeholder={c.addTodoPlaceholder} className={`${input} flex-1 min-w-[140px]`} />
                  <input name="dueDate" type="date" className="rounded-lg border border-slate-200 px-2 py-2 text-sm shrink-0" />
                  <select name="assigneeId" defaultValue={customer.ownerId ?? user.id} className="rounded-lg border border-slate-200 px-2 py-2 text-sm shrink-0 max-w-[140px]">
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <button className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm shrink-0 hover:bg-slate-700">+</button>
                </form>
                <div className="divide-y divide-slate-50">
                  {p.todos.map((t) => (
                    <CustomerTodoRow key={t.id} todo={t} customerId={customer.id} bcp47={bcp47} />
                  ))}
                  {p.todos.length === 0 && <EmptyState text={c.noTodos} />}
                </div>
              </div>
            </div>
          </details>
        );
      })}
      {customer.projects.length === 0 && <EmptyState text={c.noProjects} />}
      <details className="rounded-lg border border-dashed border-slate-200">
        <summary className="px-4 py-2.5 text-sm text-sky-600 cursor-pointer list-none">{c.addProject}</summary>
        <form action={upsertProjectAction.bind(null, owner)} className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          <input name="name" required placeholder={c.projectName} className={input} />
          <input name="amount" placeholder={m.common.amount} className={input} />
          <select name="phase" defaultValue="KICKOFF" className={input}>
            <option value="KICKOFF">{c.phaseKICKOFF}</option>
            <option value="IMPLEMENT">{c.phaseIMPLEMENT}</option>
            <option value="ACCEPTANCE">{c.phaseACCEPTANCE}</option>
            <option value="GOLIVE">{c.phaseGOLIVE}</option>
            <option value="MAINTENANCE">{c.phaseMAINTENANCE}</option>
          </select>
          <input name="startDate" type="date" className={input} placeholder={c.projectStartDate} />
          <input name="endDate" type="date" className={input} placeholder={c.projectEndDate} />
          <select name="partnerId" defaultValue={customer.partnerLinks[0]?.partner.id ?? ""} className={input}>
            <option value="">{c.deliveryPartnerNone}</option>
            {partners.map((pp) => (
              <option key={pp.id} value={pp.id}>{pp.name}</option>
            ))}
          </select>
          <div className="col-span-2 md:col-span-3 flex justify-end">
            <button className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs">{m.common.add}</button>
          </div>
        </form>
      </details>
    </div>
  );

  // ============ 关系经营（权力地图 + 时间线） ============
  const relationshipPanel = (
    <div className="space-y-6">
      <Card title={pd.powerMap.replace("{count}", String(customer.contacts.length))}>
        <PowerMapSection
          owner={owner}
          toolbarExtra={
            <AiAddButton
              scope="powermap"
              customerId={customer.id}
              label={pd.aiAddContact}
              variant="soft"
            />
          }
          contacts={customer.contacts.map((ct) => ({
            id: ct.id, name: ct.name, role: ct.role, title: ct.title,
            department: ct.department, attitude: ct.attitude, reportsToId: ct.reportsToId,
            x: ct.x, y: ct.y,
            contactInfo: ct.contactInfo, approach: ct.approach, notes: ct.notes,
          }))}
          links={customer.contactLinks.map((l) => ({
            id: l.id, subordinateId: l.subordinateId, superiorId: l.superiorId, kind: l.kind,
          }))}
        />
      </Card>
      <div className="border-t border-slate-100 pt-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-800">{c.timeline.replace("{count}", String(customer.events.length))}</h3>
          <BusinessRecordDialogButton owner={owner} contacts={contactOptions} />
        </div>
        <form action={addNoteAction.bind(null, owner)} className="flex gap-2 mb-5">
          <input name="content" required placeholder={c.logActivityPlaceholder} className={input} />
          <select name="type" className="rounded-lg border border-slate-200 px-2 py-2 text-sm shrink-0">
            <option value="NOTE">{m.common.note}</option>
            <option value="NEWS">{m.common.externalNews}</option>
          </select>
          <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm shrink-0 hover:bg-slate-700">{m.common.log}</button>
        </form>
        <div className="space-y-3">
          {customer.events.map((e) => (
            <div key={e.id} className="flex gap-3">
              <div className="mt-1.5 w-2 h-2 rounded-full bg-slate-300 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm text-slate-800">{e.title}</div>
                {e.content && <div className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">{e.content}</div>}
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {fmtDate(e.createdAt, bcp47)}{e.createdBy && ` · ${e.createdBy.name}`}
                </div>
              </div>
            </div>
          ))}
          {customer.events.length === 0 && <EmptyState text={c.noTimeline} />}
        </div>
      </div>
    </div>
  );

  // ============ 跟单五问（STOCK） ============
  const sq = c.stock;
  const stockSteps = [
    { letter: "S", word: "Situation", name: sq.situationLabel, desc: sq.situationDesc, placeholder: sq.situationPlaceholder, field: "q5Situation", value: customer.q5Situation },
    { letter: "T", word: "Trouble", name: sq.troubleLabel, desc: sq.troubleDesc, placeholder: sq.troublePlaceholder, field: "q5Trouble", value: customer.q5Trouble },
    { letter: "O", word: "Order", name: sq.orderLabel, desc: sq.orderDesc, placeholder: sq.orderPlaceholder, field: "q5Order", value: customer.q5Order },
    { letter: "C", word: "Cost", name: sq.costLabel, desc: sq.costDesc, placeholder: sq.costPlaceholder, field: "q5Cost", value: customer.q5Cost },
    { letter: "K", word: "Key", name: sq.keyLabel, desc: sq.keyDesc, placeholder: sq.keyPlaceholder, field: "q5Key", value: customer.q5Key },
  ];
  const stockFilled = stockSteps.filter((s) => s.value && s.value.trim()).length;
  const stockPanel = (
    <CustomerStockPanel customerId={customer.id} customerName={customer.name} steps={stockSteps} />
  );

  const profileAndStockPanel = (
    <div className="space-y-8">
      {profilePanel}
      <div className="border-t border-slate-100 pt-8">{stockPanel}</div>
    </div>
  );

  const tabs: CustomerTab[] = [
    {
      id: "overview",
      label: c.tabOverview,
      desc: c.tabOverviewDesc,
      badge: openTodos ? String(openTodos) : null,
      content: overviewPanel,
    },
    {
      id: "profile",
      label: c.tabProfile,
      desc: c.tabProfileDesc,
      badge: stockFilled ? `${stockFilled}/5` : null,
      content: profileAndStockPanel,
    },
    {
      id: "opportunities",
      label: c.tabOpportunities,
      desc: c.tabOpportunitiesDesc,
      badge: customer.opportunities.length ? String(customer.opportunities.length) : null,
      content: opportunitiesPanel,
    },
    {
      id: "projects",
      label: c.tabProjects,
      desc: c.tabProjectsDesc,
      badge: customer.projects.length ? String(customer.projects.length) : null,
      content: projectsPanel,
    },
    {
      id: "capability",
      label: c.tabCapability,
      desc: c.tabCapabilityDesc,
      badge:
        customer.trainings.length + linkAssets.length + linkedSolutions.length > 0
          ? String(customer.trainings.length + linkAssets.length + linkedSolutions.length)
          : null,
      content: capabilityPanel,
    },
    {
      id: "relationship",
      label: c.tabRelationship,
      desc: c.tabRelationshipDesc,
      badge: customer.contacts.length ? String(customer.contacts.length) : null,
      content: relationshipPanel,
    },
  ];

  return <CustomerWorkspaceShell tabs={tabs} />;
}
