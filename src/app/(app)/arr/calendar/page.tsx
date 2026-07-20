import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { EmptyState, PageHeader, fmtDate } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import {
  ARR_CONTRACT_TYPES,
  contractArrAmount,
  isActiveArrContract,
  latestServiceDateFromContracts,
} from "@/lib/arr";
import { normalizeArrCalendarKind } from "@/lib/arr-calendar-types";
import { seedRenewalRemindersAction } from "@/lib/arr-calendar-actions";
import { ArrCalendarTable, type CalendarRowData } from "./arr-calendar-table";

export default async function ArrCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; from?: string; to?: string; owner?: string }>;
}) {
  await requireUser();
  const { messages: m, bcp47, locale } = await getServerI18n();
  const t = m.arrCalendar;
  const sp = await searchParams;

  const now = new Date();
  const year = Number(sp.year) || now.getFullYear();
  const fromMonth = Math.min(12, Math.max(1, Number(sp.from) || 1));
  const toMonth = Math.min(12, Math.max(fromMonth, Number(sp.to) || 12));
  const months = Array.from({ length: toMonth - fromMonth + 1 }, (_, i) => fromMonth + i);

  const contracts = await db.contract.findMany({
    where: {
      contractType: { in: [...ARR_CONTRACT_TYPES] },
      status: "ACTIVE",
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          ownerId: true,
          owner: { select: { id: true, name: true } },
          partnerLinks: {
            include: { partner: { select: { id: true, name: true } } },
            take: 3,
          },
          arrProfile: {
            include: {
              cells: {
                where: { year, month: { gte: fromMonth, lte: toMonth } },
              },
            },
          },
        },
      },
    },
  });

  const active = contracts.filter(isActiveArrContract);
  const customerIds = [...new Set(active.map((c) => c.customerId))];

  // Profiles for ARR customers (may already be included)
  const profiles = await db.arrCustomerProfile.findMany({
    where: { customerId: { in: customerIds } },
    include: {
      cells: { where: { year, month: { gte: fromMonth, lte: toMonth } } },
    },
  });
  const profileByCustomer = new Map(profiles.map((p) => [p.customerId, p]));

  const owners = await db.user.findMany({
    where: { ownedCustomers: { some: { id: { in: customerIds } } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const byCustomer = new Map<string, CalendarRowData>();
  for (const ct of active) {
    if (sp.owner && ct.customer.ownerId !== sp.owner) continue;
    let row = byCustomer.get(ct.customerId);
    if (!row) {
      const profile = profileByCustomer.get(ct.customerId) ?? ct.customer.arrProfile;
      const cells: CalendarRowData["cells"] = {};
      for (const cell of profile?.cells ?? []) {
        cells[cell.month] = {
          content: cell.content,
          kind: normalizeArrCalendarKind(cell.kind),
        };
      }
      const custContracts = active.filter((c) => c.customerId === ct.customerId);
      const computedLatest = latestServiceDateFromContracts(custContracts);
      const latest =
        profile?.latestServiceAt ?? computedLatest;
      row = {
        customerId: ct.customerId,
        customerName: ct.customer.name,
        partnerNames: ct.customer.partnerLinks.map((p) => p.partner.name),
        ownerName: ct.customer.owner?.name ?? null,
        arr: 0,
        latestService: latest ? fmtDate(latest, bcp47) : null,
        situation: profile?.situation ?? "",
        todo: profile?.todo ?? "",
        cells,
      };
      byCustomer.set(ct.customerId, row);
    }
    row.arr += contractArrAmount(ct);
  }

  const rows = [...byCustomer.values()].sort((a, b) => b.arr - a.arr);

  const seedAction = seedRenewalRemindersAction.bind(null, year);

  return (
    <div className="pb-16">
      <PageHeader
        title={t.title}
        desc={t.desc.replace("{year}", String(year)).replace("{count}", String(rows.length))}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/arr"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t.linkArr}
            </Link>
            <form action={seedAction}>
              <button
                type="submit"
                className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-1.5 text-sm hover:bg-amber-100"
              >
                {t.seedRenewals}
              </button>
            </form>
          </div>
        }
      />

      <div className="px-4 sm:px-6 lg:px-8 space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-600 leading-relaxed space-y-1">
          <p>{t.guide1}</p>
          <p>{t.guide2}</p>
          <p>{t.guide3}</p>
        </div>

        <form className="flex flex-wrap gap-2 items-end" method="get">
          <label className="text-xs text-slate-500">
            {t.year}
            <input
              type="number"
              name="year"
              defaultValue={year}
              className="mt-0.5 block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm w-24"
            />
          </label>
          <label className="text-xs text-slate-500">
            {t.fromMonth}
            <select
              name="from"
              defaultValue={fromMonth}
              className="mt-0.5 block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => (
                <option key={mo} value={mo}>
                  {mo}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            {t.toMonth}
            <select
              name="to"
              defaultValue={toMonth}
              className="mt-0.5 block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => (
                <option key={mo} value={mo}>
                  {mo}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            {t.owner}
            <select
              name="owner"
              defaultValue={sp.owner ?? ""}
              className="mt-0.5 block rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm min-w-[8rem]"
            >
              <option value="">{t.allOwners}</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800"
          >
            {m.common.filter}
          </button>
        </form>

        <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-amber-100 border border-amber-200" />
            {t.legendRenewal}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-sky-50 border border-sky-200" />
            {t.legendInspection}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-violet-50 border border-violet-200" />
            {t.legendFollowUp}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-white border border-slate-200" />
            {t.legendNote}
          </span>
        </div>

        {!rows.length ? (
          <EmptyState text={t.empty} />
        ) : (
          <ArrCalendarTable
            year={year}
            months={months}
            rows={rows}
            locale={locale}
            copy={{
              colCustomer: t.colCustomer,
              colPartner: t.colPartner,
              colArr: t.colArr,
              colLatestService: t.colLatestService,
              colOwner: t.colOwner,
              colSituation: t.colSituation,
              colTodo: t.colTodo,
              kindLabel: t.kindLabel,
              save: t.save,
              saving: t.saving,
              placeholderCell: t.placeholderCell,
              placeholderSituation: t.placeholderSituation,
              placeholderTodo: t.placeholderTodo,
            }}
          />
        )}
      </div>
    </div>
  );
}
