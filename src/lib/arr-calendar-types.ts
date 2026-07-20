/** ARR customer calendar cell kinds (monthly grid). */

export const ARR_CALENDAR_KIND_CODES = [
  "NOTE",
  "RENEWAL_REMINDER",
  "INSPECTION",
  "FOLLOW_UP",
] as const;
export type ArrCalendarKind = (typeof ARR_CALENDAR_KIND_CODES)[number];

const KIND_SET = new Set<string>(ARR_CALENDAR_KIND_CODES);

export function isArrCalendarKind(value: string): value is ArrCalendarKind {
  return KIND_SET.has(value);
}

export function normalizeArrCalendarKind(raw: string | null | undefined): ArrCalendarKind {
  if (!raw?.trim()) return "NOTE";
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (isArrCalendarKind(upper)) return upper;
  if (/续费|renew/i.test(raw)) return "RENEWAL_REMINDER";
  if (/巡检|inspect|check[- ]?up/i.test(raw)) return "INSPECTION";
  if (/跟进|follow/i.test(raw)) return "FOLLOW_UP";
  return "NOTE";
}

/** Infer kind from free-text content when user hasn't picked one. */
export function inferKindFromContent(content: string | null | undefined): ArrCalendarKind {
  if (!content?.trim()) return "NOTE";
  if (/续费提醒|续费|renewal/i.test(content)) return "RENEWAL_REMINDER";
  if (/巡检|inspection|check[- ]?up/i.test(content)) return "INSPECTION";
  if (/跟进|follow[- ]?up/i.test(content)) return "FOLLOW_UP";
  return "NOTE";
}

export const ARR_CALENDAR_KIND_LABELS_ZH: Record<ArrCalendarKind, string> = {
  NOTE: "备注",
  RENEWAL_REMINDER: "续费提醒",
  INSPECTION: "巡检",
  FOLLOW_UP: "跟进",
};

export const ARR_CALENDAR_KIND_LABELS_EN: Record<ArrCalendarKind, string> = {
  NOTE: "Note",
  RENEWAL_REMINDER: "Renewal reminder",
  INSPECTION: "Inspection",
  FOLLOW_UP: "Follow-up",
};

export function arrCalendarKindLabel(
  raw: string | null | undefined,
  locale: "zh" | "en" = "zh"
): string {
  const code = normalizeArrCalendarKind(raw);
  return locale === "zh" ? ARR_CALENDAR_KIND_LABELS_ZH[code] : ARR_CALENDAR_KIND_LABELS_EN[code];
}

/** Tailwind background classes for calendar cells. */
export function arrCalendarKindCellClass(kind: string | null | undefined): string {
  const code = normalizeArrCalendarKind(kind);
  switch (code) {
    case "RENEWAL_REMINDER":
      return "bg-amber-100/90 border-amber-200";
    case "INSPECTION":
      return "bg-sky-50 border-sky-200";
    case "FOLLOW_UP":
      return "bg-violet-50 border-violet-200";
    default:
      return "bg-white border-slate-100";
  }
}

export function monthLabel(month: number, locale: "zh" | "en" = "zh"): string {
  if (month < 1 || month > 12) return String(month);
  if (locale === "zh") return `${month}月`;
  return new Date(2000, month - 1, 1).toLocaleString("en-US", { month: "short" });
}
