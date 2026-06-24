import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, fmtDate } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { getServerI18n } from "@/lib/server-i18n";
import { buildCrmCustomerViewUrl } from "@/lib/crm";
import { PowerMapSection } from "@/components/power-map-flow";
import { BusinessRecordsSection, BusinessRecordDialogButton } from "@/components/business-records-section";
import { CustomerWorkspaceShell, type CustomerTab } from "@/components/customer-workspace-shell";
import { AiAddButton } from "@/components/ai-add-button";
import { CustomerIntegrationsPanel } from "@/components/customer-integrations-panel";
import { MaterialsSection } from "@/components/materials-section";
import { getAmmoConfigForClient } from "@/lib/ammo-config";
import { getWecomChatForCustomer } from "@/lib/wecom-chats";
import {
  updateCustomerAction,
  deleteCustomerAction,
  setCustomerPartnerAction,
  updateCustomerStockAction,
} from "@/lib/customer-actions";
import { CustomerTodoRow } from "@/components/customer-todo-row";
import {
  upsertOpportunityAction,
  deleteOpportunityAction,
  addNoteAction,
  createTodoAction,
  deleteTodoAction,
} from "@/lib/actions";

function statusTone(status: string): "green" | "blue" | "zinc" {
  if (status === "ACTIVE") return "green";
  if (status === "PROSPECT") return "blue";
  return "zinc";
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const c = m.customers;
  const pd = m.partnerDetail;
  const { id } = await params;

  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      partner: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      contacts: true,
      contactLinks: true,
      opportunities: { include: { partner: { select: { id: true, name: true } } }, orderBy: { updatedAt: "desc" } },
      todos: { orderBy: [{ status: "asc" }, { dueDate: "asc" }], include: { assignee: true } },
      events: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } },
      businessRecords: {
        orderBy: { occurredAt: "desc" },
        include: { createdBy: { select: { name: true } }, contact: { select: { name: true } } },
      },
      assets: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!customer) notFound();
  const ammoConfig = await getAmmoConfigForClient();

  const [partners, users, wecomChat, matchedCrmCustomer] = await Promise.all([
    db.partner.findMany({ where: { status: { not: "ARCHIVED" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ select: { id: true, name: true } }),
    getWecomChatForCustomer(id),
    customer.crmCustomerId
      ? db.crmCustomer.findUnique({
          where: { id: customer.crmCustomerId },
          select: { id: true, name: true, city: true, status: true, salesman: true },
        })
      : Promise.resolve(null),
  ]);

  const owner = { kind: "customer" as const, id: customer.id };
  const contactOptions = customer.contacts.map((ct) => ({ id: ct.id, name: ct.name }));
  const statusLabel = (s: string) =>
    s === "ACTIVE" ? c.statusActive : s === "PROSPECT" ? c.statusProspect : c.statusInactive;
  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";
  const openTodos = customer.todos.filter((t) => t.status !== "DONE").length;

  // ============ 资料 ============
  const profilePanel = (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <div className="xl:col-span-2">
        <form action={updateCustomerAction.bind(null, customer.id)} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm sm:col-span-2">
            <span className="text-xs text-slate-500">{c.colName}</span>
            <input name="name" defaultValue={customer.name} required className={input} />
          </label>
          <label className="text-sm">
            <span className="text-xs text-slate-500">{c.statusLabel}</span>
            <select name="status" defaultValue={customer.status} className={input}>
              <option value="ACTIVE">{c.statusActive}</option>
              <option value="PROSPECT">{c.statusProspect}</option>
              <option value="INACTIVE">{c.statusInactive}</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs text-slate-500">{c.ownerLabel}</span>
            <select name="ownerId" defaultValue={customer.ownerId ?? ""} className={input}>
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs text-slate-500">{c.industryLabel}</span>
            <input name="industry" defaultValue={customer.industry ?? ""} className={input} />
          </label>
          <label className="text-sm">
            <span className="text-xs text-slate-500">{c.scaleLabel}</span>
            <input name="scale" defaultValue={customer.scale ?? ""} className={input} />
          </label>
          <label className="text-sm">
            <span className="text-xs text-slate-500">{c.cityPlaceholder}</span>
            <input name="city" defaultValue={customer.city ?? ""} className={input} />
          </label>
          <label className="text-sm">
            <span className="text-xs text-slate-500">{c.countryPlaceholder}</span>
            <input name="country" defaultValue={customer.country ?? ""} className={input} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-xs text-slate-500">{c.websiteLabel}</span>
            <input name="website" defaultValue={customer.website ?? ""} className={input} />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-xs text-slate-500">{c.notesPlaceholder}</span>
            <textarea name="notes" defaultValue={customer.notes ?? ""} rows={3} className={input} />
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800">{c.save}</button>
          </div>
        </form>
      </div>

      <div className="space-y-5">
        <Card title={c.boundPartner}>
          {customer.partner ? (
            <div className="space-y-3">
              <Link href={`/partners/${customer.partner.id}`} className="block rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-sm font-medium text-emerald-900 hover:bg-emerald-50">
                {customer.partner.name}
                {customer.partnerRelation === "SELF" && (
                  <span className="ml-2 text-[10px] rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-700">{c.selfBadge}</span>
                )}
              </Link>
              <form action={setCustomerPartnerAction.bind(null, customer.id)}>
                <input type="hidden" name="partnerId" value="" />
                <button className="text-xs text-slate-400 hover:text-red-600">{c.unbind}</button>
              </form>
            </div>
          ) : (
            <form action={setCustomerPartnerAction.bind(null, customer.id)} className="space-y-2">
              <p className="text-sm text-slate-400">{c.notBound}</p>
              <select name="partnerId" defaultValue="" className={input}>
                <option value="">{c.selectPartner}</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800">{c.bindPartner}</button>
            </form>
          )}
        </Card>
      </div>
    </div>
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
          />
        ))}
        {customer.todos.length === 0 && <EmptyState text={c.noTodos} />}
      </div>
    </>
  );

  // ============ 客户概览（三连接 + 商务记录 + 待办） ============
  const overviewPanel = (
    <div className="space-y-5">
      <BusinessRecordsSection owner={owner} records={customer.businessRecords} contacts={contactOptions} />
      <Card title={m.partnerDetail.todosOpen.replace("{count}", String(openTodos))}>
        {todosContent}
      </Card>
      <MaterialsSection
        customerId={customer.id}
        folderUrl={customer.gdriveFolderUrl}
        uploaderConnected={ammoConfig.gdriveUploaderConnected}
        assets={customer.assets.map((a) => ({
          id: a.id,
          filename: a.filename,
          url: a.url,
          thumbnailUrl: a.thumbnailUrl,
          provider: a.provider,
        }))}
        copy={m.gdriveMaterials}
      />
      {integrationsPanel}
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
              <select name="partnerId" defaultValue={o.partnerId ?? ""} className={`${input} md:col-span-2`}>
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
          <select name="partnerId" defaultValue={customer.partnerId ?? ""} className={input}>
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
    <form action={updateCustomerStockAction.bind(null, customer.id)} className="space-y-5">
      <div className="space-y-4">
        {stockSteps.map((s) => (
          <div key={s.field} className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-start gap-3 px-4 py-3 bg-slate-50/60 border-b border-slate-100">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                {s.letter}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">
                  {s.name}
                  <span className="ml-2 text-[11px] font-normal text-slate-400">{s.word}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{s.desc}</p>
              </div>
            </div>
            <textarea
              name={s.field}
              defaultValue={s.value ?? ""}
              rows={3}
              placeholder={s.placeholder}
              className="w-full border-0 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-300 resize-y"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800">{sq.save}</button>
      </div>
    </form>
  );

  const tabs: CustomerTab[] = [
    {
      id: "overview",
      label: c.tabOverview,
      desc: c.tabOverviewDesc,
      badge: openTodos ? String(openTodos) : null,
      content: overviewPanel,
    },
    { id: "profile", label: c.tabProfile, desc: c.tabProfileDesc, content: profilePanel },
    {
      id: "stock",
      label: c.tabStock,
      desc: c.tabStockDesc,
      badge: stockFilled ? `${stockFilled}/5` : null,
      content: stockPanel,
    },
    {
      id: "opportunities",
      label: c.tabOpportunities,
      desc: c.tabOpportunitiesDesc,
      badge: customer.opportunities.length ? String(customer.opportunities.length) : null,
      content: opportunitiesPanel,
    },
    {
      id: "relationship",
      label: c.tabRelationship,
      desc: c.tabRelationshipDesc,
      badge: customer.contacts.length ? String(customer.contacts.length) : null,
      content: relationshipPanel,
    },
  ];

  return (
    <div className="pb-4">
      <div className="px-8 pt-5 sm:pt-7 pb-4 border-b border-slate-200/60 bg-white">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <BackButton fallbackHref="/customers" className="mt-1" />
            <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 break-words">{customer.name}</h1>
              <Badge tone={statusTone(customer.status)}>{statusLabel(customer.status)}</Badge>
              {customer.partner && (
                <Badge tone={customer.partnerRelation === "SELF" ? "indigo" : "zinc"}>
                  {customer.partnerRelation === "SELF" ? c.selfBadge : customer.partner.name}
                </Badge>
              )}
            </div>
            <div className="text-sm text-slate-500 mt-1.5">
              {[customer.city, customer.country].filter(Boolean).join(" · ") || m.common.unknownRegion}
              {customer.website && (
                <>
                  {" · "}
                  <a href={`https://${customer.website.replace(/^https?:\/\//, "")}`} target="_blank" className="text-sky-600 hover:underline">
                    {customer.website}
                  </a>
                </>
              )}
              {" · "}{c.createdAt} {fmtDate(customer.createdAt, bcp47)}
              {customer.createdBy && ` · ${customer.createdBy.name}`}
              {customer.crmCustomerId && (
                <>
                  {" · "}
                  <a
                    href={buildCrmCustomerViewUrl(customer.crmCustomerId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-600 hover:underline"
                  >
                    {m.integrations.openInCrm} ↗
                  </a>
                </>
              )}
            </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <form action={deleteCustomerAction.bind(null, customer.id)}>
              <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-400 hover:text-red-600">
                {m.common.delete}
              </button>
            </form>
          </div>
        </div>
      </div>

      <CustomerWorkspaceShell tabs={tabs} />
    </div>
  );
}
