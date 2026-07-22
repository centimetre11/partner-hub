export const DEFAULT_LIST_PAGE_SIZE = 50;

export function parseListPage(raw: string | undefined | null, pageSize = DEFAULT_LIST_PAGE_SIZE) {
  const n = Number(raw);
  const page = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  const take = pageSize;
  const skip = (page - 1) * take;
  return { page, take, skip };
}

export function listPageCount(total: number, pageSize = DEFAULT_LIST_PAGE_SIZE) {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/** Build href preserving filters; omits page=1; drops empty values. */
export function buildPageHref(
  pathname: string,
  current: Record<string, string | undefined | null>,
  page: number,
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (k === "page") continue;
    if (v != null && String(v).trim()) params.set(k, String(v).trim());
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
