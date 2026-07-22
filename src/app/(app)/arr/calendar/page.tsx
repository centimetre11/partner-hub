import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ArrViewSwitch } from "@/components/arr-view-switch";
import { EmptyState, PageHeader, fmtDate } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import {
  ARR_CONTRACT_TYPES,
  contractArrAmount,
  isActiveArrContract,
  latestServiceDateFromContracts,
} from "@/lib/arr";
import { ArrCalendarTable, type CalendarRowData } from "./arr-calendar-table";

export default async function ArrCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; from?: string; to?: string; owner?: string }>;
}) {
  const user = await requireUser();
  const { messages: m, bcp47, locale } = await getServerI18n();
  const t = m.arrCalendar;
  const sp = await searchParams;

  const now = new Date();
  const year = Number(sp.year) || now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const defaultFrom = year === now.getFullYear() ? currentMonth : 1;
  const fromMonth = Math.min(12, Math.max(1, Number(sp.from) || defaultFrom));
  const toMonth = Math.min(12, Math.max(fromMonth, Number(sp.to) || 12));
  const months = Array.from({ length: toMonth - fromMonth + 1 }, (_, i) => fromMonth + i);

  const contracts = await db.contract.findMany({
    where: {
      contractType: { in: [...ARR_CONTRACT_TYPES] },
      status: "ACTIVE",
    },
    include: {
      lineItems: { select: { amount: true, currency: true, cycleYears: true } },
      customer: {
        select: {
          id: true,
          name: true,
          ownerId: true,
          owner: { select: { id: true, name: true } },
        },
      },
    },
  });

  const active = contracts.filter(isActiveArrContract);
  const customerIds = [...new Set(active.map((c) => c.customerId))];

  const [profiles, openTodos, owners, partners, customers, users] = await Promise.all([
    customerIds.length
      ? db.arrCustomerProfile.findMany({
          where: { customerId: { in: customerIds } },
          include: {
            cells: { where: { year, month: { gte: fromMonth, lte: toMonth } } },
          },
        })
      : Promise.resolve([]),
    customerIds.length
      ? db.todoItem.findMany({
          where: {
            customerId: { in: customerIds },
            status: { not: "DONE" },
            source: "ARR",
          },
          select: {
            id: true,
            title: true,
            status: true,
            dueDate: true,
            customerId: true,
            assignee: { select: { name: true } },
          },
          orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        })
      : Promise.resolve([]),
    customerIds.length
      ? db.user.findMany({
          where: { ownedCustomers: { some: { id: { in: customerIds } } } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    Promise.resolve([] as { id: string; name: string }[]),
    customerIds.length
      ? db.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const profileByCustomer = new Map(profiles.map((p) => [p.customerId, p]));
  const todosByCustomer = new Map<string, typeof openTodos>();
  for (const todo of openTodos) {
    if (!todo.customerId) continue;
    const list = todosByCustomer.get(todo.customerId) ?? [];
    list.push(todo);
    todosByCustomer.set(todo.customerId, list);
  }

  const byCustomer = new Map<string, CalendarRowData>();
  for (const ct of active) {
    if (sp.owner && ct.customer.ownerId !== sp.owner) continue;
    let row = byCustomer.get(ct.customerId);
    if (!row) {
      const profile = profileByCustomer.get(ct.customerId);
      const cells: CalendarRowData["cells"] = {};
      for (const cell of profile?.cells ?? []) {
        cells[cell.month] = { content: cell.content };
      }
      const custContracts = active.filter((c) => c.customerId === ct.customerId);
      const computedLatest = latestServiceDateFromContracts(custContracts);
      const latest = profile?.latestServiceAt ?? computedLatest;
      const todos = todosByCustomer.get(ct.customerId) ?? [];
      row = {
        customerId: ct.customerId,
        customerName: ct.customer.name,
        ownerName: ct.customer.owner?.name ?? null,
        arr: 0,
        latestService: latest ? fmtDate(latest, bcp47) : null,
        notes: profile?.situation ?? "",
        legacyTodo: profile?.todo?.trim() ?? "",
        openTodos: todos.map((todo) => ({
          id: todo.id,
          title: todo.title,
          status: todo.status,
          dueDate: todo.dueDate ? todo.dueDate.toISOString() : null,
          assigneeName: todo.assignee?.name ?? null,
        })),
        cells,
      };
      byCustomer.set(ct.customerId, row);
    }
    row.arr += contractArrAmount(ct);
  }

  const rows = [...byCustomer.values()].sort((a, b) => b.arr - a.arr);

  return (
    <div className="pb-16">
      <PageHeader
        title={t.title}
        desc={t.desc.replace("{year}", String(year)).replace("{count}", String(rows.length))}
        actions={<ArrViewSwitch />}
      />

      <div className="px-4 sm:px-6 lg:px-8 space-y-4">
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

        {!rows.length ? (
          <EmptyState text={t.empty} />
        ) : (
          <ArrCalendarTable
            year={year}
            months={months}
            rows={rows}
            locale={locale}
            bcp47={bcp47}
            userId={user.id}
            partners={partners}
            customers={customers}
            users={users}
            copy={{
              colCustomer: t.colCustomer,
              colArr: t.colArr,
              colLatestService: t.colLatestService,
              colOwner: t.colOwner,
              colNotes: t.colNotes,
              colTodo: t.colTodo,
              save: t.save,
              saving: t.saving,
              placeholderCell: t.placeholderCell,
              placeholderNotes: t.placeholderNotes,
              addTodo: t.addTodo,
              noOpenTodos: t.noOpenTodos,
              viewCustomerTodos: t.viewCustomerTodos,
              legacyTodoHint: t.legacyTodoHint,
            }}
          />
        )}
      </div>
    </div>
  );
}
