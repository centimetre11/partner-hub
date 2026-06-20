/** 常用 Cron 预设 */
export const CRON_PRESETS = [
  { id: "hourly", expr: "0 * * * *", labelZh: "每小时", labelEn: "Every hour" },
  { id: "daily9", expr: "0 9 * * *", labelZh: "每天 9:00", labelEn: "Every day 9:00" },
  { id: "daily18", expr: "0 18 * * *", labelZh: "每天 18:00", labelEn: "Every day 18:00" },
  { id: "weekday9", expr: "0 9 * * 1-5", labelZh: "工作日 9:00", labelEn: "Weekdays 9:00" },
  { id: "monday9", expr: "0 9 * * 1", labelZh: "每周一 9:00", labelEn: "Every Monday 9:00" },
  { id: "monthly1", expr: "0 9 1 * *", labelZh: "每月 1 号 9:00", labelEn: "1st of month 9:00" },
] as const;

const DOW_ZH = ["日", "一", "二", "三", "四", "五", "六"];
const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(n: number) {
  return String(n).padStart(2, "0");
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

/** 从 Cron 表达式计算下次运行时间（UTC 基准，按本地小时/星期解析） */
export function computeNextRunFromCron(
  expr: string,
  from = new Date()
): Date | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minStr, hourStr, domStr, , dowStr] = parts;
  const minute = minStr === "*" ? 0 : parseInt(minStr, 10);
  const hour = hourStr === "*" ? null : parseInt(hourStr, 10);

  const next = new Date(from);
  next.setSeconds(0, 0);

  // 每小时
  if (hourStr === "*" && domStr === "*" && dowStr === "*") {
    next.setMinutes(minute, 0, 0);
    if (next <= from) next.setHours(next.getHours() + 1);
    return next;
  }

  if (hour === null || Number.isNaN(hour)) return null;
  next.setHours(hour, minute, 0, 0);

  // 每天
  if (domStr === "*" && dowStr === "*") {
    if (next <= from) next.setDate(next.getDate() + 1);
    return next;
  }

  // 工作日 1-5 (Mon-Fri in cron, 1=Mon)
  if (domStr === "*" && dowStr === "1-5") {
    for (let i = 0; i < 8; i++) {
      const dow = next.getDay(); // 0=Sun
      const cronDow = dow === 0 ? 7 : dow; // 1=Mon..7=Sun
      if (cronDow >= 1 && cronDow <= 5 && next > from) return next;
      next.setDate(next.getDate() + 1);
      next.setHours(hour, minute, 0, 0);
    }
    return next;
  }

  // 每周特定日
  if (domStr === "*" && dowStr !== "*" && dowStr !== "1-5") {
    const targetDow = parseInt(dowStr, 10) % 7; // cron: 0=Sun, 1=Mon
    for (let i = 0; i < 8; i++) {
      if (next.getDay() === targetDow && next > from) return next;
      next.setDate(next.getDate() + 1);
      next.setHours(hour, minute, 0, 0);
    }
    return next;
  }

  // 每月特定日
  if (domStr !== "*" && dowStr === "*") {
    const targetDom = parseInt(domStr, 10);
    next.setDate(targetDom);
    if (next <= from) next.setMonth(next.getMonth() + 1);
    next.setDate(targetDom);
    next.setHours(hour, minute, 0, 0);
    if (next <= from) {
      next.setMonth(next.getMonth() + 1);
      next.setDate(targetDom);
      next.setHours(hour, minute, 0, 0);
    }
    return next;
  }

  // 兜底：若今天已过则明天
  if (next <= from) next.setDate(next.getDate() + 1);
  return next;
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
  if (locale === "zh") {
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return d.toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
