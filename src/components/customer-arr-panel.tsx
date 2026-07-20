import Link from "next/link";
import { EmptyState, fmtDate } from "@/components/ui";
import {
  arrCalendarKindCellClass,
  arrCalendarKindLabel,
  monthLabel,
  type ArrCalendarKind,
} from "@/lib/arr-calendar-types";
import { contractTypeLabel } from "@/lib/contract-types";

type ArrContractRow = {
  id: string;
  name: string;
  contractType: string;
  arr: number;
  renewsAt: Date | null;
  endDate: Date | null;
};

type PlanCell = {
  month: number;
  content: string;
  kind: ArrCalendarKind;
};

type OpenTodo = {
  id: string;
  title: string;
  dueDate: Date | null;
};

type Copy = {
  arrOpenCalendar: string;
  arrTotalLabel: string;
  arrNoContracts: string;
  arrSituationLabel: string;
  arrPlanThisYear: string;
  arrNoPlanCells: string;
  arrOpenTodos: string;
  arrViewAllTodos: string;
  arrContractsHeading: string;
  arrRenewsPrefix: string;
  arrEndsPrefix: string;
  openTodosEmpty: string;
  todoDuePrefix: string;
};

export function CustomerArrPanel({
  customerId,
  year,
  totalArr,
  situation,
  contracts,
  cells,
  openTodos,
  locale,
  bcp47,
  copy,
}: {
  customerId: string;
  year: number;
  totalArr: number;
  situation: string;
  contracts: ArrContractRow[];
  cells: PlanCell[];
  openTodos: OpenTodo[];
  locale: "zh" | "en";
  bcp47: string;
  copy: Copy;
}) {
  const calendarHref = `/arr/calendar?year=${year}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">{copy.arrTotalLabel}</p>
          <p className="text-2xl font-semibold tabular-nums text-emerald-700">
            {totalArr.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </p>
        </div>
        <Link
          href={calendarHref}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-50"
        >
          {copy.arrOpenCalendar}
        </Link>
      </div>

      {situation ? (
        <div>
          <h3 className="text-sm font-semibold text-slate-800 mb-1.5">{copy.arrSituationLabel}</h3>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{situation}</p>
        </div>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-2">{copy.arrContractsHeading}</h3>
        {contracts.length === 0 ? (
          <EmptyState text={copy.arrNoContracts} />
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {contracts.map((ct) => (
              <li key={ct.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <Link href={`/contracts/${ct.id}`} className="font-medium text-sky-700 hover:underline">
                    {ct.name}
                  </Link>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {contractTypeLabel(ct.contractType, locale)}
                    {ct.renewsAt ? ` · ${copy.arrRenewsPrefix} ${fmtDate(ct.renewsAt, bcp47)}` : ""}
                    {!ct.renewsAt && ct.endDate
                      ? ` · ${copy.arrEndsPrefix} ${fmtDate(ct.endDate, bcp47)}`
                      : ""}
                  </p>
                </div>
                <span className="tabular-nums text-emerald-700 font-medium shrink-0">
                  {ct.arr.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-800">
            {copy.arrPlanThisYear.replace("{year}", String(year))}
          </h3>
          <Link href={calendarHref} className="text-xs text-sky-700 hover:underline">
            {copy.arrOpenCalendar}
          </Link>
        </div>
        {cells.length === 0 ? (
          <EmptyState text={copy.arrNoPlanCells} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {cells.map((cell) => (
              <Link
                key={cell.month}
                href={calendarHref}
                className={`rounded-lg border px-2.5 py-2 text-left hover:opacity-90 ${arrCalendarKindCellClass(cell.kind)}`}
              >
                <div className="text-[11px] font-medium text-slate-600">
                  {monthLabel(cell.month, locale)}
                  <span className="ml-1 text-slate-400 font-normal">
                    · {arrCalendarKindLabel(cell.kind, locale)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-700 whitespace-pre-wrap line-clamp-3">
                  {cell.content}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-800">{copy.arrOpenTodos}</h3>
          <Link
            href={`/customers/${customerId}`}
            className="text-xs text-sky-700 hover:underline"
          >
            {copy.arrViewAllTodos}
          </Link>
        </div>
        {openTodos.length === 0 ? (
          <EmptyState text={copy.openTodosEmpty} />
        ) : (
          <ul className="space-y-2">
            {openTodos.map((t) => (
              <li key={t.id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <div className="text-slate-800">{t.title}</div>
                {t.dueDate && (
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {copy.todoDuePrefix} {fmtDate(t.dueDate, bcp47)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
