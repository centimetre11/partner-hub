/** Start of local calendar day (00:00:00.000). */
export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** True when due date is strictly before today (overdue from the day after due date). */
export function isTodoOverdue(dueDate: Date | string, now = new Date()): boolean {
  return startOfLocalDay(new Date(dueDate)) < startOfLocalDay(now);
}

/** Prisma filter for open todos whose due date is before today. */
export function overdueDueDateBefore(now = new Date()): Date {
  return startOfLocalDay(now);
}

/** End of local calendar day (23:59:59.999). */
export function endOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Inclusive window: due from start of today through end of (today + days - 1). days=3 → today, tomorrow, day after. */
export function dueWithinDaysRange(days: number, now = new Date()): { gte: Date; lte: Date } | null {
  const n = Math.floor(Number(days));
  if (!Number.isFinite(n) || n < 1 || n > 90) return null;
  const gte = startOfLocalDay(now);
  const lte = endOfLocalDay(new Date(gte.getTime() + (n - 1) * 86400000));
  return { gte, lte };
}
