import Link from "next/link";
import { buildPageHref, listPageCount } from "@/lib/list-pagination";
import { formatMsg } from "@/lib/i18n/messages";

export function ListPagination({
  pathname,
  searchParams,
  page,
  total,
  pageSize,
  labels,
}: {
  pathname: string;
  searchParams: Record<string, string | undefined | null>;
  page: number;
  total: number;
  pageSize: number;
  labels: { prevPage: string; nextPage: string; pageOf: string };
}) {
  if (total <= pageSize) return null;
  const totalPages = listPageCount(total, pageSize);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const prevHref = safePage > 1 ? buildPageHref(pathname, searchParams, safePage - 1) : null;
  const nextHref = safePage < totalPages ? buildPageHref(pathname, searchParams, safePage + 1) : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
      <span className="tabular-nums">
        {formatMsg(labels.pageOf, { page: safePage, total: totalPages, count: total })}
      </span>
      <div className="flex items-center gap-2">
        {prevHref ? (
          <Link
            href={prevHref}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
          >
            {labels.prevPage}
          </Link>
        ) : (
          <span className="rounded-md border border-slate-100 px-3 py-1.5 text-slate-300">{labels.prevPage}</span>
        )}
        {nextHref ? (
          <Link
            href={nextHref}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
          >
            {labels.nextPage}
          </Link>
        ) : (
          <span className="rounded-md border border-slate-100 px-3 py-1.5 text-slate-300">{labels.nextPage}</span>
        )}
      </div>
    </div>
  );
}
