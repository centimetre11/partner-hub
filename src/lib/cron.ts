/** 常用 Cron 预设 */
export const CRON_PRESETS = [
  { id: "hourly", expr: "0 * * * *", labelZh: "每小时", labelEn: "Every hour" },
  { id: "daily9", expr: "0 9 * * *", labelZh: "每天 9:00", labelEn: "Every day 9:00" },
  { id: "daily18", expr: "0 18 * * *", labelZh: "每天 18:00", labelEn: "Every day 18:00" },
  { id: "weekday9", expr: "0 9 * * 1-5", labelZh: "工作日 9:00", labelEn: "Weekdays 9:00" },
  { id: "monday9", expr: "0 9 * * 1", labelZh: "每周一 9:00", labelEn: "Every Monday 9:00" },
  { id: "monthly1", expr: "0 9 1 * *", labelZh: "每月 1 号 9:00", labelEn: "1st of month 9:00" },
] as const;

/** Cron 调度默认时区（Agent 未设置 timezone 时的兜底；容器 TZ 建议与此一致） */
export const SCHEDULER_TIMEZONE = process.env.SCHEDULER_TIMEZONE || "Asia/Riyadh";

const VALID_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

/** 解析 Agent/表单上的时区；无效值回退到 SCHEDULER_TIMEZONE */
export function resolveAgentTimezone(timezone?: string | null): string {
  const tz = timezone?.trim();
  if (tz && VALID_TIMEZONES.has(tz)) return tz;
  if (tz) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return tz;
    } catch {
      /* invalid */
    }
  }
  return SCHEDULER_TIMEZONE;
}

const DOW_ZH = ["日", "一", "二", "三", "四", "五", "六"];
const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_SHORT: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

export function getZonedParts(date: Date, timeZone = SCHEDULER_TIMEZONE): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: parseInt(pick("year"), 10),
    month: parseInt(pick("month"), 10),
    day: parseInt(pick("day"), 10),
    hour: parseInt(pick("hour"), 10) % 24,
    minute: parseInt(pick("minute"), 10),
    weekday: WEEKDAY_SHORT[pick("weekday")] ?? 0,
  };
}

/** 将业务时区的本地年月日时分转为 UTC Date */
export function zonedLocalToUtc(
  local: Pick<ZonedParts, "year" | "month" | "day" | "hour" | "minute">,
  timeZone = SCHEDULER_TIMEZONE
): Date {
  let utcMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0);
  for (let i = 0; i < 4; i++) {
    const actual = getZonedParts(new Date(utcMs), timeZone);
    const targetMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0);
    const actualMs = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0);
    utcMs += targetMs - actualMs;
  }
  return new Date(utcMs);
}

export function addLocalDays(
  year: number,
  month: number,
  day: number,
  days: number,
  timeZone = SCHEDULER_TIMEZONE
): Pick<ZonedParts, "year" | "month" | "day"> {
  const anchor = zonedLocalToUtc({ year, month, day, hour: 12, minute: 0 }, timeZone);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  const p = getZonedParts(anchor, timeZone);
  return { year: p.year, month: p.month, day: p.day };
}

function cronWeekday(localWeekday: number): number {
  return localWeekday === 0 ? 7 : localWeekday;
}

/** 将 Cron 表达式转为可读描述 */
export function describeCron(expr: string, locale: "zh" | "en" = "zh"): string {
  const preset = CRON_PRESETS.find((p) => p.expr === expr.trim());
  if (preset) return locale === "zh" ? preset.labelZh : preset.labelEn;

  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;

  const [min, hour, dom, , dow] = parts;
  const isZh = locale === "zh";

  if (min === "0" && hour === "*" && dom === "*" && dow === "*") {
    return isZh ? "每小时整点" : "Every hour";
  }
  if (min === "0" && hour !== "*" && dom === "*" && dow === "*") {
    return isZh ? `每天 ${hour}:00` : `Every day at ${hour}:00`;
  }
  if (min === "0" && hour !== "*" && dom === "*" && dow === "1-5") {
    return isZh ? `工作日 ${hour}:00` : `Weekdays at ${hour}:00`;
  }
  if (min === "0" && hour !== "*" && dom === "*" && dow !== "*" && dow !== "1-5") {
    const d = parseInt(dow, 10);
    const dayLabel = isZh ? `周${DOW_ZH[d % 7]}` : DOW_EN[d % 7];
    return isZh ? `每${dayLabel} ${hour}:00` : `Every ${dayLabel} at ${hour}:00`;
  }
  if (min === "0" && hour !== "*" && dom !== "*" && dow === "*") {
    return isZh ? `每月 ${dom} 号 ${hour}:00` : `${dom}th of month at ${hour}:00`;
  }
  return expr;
}

