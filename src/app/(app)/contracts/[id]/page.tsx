import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, PageHeader, fmtDate, fmtDateTime } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import {
  billingCycleLabel,
  contractStatusLabel,
  contractStatusTone,
  contractTypeLabel,
  contractTypeTone,
  isContractPastEnd,
} from "@/lib/contract-types";
import { contractArrAmount, formatArrNumber, isArrContractType } from "@/lib/arr";

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { messages: m, bcp47, locale } = await getServerI18n();
  const t = m.contracts;

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
        },
      },
      partner: { select: { id: true, name: true } },
      opportunity: { select: { id: true, name: true, status: true } },
      project: { select: { id: true, name: true, phase: true, status: true } },
      parentContract: {
        select: { id: true, name: true, contractType: true, amount: true },
      },
      childContracts: {
        select: {
          id: true,
          name: true,
          contractType: true,
          status: true,
          amount: true,
          startDate: true,
          endDate: true,
        },
        orderBy: { startDate: "desc" },
      },
      createdBy: { select: { name: true } },
    },
  });

  if (!ct) notFound();

  const pastEnd = isContractPastEnd(ct.endDate, ct.status);
  const arr = contractArrAmount(ct);

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
              className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800"
            >
              {t.editInCustomer}
            </Link>
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
            <div className="text-xl font-semibold tabular-nums mt-1">{ct.amount ?? "—"}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-4">
            <div className="text-xs text-slate-400">{t.colArr}</div>
            <div className="text-xl font-semibold tabular-nums text-emerald-700 mt-1">
              {arr > 0 ? formatArrNumber(arr) : "—"}
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
                  {ct.parentContract.amount ? ` · ${ct.parentContract.amount}` : ""}
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
                      <span className="text-slate-500 tabular-nums">{child.amount ?? "—"}</span>
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
      </div>
    </div>
  );
}
