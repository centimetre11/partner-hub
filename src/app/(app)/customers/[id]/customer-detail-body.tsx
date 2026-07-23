import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, fmtDate } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import { PowerMapLazy } from "@/components/power-map-lazy";
import { BusinessRecordsSection, BusinessRecordDialogButton } from "@/components/business-records-section";
import { BUSINESS_RECORD_PAGE_SIZE } from "@/lib/business-record-core";
import { CustomerWorkspaceShell, type CustomerTabMeta } from "@/components/customer-workspace-shell";
import type { CustomerTabId } from "@/lib/detail-tabs";
import { AiAddButton } from "@/components/ai-add-button";
import { CustomerIntegrationsPanel } from "@/components/customer-integrations-panel";
import { MaterialsSection } from "@/components/materials-section";
import { TrainingList } from "@/components/training-list";
import { getAmmoConfigForClient } from "@/lib/ammo-config";
import { getWecomChatForCustomer } from "@/lib/wecom-chats";
import { CustomerProfilePanel } from "@/components/customer-profile-panel";
import { CustomerStockPanel } from "@/components/customer-stock-panel";
import { CustomerProjectCard } from "@/components/customer-project-card";
import { CustomerTodoRow } from "@/components/customer-todo-row";
import { CreateTodoDrawer } from "@/components/create-todo-drawer";
import { encodeTodoOwnerRef } from "@/lib/todo-owner-select";
import { OpportunityProcessFields } from "@/components/opportunity-process-fields";
import { OpportunityProcessBadges } from "@/components/opportunity-process-badges";
import {
  OPPORTUNITY_STATUS_CODES,
  normalizeOpportunityStatus,
  opportunityStatusLabel,
  opportunityStatusTone,
} from "@/lib/opportunity-status";
import {
  upsertOpportunityAction,
  deleteOpportunityAction,
  upsertProjectAction,
  upsertContractAction,
  deleteContractAction,
  createProductMaintRenewalAction,
  createProjectMaintRenewalAction,
  convertOpportunityToProjectAction,
  addNoteAction,
  createTodoAction,
  deleteTodoAction,
} from "@/lib/actions";
import { MossCustomerSection } from "@/components/moss/moss-workflow-sections";
import { getMossConfigStatus } from "@/lib/moss";
import { parseMossDossier } from "@/lib/moss-dossier";
import { MOSS_ENABLED } from "@/lib/feature-flags";
import { getTaxonomyOptionsMany, type TaxonomyOptionRow } from "@/lib/taxonomy";
import { OpportunityStatusWithOutcome } from "@/components/opportunity-outcome-fields";
import { CustomerContractForm } from "@/components/customer-contract-form";
import { AmountInput } from "@/components/amount-input";
import { CustomerAddOpportunityForm } from "@/components/customer-add-opportunity-form";
import { CustomerAddProjectForm } from "@/components/customer-add-project-form";
import { CustomerAddContractForm } from "@/components/customer-add-contract-form";
import { PendingButton } from "@/components/pending-button";
import { formatAmountDisplay } from "@/lib/amount";
import {
  billingCycleLabel,
  contractStatusLabel,
  contractStatusTone,
  contractTypeLabel,
  contractTypeTone,
  isContractPastEnd,
} from "@/lib/contract-types";

