import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, PageHeader, fmtDate, fmtDateTime } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import {
  billingCycleLabel,
  contractStatusLabel,
  contractStatusTone,
  contractTypeLabel,
  contractTypeTone,
  isContractPastEnd,
} from "@/lib/contract-types";
import { contractArrAmount, formatArrUsd, isArrContractType } from "@/lib/arr";
import { formatAmountDisplay } from "@/lib/amount";
import { CustomerContractForm } from "@/components/customer-contract-form";
import {
  deleteContractAction,
  upsertContractAction,
  createProductMaintRenewalAction,
  createProjectMaintRenewalAction,
} from "@/lib/actions";
import type { OwnerRef } from "@/lib/owner";

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { messages: m, bcp47, locale } = await getServerI18n();
  const t = m.contracts;
  const c = m.customers;

  const ct = await db.contract.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          status: true,
          industry: true,
          city: true,
          country: true,
          owner: { select: { id: true, name: true } },
          partnerLinks: {
            include: { partner: { select: { id: true, name: true } } },
            take: 5,
          },
          opportunities: { select: { id: true, name: true }, orderBy: { updatedAt: "desc" } },
          projects: { select: { id: true, name: true }, orderBy: { updatedAt: "desc" } },
          contracts: {
            select: { id: true, name: true, contractType: true },
            orderBy: { updatedAt: "desc" },
          },
        },
      },
      partner: { select: { id: true, name: true } },
      opportunity: { select: { id: true, name: true, status: true } },
      project: { select: { id: true, name: true, phase: true, status: true } },
      parentContract: {
        select: { id: true, name: true, contractType: true, amount: true, currency: true },
      },
      childContracts: {
        select: {
          id: true,
          name: true,
          contractType: true,
          status: true,
          amount: true,
          currency: true,
          startDate: true,
          endDate: true,
        },
        orderBy: { startDate: "desc" },
      },
      lineItems: { orderBy: { sortOrder: "asc" } },
      createdBy: { select: { name: true } },
    },
  });

  if (!ct) notFound();

  const pastEnd = isContractPastEnd(ct.endDate, ct.status);
  const arr = contractArrAmount(ct);
  const owner: OwnerRef = { kind: "customer", id: ct.customerId };
  const input =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30";

  const contractFormCopy = {
    contractName: c.contractName,
    contractType: c.contractType,
    contractStatus: c.contractStatus,
    contractBillingCycle: c.contractBillingCycle,
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

  const partners = ct.customer.partnerLinks.map((pl) => ({
    id: pl.partner.id,
    name: pl.partner.name,
  }));
  const buyouts = ct.customer.contracts
    .filter((x) => x.contractType === "BUYOUT" && x.id !== ct.id)
    .map((x) => ({ id: x.id, name: x.name }));
  const projectContracts = ct.customer.contracts
    .filter((x) => x.contractType === "PROJECT" && x.id !== ct.id)
    .map((x) => ({ id: x.id, name: x.name }));

  const customerId = ct.customerId;
  const contractId = ct.id;
  async function deleteAndGoList(_formData?: FormData) {
    "use server";
    await deleteContractAction({ kind: "customer", id: customerId }, contractId);
    redirect("/contracts");
  }

  const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-2.5 border-b border-slate-50 last:border-0 text-sm">
      <div className="text-slate-400">{label}</div>
      <div className="text-slate-800 min-w-0">{children}</div>
    </div>
  );

  return (
    <div className="pb-16">
      <PageHeader
        title={ct.name}
        desc={t.detailDesc.replace("{customer}", ct.customer.name)}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/contracts"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t.backToList}
            </Link>
            <Link
              href={`/customers/${ct.customer.id}?tab=contracts`}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t.openCustomer}
            </Link>
            <a
              href="#edit-contract"
              className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800"
            >
              {t.sectionEdit}
            </a>
          </div>
        }
      />

      <div className="px-4 sm:px-6 lg:px-8 max-w-5xl space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge tone={contractTypeTone(ct.contractType)}>
            {contractTypeLabel(ct.contractType, locale)}
          </Badge>
          <Badge tone={contractStatusTone(ct.status)}>
            {contractStatusLabel(ct.status, locale)}
          </Badge>
          {pastEnd && <Badge tone="amber">{t.pastEnd}</Badge>}
          {isArrContractType(ct.contractType) && <Badge tone="green">ARR</Badge>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-4">
            <div className="text-xs text-slate-400">{t.colAmount}</div>
            <div className="text-xl font-semibold tabular-nums mt-1">
              {formatAmountDisplay(ct.amount, ct.currency, locale)}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-4">
            <div className="text-xs text-slate-400">{t.colArr}</div>
            <div className="text-xl font-semibold tabular-nums text-emerald-700 mt-1">
              {arr > 0 ? formatArrUsd(arr) : "—"}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-4">
            <div className="text-xs text-slate-400">{t.colCycle}</div>
            <div className="text-xl font-semibold mt-1">
              {billingCycleLabel(ct.billingCycle, locale) ?? "—"}
            </div>
          </div>
        </div>

        <Card title={t.sectionBasics}>
          <Row label={t.colCustomer}>
            <Link href={`/customers/${ct.customer.id}`} className="text-sky-700 hover:underline">
              {ct.customer.name}
            </Link>
          </Row>
          <Row label={t.colOwner}>{ct.customer.owner?.name ?? "—"}</Row>
          <Row label={t.viaPartner}>
            {ct.partner ? (
              <Link href={`/partners/${ct.partner.id}`} className="text-sky-700 hover:underline">
                {ct.partner.name}
              </Link>
            ) : (
              "—"
            )}
          </Row>
          <Row label={t.crmContractId}>
            <span className="font-mono text-xs">{ct.crmContractId?.trim() || "—"}</span>
          </Row>
          <Row label={t.contractStart}>{fmtDate(ct.startDate, bcp47)}</Row>
          <Row label={t.contractEnd}>{fmtDate(ct.endDate, bcp47)}</Row>
          <Row label={t.contractRenews}>{fmtDate(ct.renewsAt, bcp47)}</Row>
          {ct.contractType === "BUYOUT" && (
            <>
              <Row label={t.productMaintRate}>
                {ct.productMaintRatePct != null ? `${ct.productMaintRatePct}%` : "—"}
              </Row>
              <Row label={t.productMaintY1}>
                {ct.productMaintIncludedY1 ? t.yes : t.no}
              </Row>
            </>
          )}
          {ct.contractType === "PROJECT" && (
            <>
              <Row label={t.projectMaintRate}>
                {ct.projectMaintRatePct != null ? `${ct.projectMaintRatePct}%` : "—"}
              </Row>
              <Row label={t.projectMaintY1}>
                {ct.projectMaintIncludedY1 ? t.yes : t.no}
              </Row>
            </>
          )}
          <Row label={t.notes}>{ct.notes?.trim() || "—"}</Row>
          <Row label={t.createdBy}>
            {ct.createdBy?.name ?? "—"} · {fmtDateTime(ct.createdAt, bcp47)}
          </Row>
        </Card>

        <Card title={t.sectionLineItems}>
          {!ct.lineItems.length ? (
            <EmptyState text={t.lineItemsEmpty} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                    <th className="py-2 pr-3 font-medium">{t.lineProduct}</th>
                    <th className="py-2 px-2 font-medium">{t.lineVersion}</th>
                    <th className="py-2 px-2 font-medium text-right">{t.lineAmount}</th>
                    <th className="py-2 pl-2 font-medium text-right">{t.lineCycle}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {ct.lineItems.map((line) => (
                    <tr key={line.id}>
                      <td className="py-2.5 pr-3 font-medium text-slate-800">{line.product}</td>
                      <td className="py-2.5 px-2 text-slate-600">{line.version || "—"}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-slate-700">
                        {formatAmountDisplay(
                          line.amount,
                          line.currency ?? ct.currency,
                          locale
                        )}
                      </td>
                      <td className="py-2.5 pl-2 text-right tabular-nums text-slate-600">
                        {line.cycleYears ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {(ct.parentContract || ct.childContracts.length > 0) && (
          <Card title={t.sectionChain}>
            {ct.parentContract && (
              <Row label={t.parentContract}>
                <Link
                  href={`/contracts/${ct.parentContract.id}`}
                  className="text-sky-700 hover:underline"
                >
                  {ct.parentContract.name}
                </Link>
                <span className="text-slate-400 text-xs ml-2">
                  {contractTypeLabel(ct.parentContract.contractType, locale)}
                  {ct.parentContract.amount
                    ? ` · ${formatAmountDisplay(ct.parentContract.amount, ct.parentContract.currency, locale)}`
                    : ""}
                </span>
              </Row>
            )}
            {ct.childContracts.length > 0 && (
              <div className="mt-2 space-y-2">
                <div className="text-xs text-slate-400">{t.childContracts}</div>
                <ul className="divide-y divide-slate-50">
                  {ct.childContracts.map((child) => (
                    <li key={child.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                      <Link href={`/contracts/${child.id}`} className="text-sky-700 hover:underline font-medium">
                        {child.name}
                      </Link>
                      <Badge tone={contractTypeTone(child.contractType)}>
                        {contractTypeLabel(child.contractType, locale)}
                      </Badge>
                      <Badge tone={contractStatusTone(child.status)}>
                        {contractStatusLabel(child.status, locale)}
                      </Badge>
                      <span className="text-slate-500 tabular-nums">
                        {formatAmountDisplay(child.amount, child.currency, locale)}
                      </span>
                      <span className="text-xs text-slate-400">
                        {fmtDate(child.startDate, bcp47)} → {fmtDate(child.endDate, bcp47)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}

        <Card title={t.sectionLinks}>
          <Row label={t.linkedOpportunity}>
            {ct.opportunity ? (
              <Link
                href={`/opportunities?q=${encodeURIComponent(ct.opportunity.name)}`}
                className="text-sky-700 hover:underline"
              >
                {ct.opportunity.name}
              </Link>
            ) : (
              "—"
            )}
          </Row>
          <Row label={t.linkedProject}>
            {ct.project ? (
              <Link href={`/projects`} className="text-sky-700 hover:underline">
                {ct.project.name}
              </Link>
            ) : (
              "—"
            )}
          </Row>
          {ct.customer.partnerLinks.length > 0 && (
            <Row label={t.customerPartners}>
              <div className="flex flex-wrap gap-2">
                {ct.customer.partnerLinks.map((pl) => (
                  <Link
                    key={pl.partner.id}
                    href={`/partners/${pl.partner.id}`}
                    className="text-sky-700 hover:underline"
                  >
                    {pl.partner.name}
                  </Link>
                ))}
              </div>
            </Row>
          )}
        </Card>

        <Card title={t.sectionEdit} id="edit-contract">
          <CustomerContractForm
            action={upsertContractAction.bind(null, owner)}
            deleteAction={deleteAndGoList}
            mode="edit"
            locale={locale}
            copy={contractFormCopy}
            inputClassName={input}
            customerNameHint={ct.customer.name}
            partners={partners}
            opportunities={ct.customer.opportunities}
            projects={ct.customer.projects}
            buyouts={buyouts}
            projectContracts={projectContracts}
            defaults={{
              id: ct.id,
              name: ct.name,
              contractType: ct.contractType,
              status: ct.status,
              amount: ct.amount,
              currency: ct.currency,
              crmContractId: ct.crmContractId,
              billingCycle: ct.billingCycle,
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
              className="flex items-center justify-end gap-2 border-t border-slate-50 pt-3 mt-3"
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
              className="flex items-center justify-end gap-2 border-t border-slate-50 pt-3 mt-3"
            >
              <span className="text-[11px] text-slate-400">{c.createProjectMaintRenewalHint}</span>
              <button className="rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-1.5 text-xs hover:bg-emerald-100">
                {c.createProjectMaintRenewal}
              </button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
