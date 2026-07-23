/** 会前/推荐共用的时间窗（可在 client / server 使用） */

export type FactsRangeDates = {
  /** YYYY-MM-DD */
  since: string;
  /** YYYY-MM-DD */
  until: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 默认：此前一周（含今天） */
export function defaultFactsRangeDates(now = new Date()): FactsRangeDates {
  const until = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const since = new Date(until);
  since.setDate(since.getDate() - 7);
  return {
    since: toDateInputValue(since),
    until: toDateInputValue(until),
  };
}

export function parseFactsRange(
  sinceStr: string | null | undefined,
  untilStr: string | null | undefined,
  fallback = defaultFactsRangeDates(),
): { since: Date; until: Date } {
  const sinceRaw = (sinceStr ?? fallback.since).trim();
  const untilRaw = (untilStr ?? fallback.until).trim();
  let since = new Date(`${sinceRaw}T00:00:00`);
  let until = new Date(`${untilRaw}T23:59:59.999`);
  if (Number.isNaN(since.getTime())) since = new Date(`${fallback.since}T00:00:00`);
  if (Number.isNaN(until.getTime())) until = new Date(`${fallback.until}T23:59:59.999`);
  if (since.getTime() > until.getTime()) {
    const tmp = since;
    since = new Date(until);
    since.setHours(0, 0, 0, 0);
    until = new Date(tmp);
    until.setHours(23, 59, 59, 999);
  }
  return { since, until };
}

export function formatFactsRangeLabel(since: string, until: string): string {
  const a = since.replace(/-/g, "/");
  const b = until.replace(/-/g, "/");
  return `${a} – ${b}`;
}
