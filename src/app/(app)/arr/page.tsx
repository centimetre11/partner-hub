import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ArrViewSwitch } from "@/components/arr-view-switch";
import { Badge, Card, EmptyState, PageHeader, fmtDate } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import {
  ARR_ACTIVE_PRODUCT_MAINT_CHILD_INCLUDE,
  arrBreakdownType,
  arrSourceContractWhere,
  contractArrAmount,
  emptyArrBreakdown,
  formatArrUsd,
  isActiveArrContract,
  latestServiceDateFromContracts,
  sumArrBreakdown,
  addToBreakdown,
  toArrContractInput,
} from "@/lib/arr";
import { contractTypeLabel, contractTypeTone } from "@/lib/contract-types";

function Stat({
  label,
  value,
  tone = "text-slate-900",
  hint,
}: {
  label: string;
  value: string | number;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-4">
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
      {hint && <div className="text-[11px] text-slate-300 mt-1">{hint}</div>}
    </div>
  );
}

export default async function ArrPage() {
  await requireUser();
  const { messages: m, bcp47, locale } = await getServerI18n();
  const t = m.arr;

  const contractsRaw = await db.contract.findMany({
    where: arrSourceContractWhere(),
    include: {
      lineItems: { select: { amount: true, currency: true, cycleYears: true } },
      ...ARR_ACTIVE_PRODUCT_MAINT_CHILD_INCLUDE,
      customer: {
        select: {
          id: true,
          name: true,
          owner: { select: { id: true, name: true } },
          satisfactionUser: { select: { id: true, name: true } },
          partnerLinks: {
            include: { partner: { select: { id: true, name: true } } },
            take: 3,
          },
        },
      },
      partner: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const contracts = contractsRaw.map((ct) => ({
    ...ct,
    ...toArrContractInput(ct),
  }));
  const active = contracts.filter(isActiveArrContract);
  const breakdown = sumArrBreakdown(active);

  // Per-customer rollup
  type CustomerRow = {
    customerId: string;
    customerName: string;
    ownerName: string | null;
    satisfactionOwnerName: string | null;
    partners: string[];
    subscription: number;
    productMaintenance: number;
    projectMaintenance: number;
    total: number;
    contractCount: number;
    latestService: Date | null;
  };
  const byCustomer = new Map<string, CustomerRow>();
  for (const ct of active) {
    let row = byCustomer.get(ct.customerId);
    if (!row) {
      row = {
        customerId: ct.customerId,
        customerName: ct.customer.name,
        ownerName: ct.customer.owner?.name ?? null,
        satisfactionOwnerName: ct.customer.satisfactionUser?.name ?? null,
        partners: ct.customer.partnerLinks.map((p) => p.partner.name),
        subscription: 0,
        productMaintenance: 0,
        projectMaintenance: 0,
        total: 0,
        contractCount: 0,
        latestService: null,
      };
      byCustomer.set(ct.customerId, row);
    }
    const amt = contractArrAmount(ct);
    const b = emptyArrBreakdown();
    addToBreakdown(b, arrBreakdownType(ct), amt);
    row.subscription += b.subscription;
    row.productMaintenance += b.productMaintenance;
    row.projectMaintenance += b.projectMaintenance;
    row.total += b.total;
    row.contractCount += 1;
  }
  for (const row of byCustomer.values()) {
    const custContracts = active.filter((c) => c.customerId === row.customerId);
    row.latestService = latestServiceDateFromContracts(custContracts);
  }

  const customerRows = [...byCustomer.values()].sort((a, b) => b.total - a.total);

  // By owner
  const byOwner = new Map<string, { name: string; total: number; customers: number }>();
  for (const row of customerRows) {
    const key = row.ownerName ?? "_none";
    const cur = byOwner.get(key) ?? {
      name: row.ownerName ?? t.unassignedOwner,
      total: 0,
      customers: 0,
    };
    cur.total += row.total;
    cur.customers += 1;
    byOwner.set(key, cur);
  }
  const ownerRows = [...byOwner.values()].sort((a, b) => b.total - a.total);

  // Renewals in next 90 days
  const now = new Date();
  const in90 = new Date(now);
  in90.setDate(in90.getDate() + 90);
  const upcoming = active
    .map((ct) => {
      const when = ct.renewsAt ?? ct.endDate;
      if (!when) return null;
      const d = new Date(when);
      if (d < now || d > in90) return null;
      return { ct, when: d };
    })
    .filter((x): x is { ct: (typeof active)[number]; when: Date } => !!x)
    .sort((a, b) => a.when.getTime() - b.when.getTime())
    .slice(0, 12);

  const maxOwner = Math.max(...ownerRows.map((o) => o.total), 1);

  return (
    <div className="pb-16">
      <PageHeader
        title={t.title}
        desc={t.desc}
        actions={<ArrViewSwitch />}
      />

      <div className="px-4 sm:px-6 lg:px-8 space-y-5 max-w-7xl">
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-600 leading-relaxed">
          {t.scopeHint}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label={t.statTotalArr} value={formatArrUsd(breakdown.total)} tone="text-emerald-700" />
          <Stat
            label={t.statSubscription}
            value={formatArrUsd(breakdown.subscription)}
            tone="text-sky-700"
          />
          <Stat
            label={t.statProductMaint}
            value={formatArrUsd(breakdown.productMaintenance)}
            tone="text-amber-700"
          />
          <Stat
            label={t.statProjectMaint}
            value={formatArrUsd(breakdown.projectMaintenance)}
            tone="text-violet-700"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label={t.statCustomers} value={customerRows.length} />
          <Stat label={t.statContracts} value={active.length} />
          <Stat label={t.statUpcoming} value={upcoming.length} tone="text-amber-600" hint={t.statUpcomingHint} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title={t.byOwnerTitle}>
            {!ownerRows.length ? (
              <EmptyState text={t.empty} />
            ) : (
              <div className="space-y-2.5">
                {ownerRows.map((o) => (
                  <div key={o.name} className="flex items-center gap-3 text-sm">
                    <div className="w-28 text-slate-600 text-xs shrink-0 truncate" title={o.name}>
                      {o.name}
                    </div>
                    <div className="flex-1 h-5 bg-slate-50 rounded-md overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-md"
                        style={{ width: `${(o.total / maxOwner) * 100}%` }}
                      />
                    </div>
                    <div className="w-24 text-right text-xs tabular-nums text-slate-600 shrink-0">
                      {formatArrUsd(o.total)}
                    </div>
                    <div className="w-12 text-right text-[11px] text-slate-400 shrink-0">
                      {o.customers}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title={t.upcomingTitle}>
            {!upcoming.length ? (
              <EmptyState text={t.upcomingEmpty} />
            ) : (
              <ul className="divide-y divide-slate-50">
                {upcoming.map(({ ct, when }) => (
                  <li key={ct.id} className="py-2.5 flex flex-wrap items-center gap-2 text-sm">
                    <Link
                      href={`/contracts/${ct.id}`}
                      className="font-medium text-sky-700 hover:underline min-w-0 truncate"
                    >
                      {ct.name}
                    </Link>
                    <Badge tone={contractTypeTone(ct.contractType)}>
                      {contractTypeLabel(ct.contractType, locale)}
                    </Badge>
                    <span className="text-xs text-slate-500">{ct.customer.name}</span>
                    <span className="text-xs text-amber-700 ml-auto whitespace-nowrap">
                      {fmtDate(when, bcp47)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title={t.byCustomerTitle}>
          {!customerRows.length ? (
            <EmptyState text={t.empty} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[880px]">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                    <th className="py-2 pr-3 font-medium">{t.colCustomer}</th>
                    <th className="py-2 px-2 font-medium">{t.colPartner}</th>
                    <th className="py-2 px-2 font-medium">{t.colOwner}</th>
                    <th className="py-2 px-2 font-medium">{t.colSatisfactionOwner}</th>
                    <th className="py-2 px-2 font-medium text-right">{t.statSubscription}</th>
                    <th className="py-2 px-2 font-medium text-right">{t.statProductMaint}</th>
                    <th className="py-2 px-2 font-medium text-right">{t.statProjectMaint}</th>
                    <th className="py-2 px-2 font-medium text-right">{t.colTotalArr}</th>
                    <th className="py-2 pl-2 font-medium">{t.colLatestService}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {customerRows.map((row) => (
                    <tr key={row.customerId} className="hover:bg-slate-50/50">
                      <td className="py-2.5 pr-3">
                        <Link
                          href={`/customers/${row.customerId}?tab=contracts`}
                          className="font-medium text-sky-700 hover:underline"
                        >
                          {row.customerName}
                        </Link>
                        <div className="text-[11px] text-slate-400">
                          {t.contractsCount.replace("{n}", String(row.contractCount))}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-slate-600 text-xs">
                        {row.partners.length ? row.partners.join("、") : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600">{row.ownerName ?? "—"}</td>
                      <td className="py-2.5 px-2 text-slate-600">{row.satisfactionOwnerName ?? "—"}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-sky-700">
                        {row.subscription ? formatArrUsd(row.subscription) : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-amber-700">
                        {row.productMaintenance ? formatArrUsd(row.productMaintenance) : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-violet-700">
                        {row.projectMaintenance ? formatArrUsd(row.projectMaintenance) : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums font-medium text-emerald-700">
                        {formatArrUsd(row.total)}
                      </td>
                      <td className="py-2.5 pl-2 text-slate-500 whitespace-nowrap">
                        {fmtDate(row.latestService, bcp47)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