export async function CustomerDetailBody({ id, tab }: { id: string; tab: CustomerTabId }) {
  const user = await requireUser();
  const { messages: m, bcp47, locale } = await getServerI18n();
  const c = m.customers;
  const pd = m.partnerDetail;

  const [customer, openTodosCount, users, partners, taxonomyByDim] = await Promise.all([
    db.customer.findUnique({
      where: { id },
      include: {
        partnerLinks: {
          include: { partner: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
        owner: { select: { id: true, name: true } },
        presalesUser: { select: { id: true, name: true } },
        satisfactionUser: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        _count: {
          select: {
            opportunities: true,
            contracts: true,
            projects: true,
            trainings: true,
            assets: true,
            contacts: true,
            businessRecords: true,
          },
        },
      },
    }),
    db.todoItem.count({ where: { customerId: id, status: { not: "DONE" } } }),
    db.user.findMany({ select: { id: true, name: true, role: true } }),
    db.partner.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getTaxonomyOptionsMany([
      "CUSTOMER_SEGMENT",
      "WIN_FACTOR",
      "LOSS_REASON",
      "BUYING_TRIGGER",
      "ENTRY_PATH",
      "ICP_TIER",
    ]),
  ]);
  if (!customer) notFound();

  const segmentOptions = taxonomyByDim.CUSTOMER_SEGMENT ?? [];
  const winFactorOptions = taxonomyByDim.WIN_FACTOR ?? [];
  const lossReasonOptions = taxonomyByDim.LOSS_REASON ?? [];
  const buyingTriggerOptions = taxonomyByDim.BUYING_TRIGGER ?? [];
  const entryPathOptions = taxonomyByDim.ENTRY_PATH ?? [];

  const sq = c.stock;
  const stockSteps = [
    { letter: "S", word: "Situation", name: sq.situationLabel, desc: sq.situationDesc, placeholder: sq.situationPlaceholder, field: "q5Situation", value: customer.q5Situation },
    { letter: "T", word: "Trouble", name: sq.troubleLabel, desc: sq.troubleDesc, placeholder: sq.troublePlaceholder, field: "q5Trouble", value: customer.q5Trouble },
    { letter: "O", word: "Order", name: sq.orderLabel, desc: sq.orderDesc, placeholder: sq.orderPlaceholder, field: "q5Order", value: customer.q5Order },
    { letter: "C", word: "Cost", name: sq.costLabel, desc: sq.costDesc, placeholder: sq.costPlaceholder, field: "q5Cost", value: customer.q5Cost },
    { letter: "K", word: "Key", name: sq.keyLabel, desc: sq.keyDesc, placeholder: sq.keyPlaceholder, field: "q5Key", value: customer.q5Key },
  ];
  const stockFilled = stockSteps.filter((s) => s.value && s.value.trim()).length;

  const capabilityBadgeCount = customer._count.trainings + customer._count.assets;

  const tabMetas: CustomerTabMeta[] = [
    {
      id: "overview",
      label: c.tabOverview,
      desc: c.tabOverviewDesc,
      badge: openTodosCount ? String(openTodosCount) : null,
    },
    {
      id: "profile",
      label: c.tabProfile,
      desc: c.tabProfileDesc,
      badge: stockFilled ? `${stockFilled}/5` : null,
    },
    {
      id: "opportunities",
      label: c.tabOpportunities,
      desc: c.tabOpportunitiesDesc,
      badge: customer._count.opportunities ? String(customer._count.opportunities) : null,
    },
    {
      id: "contracts",
      label: c.tabContracts,
      desc: c.tabContractsDesc,
      badge: customer._count.contracts ? String(customer._count.contracts) : null,
    },
    {
      id: "projects",
      label: c.tabProjects,
      desc: c.tabProjectsDesc,
      badge: customer._count.projects ? String(customer._count.projects) : null,
    },
    {
      id: "capability",
      label: c.tabCapability,
      desc: c.tabCapabilityDesc,
      badge: capabilityBadgeCount > 0 ? String(capabilityBadgeCount) : null,
    },
    {
      id: "relationship",
      label: c.tabRelationship,
      desc: c.tabRelationshipDesc,
      badge: customer._count.contacts ? String(customer._count.contacts) : null,
    },
  ];

  return (
    <CustomerWorkspaceShell tabs={tabMetas} activeTab={tab}>
      <Suspense
        key={tab}
        fallback={
          <div className="space-y-4">
            <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="h-36 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-36 animate-pulse rounded-lg bg-slate-100" />
            </div>
          </div>
        }
      >
        <CustomerTabContent
          id={id}
          tab={tab}
          customer={customer}
          users={users}
          partners={partners}
          openTodosCount={openTodosCount}
          segmentOptions={segmentOptions}
          winFactorOptions={winFactorOptions}
          lossReasonOptions={lossReasonOptions}
          buyingTriggerOptions={buyingTriggerOptions}
          entryPathOptions={entryPathOptions}
          stockSteps={stockSteps}
          stockFilled={stockFilled}
        />
      </Suspense>
    </CustomerWorkspaceShell>
  );
}

async function CustomerTabContent({
  id,
  tab,
  customer,
  users,
  partners,
  openTodosCount,
  segmentOptions = [],
  winFactorOptions = [],
  lossReasonOptions = [],
  buyingTriggerOptions = [],
  entryPathOptions = [],
  stockSteps,
  stockFilled,
}: {
  id: string;
  tab: CustomerTabId;
  // Shell row from always-load query; tab panels pick the fields they need.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customer: any;
  users: { id: string; name: string; role: string }[];
  partners: { id: string; name: string }[];
  openTodosCount: number;
  segmentOptions?: TaxonomyOptionRow[];
  winFactorOptions?: TaxonomyOptionRow[];
  lossReasonOptions?: TaxonomyOptionRow[];
  buyingTriggerOptions?: TaxonomyOptionRow[];
  entryPathOptions?: TaxonomyOptionRow[];
  stockSteps: {
    letter: string;
    word: string;
    name: string;
    desc: string;
    placeholder: string;
    field: string;
    value: string | null;
  }[];
  stockFilled: number;
}) {
  const user = await requireUser();
  const { messages: m, bcp47, locale } = await getServerI18n();
  const c = m.customers;
  const pd = m.partnerDetail;
  const owner = { kind: "customer" as const, id: customer.id };
  const input =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  let tabContent: ReactNode;

  switch (tab) {
    case "overview": {
      const [businessRecords, todos, contacts, wecomChat, matchedCrmCustomer, mossStatus, customers] =
        await Promise.all([
          db.businessRecord.findMany({
            where: { customerId: id },
            orderBy: { occurredAt: "desc" },
            take: BUSINESS_RECORD_PAGE_SIZE,
            include: {
              createdBy: { select: { name: true } },
              contact: { select: { name: true } },
            },
          }),
          db.todoItem.findMany({
            where: { customerId: id },
            orderBy: [{ status: "asc" }, { dueDate: "asc" }],
            include: {
              assignee: true,
              opportunity: { select: { id: true, name: true } },
              project: { select: { id: true, name: true } },
            },
          }),
          db.contact.findMany({
            where: { customerId: id },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          getWecomChatForCustomer(id),
          customer.crmCustomerId
            ? db.crmCustomer.findUnique({
                where: { id: customer.crmCustomerId },
                select: { id: true, name: true, city: true, status: true, salesman: true, presales: true },
              })
            : Promise.resolve(null),
          MOSS_ENABLED ? getMossConfigStatus() : Promise.resolve({ configured: false }),
          db.customer.findMany({
            where: { status: { in: ["ACTIVE", "PROSPECT"] } },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
        ]);

      const initialMossDossier = MOSS_ENABLED ? parseMossDossier(customer.mossSnapshot) : null;
      const contactOptions = contacts.map((ct) => ({ id: ct.id, name: ct.name }));

      const todoTag = (t: {
        project?: { id: string; name: string } | null;
        opportunity?: { id: string; name: string } | null;
      }) => {
        if (t.project) return { label: `${c.belongsToProject}: ${t.project.name}` };
        if (t.opportunity) return { label: `${c.belongsToOpportunity}: ${t.opportunity.name}` };
        return null;
      };

      tabContent = (
        <div className="space-y-5">
          {MOSS_ENABLED && (
            <MossCustomerSection
              customerId={customer.id}
              entityName={customer.name}
              creditCode={customer.creditCode}
              mossSyncedAt={customer.mossSyncedAt?.toISOString() ?? null}
              initialDossier={initialMossDossier}
              configured={mossStatus.configured}
            />
          )}
          <BusinessRecordsSection
            owner={owner}
            records={businessRecords}
            totalCount={customer._count.businessRecords}
            contacts={contactOptions}
          />
          <Card
            title={m.partnerDetail.todosOpen.replace("{count}", String(openTodosCount))}
            actions={
              <CreateTodoDrawer
                userId={user.id}
                partners={partners}
                customers={customers}
                users={users}
                defaultOwnerRef={encodeTodoOwnerRef("customer", customer.id)}
              />
            }
          >
            <div className="divide-y divide-slate-50">
              {todos.map((t) => (
                <CustomerTodoRow
                  key={t.id}
                  todo={t}
                  customerId={customer.id}
                  bcp47={bcp47}
                  tag={todoTag(t)}
                />
              ))}
              {todos.length === 0 && <EmptyState text={c.noTodos} />}
            </div>
          </Card>
          <CustomerIntegrationsPanel
            customerId={customer.id}
            customerName={customer.name}
            kmsRootPath={customer.kmsRootPath}
            crmCustomerId={customer.crmCustomerId}
            matchedCrmCustomer={matchedCrmCustomer}
            boundChat={
              wecomChat ? { chatId: wecomChat.chatId, chatType: wecomChat.chatType, label: wecomChat.label } : null
            }
          />
        </div>
      );
      break;
    }

    case "profile": {
      tabContent = (
        <div className="space-y-8">
          <CustomerProfilePanel
            customer={{
              id: customer.id,
              name: customer.name,
              status: customer.status,
              industry: customer.industry,
              customerSegment: customer.customerSegment,
              buyingTrigger: customer.buyingTrigger,
              entryPath: customer.entryPath,
              tier: customer.tier,
              icpTier: customer.icpTier,
              scale: customer.scale,
              city: customer.city,
              country: customer.country,
              website: customer.website,
              notes: customer.notes,
              ownerId: customer.ownerId,
              owner: customer.owner,
              presalesUserId: customer.presalesUserId,
              presalesUser: customer.presalesUser,
              satisfactionUserId: customer.satisfactionUserId,
              satisfactionUser: customer.satisfactionUser,
              boundPartners: customer.partnerLinks.map(
                (l: { partner: { id: string; name: string }; relation: string }) => ({
                  id: l.partner.id,
                  name: l.partner.name,
                  relation: l.relation,
                }),
              ),
              partnerRelation: customer.partnerRelation,
            }}
            users={users}
            partners={partners}
            segmentOptions={{
              customerSegment: segmentOptions,
              buyingTrigger: buyingTriggerOptions,
              entryPath: entryPathOptions,
            }}
          />
          <div className="border-t border-slate-100 pt-8">
            <CustomerStockPanel customerId={customer.id} customerName={customer.name} steps={stockSteps} />
          </div>
        </div>
      );
      break;
    }

    case "opportunities": {
      const opportunities = await db.opportunity.findMany({
        where: { customerId: id },
        include: {
          partner: { select: { id: true, name: true } },
          project: { select: { id: true } },
        },
        orderBy: { updatedAt: "desc" },
      });

      const oppStatusOptions = OPPORTUNITY_STATUS_CODES.map((code) => ({
        value: code,
        label: opportunityStatusLabel(code, locale),
      }));

      tabContent = (
        <div className="space-y-3">
          {opportunities.map((o) => (
            <details key={o.id} className="group rounded-lg border border-slate-100 hover:border-slate-200">
              <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900">{o.name}</span>
                    <Badge tone={opportunityStatusTone(o.status)}>
                      {opportunityStatusLabel(o.status, locale)}
                    </Badge>
                    <OpportunityProcessBadges
                      stage={o.stage}
                      nextStep={o.nextStep}
                      locale={locale}
                      nextPrefix={m.opportunities.nextProcessPrefix}
                    />
                    {o.dealType === "PRODUCT" && <Badge tone="amber">{c.dealTypeProduct}</Badge>}
                    {o.dealType === "PROJECT" && <Badge tone="indigo">{c.dealTypeProject}</Badge>}
                    {o.project && <Badge tone="indigo">{c.projectConverted}</Badge>}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {m.common.amount}: {formatAmountDisplay(o.amount, o.currency, locale)}
                    {o.partner && ` · ${c.viaPartner}: ${o.partner.name}`}
                    {o.followUpAt && ` · ${m.partnerDetail.followUp}: ${fmtDate(o.followUpAt, bcp47)}`}
                    {o.notes && ` · ${m.common.note}: ${o.notes.length > 40 ? `${o.notes.slice(0, 40)}…` : o.notes}`}
                  </div>
                </div>
                <span className="text-slate-300 group-open:rotate-90">›</span>
              </summary>
              <div className="px-4 pb-4 pt-1 border-t border-slate-50">
                <form action={upsertOpportunityAction.bind(null, owner)} className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  <input type="hidden" name="id" value={o.id} />
                  <input name="name" defaultValue={o.name} className={input} />
                  <AmountInput
                    key={`opp-${o.id}-${o.amount ?? ""}-${o.currency ?? ""}`}
                    inputClassName={input}
                    amountPlaceholder={m.common.amount}
                    amountAriaLabel={m.common.amount}
                    currencyAriaLabel={m.common.currency}
                    locale={locale}
                    defaultAmount={o.amount}
                    defaultCurrency={o.currency}
                  />
                  <OpportunityProcessFields
                    key={`edit-${o.id}`}
                    idPrefix={`opp-${o.id}`}
                    defaultStage={o.stage}
                    defaultNextStep={o.nextStep}
                  />
                  <input
                    name="followUpAt"
                    type="date"
                    defaultValue={o.followUpAt ? new Date(o.followUpAt).toISOString().slice(0, 10) : ""}
                    className={input}
                  />
                  <OpportunityStatusWithOutcome
                    defaultStatus={normalizeOpportunityStatus(o.status)}
                    defaultCustomerSegment={o.customerSegment}
                    defaultWinFactor={o.winFactor}
                    defaultLossReason={o.lossReason}
                    segmentOptions={segmentOptions}
                    winFactorOptions={winFactorOptions}
                    lossReasonOptions={lossReasonOptions}
                    customerDefaultSegment={customer.customerSegment}
                    statusOptions={oppStatusOptions}
                  />
                  <select name="dealType" defaultValue={o.dealType ?? ""} className={input}>
                    <option value="">{c.dealTypeNone}</option>
                    <option value="PROJECT">{c.dealTypeProject}</option>
                    <option value="PRODUCT">{c.dealTypeProduct}</option>
                  </select>
                  <select name="partnerId" defaultValue={o.partnerId ?? ""} className={`${input} md:col-span-3`}>
                    <option value="">{c.viaPartnerNone}</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <textarea
                    name="notes"
                    rows={2}
                    defaultValue={o.notes ?? ""}
                    placeholder={m.opportunities.notesPlaceholder}
                    className={`${input} col-span-2 md:col-span-3`}
                    aria-label={m.common.note}
                  />
                  <div className="col-span-2 md:col-span-3 flex justify-end gap-2">
                    <button
                      formAction={deleteOpportunityAction.bind(null, owner, o.id)}
                      className="text-xs text-slate-400 hover:text-red-600"
                    >
                      {m.common.delete}
                    </button>
                    <PendingButton label={m.common.save} className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs" />
                  </div>
                </form>
                {!o.project && o.dealType !== "PRODUCT" && (
                  <form
                    action={convertOpportunityToProjectAction.bind(null, owner, o.id)}
                    className="mt-2 flex items-center justify-end gap-2"
                  >
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
                  <select
                    name="assigneeId"
                    defaultValue={customer.ownerId ?? user.id}
                    className="rounded-lg border border-slate-200 px-2 py-2 text-sm shrink-0 max-w-[140px]"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <button className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm shrink-0 hover:bg-slate-700">+</button>
                </form>
              </div>
            </details>
          ))}
          {opportunities.length === 0 && <EmptyState text={c.noOpportunities} />}
          <CustomerAddOpportunityForm
            owner={owner}
            action={upsertOpportunityAction}
            partners={partners.map((p) => ({ id: p.id, name: p.name }))}
            defaultPartnerId={customer.partnerLinks[0]?.partner.id ?? ""}
            customerCrmId={customer.crmCustomerId}
            customerName={customer.name}
            customerDefaultSegment={customer.customerSegment}
            segmentOptions={segmentOptions}
            winFactorOptions={winFactorOptions}
            lossReasonOptions={lossReasonOptions}
            statusOptions={oppStatusOptions}
          />
        </div>
      );
      break;
    }

    case "contracts": {
      const [contracts, contractOpps, contractProjects] = await Promise.all([
        db.contract.findMany({
          where: { customerId: id },
          include: {
            partner: { select: { id: true, name: true } },
            opportunity: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
            parentContract: { select: { id: true, name: true, contractType: true } },
            childContracts: { select: { id: true, name: true, status: true }, take: 5 },
            lineItems: { orderBy: { sortOrder: "asc" } },
          },
          orderBy: [{ status: "asc" }, { renewsAt: "asc" }, { updatedAt: "desc" }],
        }),
        db.opportunity.findMany({
          where: { customerId: id },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        db.project.findMany({
          where: { customerId: id },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ]);

      const contractFormCopy = {
        contractName: c.contractName,
        contractType: c.contractType,
        contractStatus: c.contractStatus,
        contractBillingCycle: c.contractBillingCycle,
        contractTermYears: c.contractTermYears,
        contractBillingNone: c.contractBillingNone,
        contractStartDate: c.contractStartDate,
        contractEndDate: c.contractEndDate,
        contractRenewsAt: c.contractRenewsAt,
        viaPartnerNone: c.viaPartnerNone,
        contractLinkOpportunityNone: c.contractLinkOpportunityNone,
        contractLinkProjectNone: c.contractLinkProjectNone,
        contractNotesPlaceholder: c.contractNotesPlaceholder,
        productMaintRate: c.productMaintRate,
        productMaintRateHint: c.productMaintRateHint,
        productMaintRateCustom: c.productMaintRateCustom,
        productMaintIncludedY1: c.productMaintIncludedY1,
        productMaintBuyoutRule: c.productMaintBuyoutRule,
        productMaintEstimate: c.productMaintEstimate,
        productMaintParent: c.productMaintParent,
        productMaintParentNone: c.productMaintParentNone,
        subscriptionNote: c.subscriptionNote,
        projectMaintRate: c.projectMaintRate,
        projectMaintRateHint: c.projectMaintRateHint,
        projectMaintIncludedY1: c.projectMaintIncludedY1,
        projectMaintRule: c.projectMaintRule,
        projectMaintEstimate: c.projectMaintEstimate,
        projectMaintParent: c.projectMaintParent,
        projectMaintParentNone: c.projectMaintParentNone,
        crmContractId: c.crmContractId,
        crmContractIdPlaceholder: c.crmContractIdPlaceholder,
        lineItemsTitle: c.lineItemsTitle,
        lineItemsHint: c.lineItemsHint,
        lineProduct: c.lineProduct,
        lineVersion: c.lineVersion,
        lineAmount: c.lineAmount,
        lineCycleYears: c.lineCycleYears,
        lineAdd: c.lineAdd,
        lineRemove: c.lineRemove,
        aiExtractTitle: c.aiExtractTitle,
        aiExtractHint: c.aiExtractHint,
        aiExtractUpload: c.aiExtractUpload,
        aiExtractPaste: c.aiExtractPaste,
        aiExtractRun: c.aiExtractRun,
        aiExtractRunning: c.aiExtractRunning,
        aiExtractClear: c.aiExtractClear,
        aiExtractSuccess: c.aiExtractSuccess,
        aiExtractSuccessCompact: c.aiExtractSuccessCompact,
        aiExtractAgain: c.aiExtractAgain,
        aiExtractFailed: c.aiExtractFailed,
        aiExtractImageRequired: c.aiExtractImageRequired,
        aiExtractOrText: c.aiExtractOrText,
        aiExtractTextPlaceholder: c.aiExtractTextPlaceholder,
        aiExtractGatewayError: c.aiExtractGatewayError,
        aiExtractTimeout: c.aiExtractTimeout,
        amount: m.common.amount,
        note: m.common.note,
        save: m.common.save,
        add: m.common.add,
        delete: m.common.delete,
        contractSaving: c.contractSaving,
        contractSaved: c.contractSaved,
        contractCreated: c.contractCreated,
      };
      const contractPartners = partners.map((p) => ({ id: p.id, name: p.name }));
      const buyoutOptions = contracts.filter((ct) => ct.contractType === "BUYOUT").map((ct) => ({ id: ct.id, name: ct.name }));
      const projectContractOptions = contracts
        .filter((ct) => ct.contractType === "PROJECT")
        .map((ct) => ({ id: ct.id, name: ct.name }));

      tabContent = (
        <div className="space-y-3">
          {contracts.map((ct) => {
            const pastEnd = isContractPastEnd(ct.endDate, ct.status);
            return (
              <details key={ct.id} className="group rounded-lg border border-slate-100 hover:border-slate-200">
                <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900">{ct.name}</span>
                      <Badge tone={contractTypeTone(ct.contractType)}>{contractTypeLabel(ct.contractType, locale)}</Badge>
                      <Badge tone={contractStatusTone(ct.status)}>{contractStatusLabel(ct.status, locale)}</Badge>
                      {ct.contractType === "BUYOUT" && ct.productMaintRatePct != null && (
                        <Badge tone="amber">{c.productMaintRateBadge.replace("{rate}", String(ct.productMaintRatePct))}</Badge>
                      )}
                      {ct.contractType === "BUYOUT" && ct.productMaintIncludedY1 && (
                        <Badge tone="green">{c.productMaintY1Badge}</Badge>
                      )}
                      {ct.contractType === "PROJECT" && ct.projectMaintRatePct != null && (
                        <Badge tone="purple">{c.projectMaintRateBadge.replace("{rate}", String(ct.projectMaintRatePct))}</Badge>
                      )}
                      {ct.contractType === "PROJECT" && ct.projectMaintIncludedY1 && (
                        <Badge tone="green">{c.projectMaintY1Badge}</Badge>
                      )}
                      {pastEnd && <Badge tone="amber">{c.contractStatusExpired}</Badge>}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {m.common.amount}: {formatAmountDisplay(ct.amount, ct.currency, locale)}
                      {ct.billingCycle && ` · ${billingCycleLabel(ct.billingCycle, locale)}`}
                      {ct.startDate && ` · ${c.contractStartDate}: ${fmtDate(ct.startDate, bcp47)}`}
                      {ct.endDate && ` · ${c.contractEndDate}: ${fmtDate(ct.endDate, bcp47)}`}
                      {ct.renewsAt && ` · ${c.contractRenewsAt}: ${fmtDate(ct.renewsAt, bcp47)}`}
                      {ct.partner && ` · ${c.viaPartner}: ${ct.partner.name}`}
                      {ct.parentContract &&
                        ` · ${ct.contractType === "PROJECT_MAINTENANCE" ? c.linkedProjectContract : c.linkedBuyout}: ${ct.parentContract.name}`}
                      {ct.opportunity && ` · ${c.belongsToOpportunity}: ${ct.opportunity.name}`}
                      {ct.project && ` · ${c.belongsToProject}: ${ct.project.name}`}
                    </div>
                    {pastEnd && <div className="text-[11px] text-amber-600 mt-1">{c.contractPastEndHint}</div>}
                  </div>
                  <span className="text-slate-300 group-open:rotate-90">›</span>
                </summary>
                <div className="px-4 pb-4 pt-1 border-t border-slate-50 space-y-3">
                  <div className="flex justify-end">
                    <Link href={`/contracts/${ct.id}`} className="text-xs text-sky-600 hover:underline">
                      {c.contractDetailLink}
                    </Link>
                  </div>
                  <CustomerContractForm
                    action={upsertContractAction.bind(null, owner)}
                    deleteAction={deleteContractAction.bind(null, owner, ct.id)}
                    mode="edit"
                    locale={locale}
                    copy={contractFormCopy}
                    inputClassName={input}
                    customerNameHint={customer.name}
                    partners={contractPartners}
                    opportunities={contractOpps}
                    projects={contractProjects}
                    buyouts={buyoutOptions.filter((b) => b.id !== ct.id)}
                    projectContracts={projectContractOptions.filter((p) => p.id !== ct.id)}
                    defaults={{
                      id: ct.id,
                      name: ct.name,
                      contractType: ct.contractType,
                      status: ct.status,
                      amount: ct.amount,
                      currency: ct.currency,
                      crmContractId: ct.crmContractId,
                      billingCycle: ct.billingCycle,
                      termYears: ct.termYears,
                      startDate: ct.startDate ? new Date(ct.startDate).toISOString().slice(0, 10) : "",
                      endDate: ct.endDate ? new Date(ct.endDate).toISOString().slice(0, 10) : "",
                      renewsAt: ct.renewsAt ? new Date(ct.renewsAt).toISOString().slice(0, 10) : "",
                      partnerId: ct.partnerId,
                      opportunityId: ct.opportunityId,
                      projectId: ct.projectId,
                      parentContractId: ct.parentContractId,
                      productMaintRatePct: ct.productMaintRatePct,
                      productMaintIncludedY1: ct.productMaintIncludedY1,
                      projectMaintRatePct: ct.projectMaintRatePct,
                      projectMaintIncludedY1: ct.projectMaintIncludedY1,
                      notes: ct.notes,
                      lineItems: ct.lineItems,
                    }}
                  />
                  {ct.contractType === "BUYOUT" && (
                    <form
                      action={createProductMaintRenewalAction.bind(null, owner, ct.id)}
                      className="flex items-center justify-end gap-2 border-t border-slate-50 pt-3"
                    >
                      <span className="text-[11px] text-slate-400">{c.createProductMaintRenewalHint}</span>
                      <button className="rounded-md border border-amber-200 bg-amber-50 text-amber-700 px-3 py-1.5 text-xs hover:bg-amber-100">
                        {c.createProductMaintRenewal}
                      </button>
                    </form>
                  )}
                  {ct.contractType === "PROJECT" && (
                    <form
                      action={createProjectMaintRenewalAction.bind(null, owner, ct.id)}
                      className="flex items-center justify-end gap-2 border-t border-slate-50 pt-3"
                    >
                      <span className="text-[11px] text-slate-400">{c.createProjectMaintRenewalHint}</span>
                      <button className="rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-1.5 text-xs hover:bg-emerald-100">
                        {c.createProjectMaintRenewal}
                      </button>
                    </form>
                  )}
                </div>
              </details>
            );
          })}
          {contracts.length === 0 && <EmptyState text={c.noContracts} />}
          <CustomerAddContractForm
            owner={owner}
            action={upsertContractAction}
            locale={locale}
            copy={contractFormCopy}
            inputClassName={input}
            customerName={customer.name}
            customerCrmId={customer.crmCustomerId}
            defaultPartnerId={customer.partnerLinks[0]?.partner.id ?? ""}
            partners={contractPartners}
            opportunities={contractOpps}
            projects={contractProjects}
            buyouts={buyoutOptions}
            projectContracts={projectContractOptions}
          />
        </div>
      );
      break;
    }

    case "projects": {
      const projects = await db.project.findMany({
        where: { customerId: id },
        include: {
          partner: { select: { id: true, name: true } },
          todos: { orderBy: [{ status: "asc" }, { dueDate: "asc" }], include: { assignee: true } },
          workLogs: {
            orderBy: { createdAt: "desc" },
            take: 30,
            include: { author: { select: { id: true, name: true } } },
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      tabContent = (
        <div className="space-y-4">
          {projects.map((p) => (
            <CustomerProjectCard
              key={p.id}
              project={p}
              owner={owner}
              customerId={customer.id}
              defaultAssigneeId={customer.ownerId ?? user.id}
              partners={partners}
              users={users}
              bcp47={bcp47}
            />
          ))}
          {projects.length === 0 && <EmptyState text={c.noProjects} />}
          <CustomerAddProjectForm
            owner={owner}
            action={upsertProjectAction}
            partners={partners.map((pp) => ({ id: pp.id, name: pp.name }))}
            defaultPartnerId={customer.partnerLinks[0]?.partner.id ?? ""}
            customerCrmId={customer.crmCustomerId}
            customerName={customer.name}
          />
        </div>
      );
      break;
    }

    case "capability": {
      const partnerIds = customer.partnerLinks.map(
        (l: { partner: { id: string } }) => l.partner.id,
      );
      const [trainings, assets, ammoConfig, linkedSolutions] = await Promise.all([
        db.training.findMany({
          where: { customerId: id },
          orderBy: { updatedAt: "desc" },
        }),
        db.asset.findMany({
          where: { customerId: id },
          orderBy: { createdAt: "desc" },
        }),
        getAmmoConfigForClient(),
        partnerIds.length > 0
          ? db.solution.findMany({
              where: { partnerId: { in: partnerIds } },
              orderBy: { updatedAt: "desc" },
              include: { assets: { include: { asset: true } } },
            })
          : Promise.resolve([]),
      ]);

      const linkAssets = assets.filter((a) => !(a.provider === "gdrive" && a.size > 0));

      tabContent = (
        <div className="space-y-5">
          <Card title={pd.trainingCert.replace("{count}", String(trainings.length))}>
            <TrainingList owner={{ customerId: customer.id }} trainings={trainings} input={input} m={m} />
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
      break;
    }

    case "relationship": {
      const [contacts, contactLinks, events] = await Promise.all([
        db.contact.findMany({ where: { customerId: id }, orderBy: [{ attitude: "desc" }, { createdAt: "asc" }] }),
        db.contactLink.findMany({ where: { customerId: id } }),
        db.timelineEvent.findMany({
          where: { customerId: id },
          orderBy: { createdAt: "desc" },
          take: 100,
          include: { createdBy: { select: { name: true } } },
        }),
      ]);

      const contactOptions = contacts.map((ct) => ({ id: ct.id, name: ct.name }));

      tabContent = (
        <div className="space-y-6">
          <Card title={pd.powerMap.replace("{count}", String(contacts.length))}>
            <PowerMapLazy
              owner={owner}
              toolbarExtra={
                <AiAddButton scope="powermap" customerId={customer.id} label={pd.aiAddContact} variant="soft" />
              }
              contacts={contacts.map((ct) => ({
                id: ct.id,
                name: ct.name,
                role: ct.role,
                title: ct.title,
                department: ct.department,
                attitude: ct.attitude,
                reportsToId: ct.reportsToId,
                x: ct.x,
                y: ct.y,
                email: ct.email,
                phone: ct.phone,
                contactInfo: ct.contactInfo,
                approach: ct.approach,
                notes: ct.notes,
              }))}
              links={contactLinks.map((l) => ({
                id: l.id,
                subordinateId: l.subordinateId,
                superiorId: l.superiorId,
                kind: l.kind,
              }))}
            />
          </Card>
          <div className="border-t border-slate-100 pt-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-800">{c.timeline.replace("{count}", String(events.length))}</h3>
              <BusinessRecordDialogButton owner={owner} contacts={contactOptions} />
            </div>
            <form action={addNoteAction.bind(null, owner)} className="flex gap-2 mb-5">
              <input name="content" required placeholder={c.logActivityPlaceholder} className={input} />
              <select name="type" className="rounded-lg border border-slate-200 px-2 py-2 text-sm shrink-0">
                <option value="NOTE">{m.common.note}</option>
                <option value="NEWS">{m.common.externalNews}</option>
              </select>
              <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm shrink-0 hover:bg-slate-700">
                {m.common.log}
              </button>
            </form>
            <div className="space-y-3">
              {events.map((e) => (
                <div key={e.id} className="flex gap-3">
                  <div className="mt-1.5 w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm text-slate-800">{e.title}</div>
                    {e.content && <div className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">{e.content}</div>}
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {fmtDate(e.createdAt, bcp47)}
                      {e.createdBy && ` · ${e.createdBy.name}`}
                    </div>
                  </div>
                </div>
              ))}
              {events.length === 0 && <EmptyState text={c.noTimeline} />}
            </div>
          </div>
        </div>
      );
      break;
    }
  }

  return tabContent;
}
