import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, EmptyState, PageHeader, fmtDate } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import { InstantSearchInput } from "@/components/instant-search-input";
import { nameContainsWhere } from "@/lib/name-search";
import {
  CONTRACT_STATUS_CODES,
  CONTRACT_TYPE_CODES,
  billingCycleLabel,
  contractStatusLabel,
  contractStatusTone,
  contractTypeLabel,
  contractTypeTone,
  isContractPastEnd,
} from "@/lib/contract-types";
import {
  ARR_ACTIVE_PRODUCT_MAINT_CHILD_INCLUDE,
  arrSourceContractWhere,
  contractArrAmount,
  formatArrUsd,
  isActiveArrContract,
  toArrContractInput,
} from "@/lib/arr";
import { formatAmountDisplay } from "@/lib/amount";

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    status?: string;
    customer?: string;
    arrOnly?: string;
  }>;
}) {
  await requireUser();
  const { messages: m, bcp47, locale } = await getServerI18n();
  const t = m.contracts;
  const sp = await searchParams;
  const statusFilter = sp.status ?? "ACTIVE";
  const typeFilter = sp.type ?? "";
  const arrOnly = sp.arrOnly === "1";
  const nameFilter = nameContainsWhere(sp.q);

  const contractsRaw = await db.contract.findMany({
    where: {
      ...(nameFilter ? { name: nameFilter } : {}),
      ...(sp.customer ? { customerId: sp.customer } : {}),
      ...(arrOnly
        ? arrSourceContractWhere()
        : {
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(typeFilter ? { contractType: typeFilter } : {}),
          }),
    },
    include: {
      customer: { select: { id: true, name: true, owner: { select: { name: true } } } },
      partner: { select: { id: true, name: true } },
      parentContract: { select: { id: true, name: true } },
      lineItems: { select: { amount: true, currency: true, cycleYears: true } },
      ...ARR_ACTIVE_PRODUCT_MAINT_CHILD_INCLUDE,
    },
    orderBy: [{ endDate: "asc" }, { updatedAt: "desc" }],
  });

  const contracts = contractsRaw.map((ct) => ({
    ...ct,
    ...toArrContractInput(ct),
  }));

  const customers = await db.customer.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 500,
  });

  const activeArr = contracts.filter(isActiveArrContract);
  const totalArr = activeArr.reduce((sum, c) => sum + contractArrAmount(c), 0);

  return (
    <div className="pb-16">
      <PageHeader
        title={t.title}
        desc={t.desc.replace("{count}", String(contracts.length))}
      />

      <div className="px-4 sm:px-6 lg:px-8 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-4">
            <div className="text-2xl font-bold tabular-nums text-slate-900">{contracts.length}</div>
            <div className="text-xs text-slate-400 mt-0.5">{t.statListed}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-4">
            <div className="text-2xl font-bold tabular-nums text-sky-700">{activeArr.length}</div>
            <div className="text-xs text-slate-400 mt-0.5">{t.statArrContracts}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-4 col-span-2">
            <div className="text-2xl font-bold tabular-nums text-emerald-700">{formatArrUsd(totalArr)}</div>
            <div className="text-xs text-slate-400 mt-0.5">{t.statArrFromList}</div>
          </div>
        </div>

        <form className="flex flex-wrap gap-2" method="get">
          <InstantSearchInput
            placeholder={t.searchPlaceholder}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm w-full sm:w-48"
          />
          <select
            name="type"
            defaultValue={typeFilter}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{t.allTypes}</option>
            {CONTRACT_TYPE_CODES.map((code) => (
              <option key={code} value={code}>
                {contractTypeLabel(code, locale)}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{t.allStatuses}</option>
            {CONTRACT_STATUS_CODES.map((code) => (
              <option key={code} value={code}>
                {contractStatusLabel(code, locale)}
              </option>
            ))}
          </select>
          <select
            name="customer"
            defaultValue={sp.customer ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm max-w-[12rem]"
          >
            <option value="">{t.allCustomers}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-600">
            <input type="checkbox" name="arrOnly" value="1" defaultChecked={arrOnly} className="rounded" />
            {t.arrOnly}
          </label>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800"
          >
            {m.common.filter}
          </button>
        </form>

        {!contracts.length ? (
          <EmptyState text={t.empty} />
        ) : (
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[960px]">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="px-4 py-2.5 font-medium">{t.colName}</th>
                  <th className="px-3 py-2.5 font-medium">{t.colCustomer}</th>
                  <th className="px-3 py-2.5 font-medium">{t.colType}</th>
                  <th className="px-3 py-2.5 font-medium">{t.colStatus}</th>
                  <th className="px-3 py-2.5 font-medium">{t.colAmount}</th>
                  <th className="px-3 py-2.5 font-medium">{t.colArr}</th>
                  <th className="px-3 py-2.5 font-medium">{t.colCycle}</th>
                  <th className="px-3 py-2.5 font-medium">{t.colEnd}</th>
                  <th className="px-3 py-2.5 font-medium">{t.colOwner}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {contracts.map((ct) => {
                  const pastEnd = isContractPastEnd(ct.endDate, ct.status);
                  const arr = contractArrAmount(ct);
                  return (
                    <tr key={ct.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <Link
                          href={`/contracts/${ct.id}`}
                          className="font-medium text-sky-700 hover:underline"
                        >
                          {ct.name}
                        </Link>
                        {ct.partner && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {t.viaPartner}: {ct.partner.name}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/customers/${ct.customer.id}?tab=contracts`}
                          className="text-slate-700 hover:underline"
                        >
                          {ct.customer.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={contractTypeTone(ct.contractType)}>
                          {contractTypeLabel(ct.contractType, locale)}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={contractStatusTone(ct.status)}>
                            {contractStatusLabel(ct.status, locale)}
                          </Badge>
                          {pastEnd && <Badge tone="amber">{t.pastEnd}</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-3 tabular-nums text-slate-700">
                        {formatAmountDisplay(ct.amount, ct.currency, locale)}
                      </td>
                      <td className="px-3 py-3 tabular-nums text-emerald-700">
                        {arr > 0 ? formatArrUsd(arr) : "—"}
                      </td>
                      <td className="px-3 py-3 text-slate-500">
                        {billingCycleLabel(ct.billingCycle, locale) ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                        {fmtDate(ct.endDate ?? ct.renewsAt, bcp47)}
                      </td>
                      <td className="px-3 py-3 text-slate-500">{ct.customer.owner?.name ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
