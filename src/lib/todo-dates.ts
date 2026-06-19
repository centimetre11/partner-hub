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