/** 从 Cron 表达式计算下次运行时间（按 SCHEDULER_TIMEZONE 解析小时/星期） */
export function computeNextRunFromCron(
  expr: string,
  from = new Date(),
  timeZone = SCHEDULER_TIMEZONE
): Date | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minStr, hourStr, domStr, , dowStr] = parts;
  const minute = minStr === "*" ? 0 : parseInt(minStr, 10);
  const hour = hourStr === "*" ? null : parseInt(hourStr, 10);
  const now = getZonedParts(from, timeZone);

  // 每小时
  if (hourStr === "*" && domStr === "*" && dowStr === "*") {
    let candidate = zonedLocalToUtc(
      { year: now.year, month: now.month, day: now.day, hour: now.hour, minute },
      timeZone
    );
    if (candidate <= from) {
      const nextHour = zonedLocalToUtc(
        { year: now.year, month: now.month, day: now.day, hour: now.hour + 1, minute },
        timeZone
      );
      candidate = nextHour;
    }
    return candidate;
  }

  if (hour === null || Number.isNaN(hour)) return null;

  // 每天
  if (domStr === "*" && dowStr === "*") {
    let { year, month, day } = now;
    let candidate = zonedLocalToUtc({ year, month, day, hour, minute }, timeZone);
    if (candidate <= from) {
      ({ year, month, day } = addLocalDays(year, month, day, 1, timeZone));
      candidate = zonedLocalToUtc({ year, month, day, hour, minute }, timeZone);
    }
    return candidate;
  }

  // 工作日 1-5 (Mon-Fri in cron)
  if (domStr === "*" && dowStr === "1-5") {
    for (let offset = 0; offset < 8; offset++) {
      const { year, month, day } = addLocalDays(now.year, now.month, now.day, offset, timeZone);
      const wd = getZonedParts(zonedLocalToUtc({ year, month, day, hour: 12, minute: 0 }, timeZone), timeZone)
        .weekday;
      const cronDow = cronWeekday(wd);
      if (cronDow >= 1 && cronDow <= 5) {
        const candidate = zonedLocalToUtc({ year, month, day, hour, minute }, timeZone);
        if (candidate > from) return candidate;
      }
    }
    return null;
  }

  // 每周特定日
  if (domStr === "*" && dowStr !== "*" && dowStr !== "1-5") {
    const targetDow = parseInt(dowStr, 10) % 7;
    for (let offset = 0; offset < 8; offset++) {
      const { year, month, day } = addLocalDays(now.year, now.month, now.day, offset, timeZone);
      const wd = getZonedParts(zonedLocalToUtc({ year, month, day, hour: 12, minute: 0 }, timeZone), timeZone)
        .weekday;
      if (wd === targetDow) {
        const candidate = zonedLocalToUtc({ year, month, day, hour, minute }, timeZone);
        if (candidate > from) return candidate;
      }
    }
    return null;
  }

  // 每月特定日
  if (domStr !== "*" && dowStr === "*") {
    const targetDom = parseInt(domStr, 10);
    for (let monthOffset = 0; monthOffset < 14; monthOffset++) {
      const anchor = zonedLocalToUtc({ year: now.year, month: now.month, day: 1, hour: 12, minute: 0 }, timeZone);
      anchor.setUTCMonth(anchor.getUTCMonth() + monthOffset);
      const monthParts = getZonedParts(anchor, timeZone);
      let candidate = zonedLocalToUtc(
        { year: monthParts.year, month: monthParts.month, day: targetDom, hour, minute },
        timeZone
      );
      if (candidate > from) return candidate;
    }
    return null;
  }

  let { year, month, day } = now;
  let candidate = zonedLocalToUtc({ year, month, day, hour, minute }, timeZone);
  if (candidate <= from) {
    ({ year, month, day } = addLocalDays(year, month, day, 1, timeZone));
    candidate = zonedLocalToUtc({ year, month, day, hour, minute }, timeZone);
  }
  return candidate;
}

/** Cron 表达式映射到 Agent frequency/runHour/runWeekday（兼容旧调度） */
export function cronToAgentSchedule(expr: string): {
  frequency: "HOURLY" | "DAILY" | "WEEKLY";
  runHour: number;
  runWeekday: number;
} {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return { frequency: "DAILY", runHour: 9, runWeekday: 1 };

  const [, hourStr, domStr, , dowStr] = parts;
  if (hourStr === "*") return { frequency: "HOURLY", runHour: 9, runWeekday: 1 };

  const runHour = parseInt(hourStr, 10) || 9;
  if (domStr !== "*") return { frequency: "WEEKLY", runHour, runWeekday: 1 };
  if (dowStr !== "*" && dowStr !== "1-5") {
    const d = parseInt(dowStr, 10);
    return { frequency: "WEEKLY", runHour, runWeekday: d === 0 ? 7 : d };
  }
  return { frequency: "DAILY", runHour, runWeekday: 1 };
}

export function formatScheduleShort(expr: string | null | undefined, locale: "zh" | "en"): string {
  if (!expr) return locale === "zh" ? "未配置" : "Not configured";
  return describeCron(expr, locale);
}

export function formatTimeShort(d: Date, locale: "zh" | "en"): string {
  const timeZone = locale === "zh" ? SCHEDULER_TIMEZONE : undefined;
  if (locale === "zh") {
    const p = getZonedParts(d, timeZone);
    return `${p.month}/${p.day} ${pad(p.hour)}:${pad(p.minute)}`;
  }
  return d.toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}
