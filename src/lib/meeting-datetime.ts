/** 会议时间：datetime-local 墙钟 + IANA 时区 ↔ UTC 瞬间 */

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export type WallClockParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** 解析 datetime-local 字符串（不含时区偏移）。 */
export function parseWallClockLocal(value: string): WallClockParts | null {
  const m = value.trim().match(LOCAL_RE);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] ?? "0"),
  };
}

function getTimeZoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(instant).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/**
 * 将用户在指定 IANA 时区选择的墙钟时间转为 UTC 瞬间。
 * 例：2026-07-18T11:30 @ Asia/Shanghai → 2026-07-18T03:30:00.000Z
 */
export function parseDateTimeLocal(value: string, timeZone: string): Date | null {
  const wall = parseWallClockLocal(value);
  if (!wall) return null;
  const tz = timeZone.trim() || "UTC";

  let utcMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  for (let i = 0; i < 3; i++) {
    const offset = getTimeZoneOffsetMs(new Date(utcMs), tz);
    utcMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) - offset;
  }
  const d = new Date(utcMs);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Google Calendar API：dateTime 字段用墙钟 + timeZone，勿用 toISOString()。 */
export function toGoogleCalendarDateTime(localValue: string): string | null {
  const wall = parseWallClockLocal(localValue);
  if (!wall) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}`;
}

export function toDateTimeLocalInput(date: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

/** 企业邮会议时间行：2026/7/18 11:30 */
export function formatExmailMeetingTime(instant: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(instant).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  const hour = parts.hour === "24" ? "0" : parts.hour;
  return `${parts.year}/${parts.month}/${parts.day} ${hour}:${parts.minute}`;
}

export function formatMeetingWindow(
  start: Date,
  end: Date,
  timeZone: string,
  locale: "zh" | "en",
): string {
  const loc = locale === "zh" ? "zh-CN" : "en-US";
  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  };
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    hour12: false,
  };
  const datePart = start.toLocaleDateString(loc, dateOpts);
  const startTime = start.toLocaleTimeString(loc, timeOpts);
  const endTime = end.toLocaleTimeString(loc, timeOpts);
  const tzLabel = formatTimeZoneLabel(timeZone, start, loc);
  return `${datePart}, ${startTime} – ${endTime} (${tzLabel})`;
}

export function formatTimeZoneLabel(timeZone: string, instant: Date, locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(instant);
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value;
    return tzName ? `${timeZone} ${tzName}` : timeZone;
  } catch {
    return timeZone;
  }
}

/** ISO 字符串转 datetime-local（按指定时区的墙钟）。 */
export function isoToDateTimeLocal(iso: string | undefined, timeZone: string): string | null {
  if (!iso?.trim()) return null;
  const trimmed = iso.trim();
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) return trimmed.slice(0, 16);
    return null;
  }
  return toDateTimeLocalInput(d, timeZone);
}

export function getBrowserTimeZone(): string {
  if (typeof Intl === "undefined") return "UTC";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function defaultMeetingStartLocal(timeZone?: string): string {
  const tz = timeZone ?? getBrowserTimeZone();
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toDateTimeLocalInput(d, tz);
}

export function defaultMeetingEndLocal(timeZone?: string): string {
  const tz = timeZone ?? getBrowserTimeZone();
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 2);
  return toDateTimeLocalInput(d, tz);
}
