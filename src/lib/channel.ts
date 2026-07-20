import { getZonedParts, resolveAgentTimezone, SCHEDULER_TIMEZONE } from "./cron";

export const CHANNEL_DEFAULT_DATA_URL =
  "https://crm.finereporthelp.com/WebReport/decision/url/pub/crm/data?id=9deb46a22a1e433abfbf564eaa55ff12&secret=channel12345";

export const CHANNEL_BACKFILL_START_DEFAULT = "2025-01-01";

/** 无 clue_id 时用 com:<com_id> 兜底为主键 */
export const CHANNEL_COM_PREFIX = "com:";

export type CrmChannelRow = {
  clue_id?: string;
  com_id?: string;
  com_name?: string;
  com_status?: string;
  com_province?: string;
  cou_CN_name?: string;
  com_city?: string;
  reg?: string;
  zone?: string;
  com_rank?: string;
  com_source?: string;
  source?: string;
  actphone?: string;
  cont_name?: string;
  cont_email?: string;
  cont_duty?: string;
  com_salesman?: string;
  typedetail?: string;
  com_oversea_agent?: string;
  cont_recdate?: string;
  sta_sales_old?: string;
  sta_recdate?: string;
};

export type CrmChannelResponse = {
  success: boolean;
  error?: string;
  data?: CrmChannelRow[];
};

export type CrmChannelUpsert = {
  id: string;
  companyId: string | null;
  name: string | null;
  status: string | null;
  province: string | null;
  countryCn: string | null;
  city: string | null;
  region: string | null;
  zone: string | null;
  rank: string | null;
  source: string | null;
  sourceDetail: string | null;
  phone: string | null;
  contName: string | null;
  contEmail: string | null;
  contDuty: string | null;
  salesman: string | null;
  typeDetail: string | null;
  overseaAgent: string | null;
  contRecdate: Date | null;
  staSalesOld: string | null;
  staRecdate: Date | null;
};

export function getChannelDataUrlBase() {
  return process.env.CHANNEL_DATA_URL?.trim() || CHANNEL_DEFAULT_DATA_URL;
}

export function getChannelSyncTimezone() {
  return resolveAgentTimezone(process.env.CHANNEL_SYNC_TIMEZONE ?? SCHEDULER_TIMEZONE);
}

export function getChannelBackfillStart() {
  const raw = process.env.CHANNEL_BACKFILL_START?.trim() || CHANNEL_BACKFILL_START_DEFAULT;
  return parseYmd(raw) ? raw : CHANNEL_BACKFILL_START_DEFAULT;
}

const CHANNEL_FETCH_TIMEOUT_MS = Number(process.env.CHANNEL_FETCH_TIMEOUT_MS ?? "90000");

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function formatYmd(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function parseYmd(raw: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** 日历月 +1（日固定为 1） */
export function addOneMonthYmd(ymd: string): string {
  const p = parseYmd(ymd);
  if (!p) throw new Error(`Invalid YMD: ${ymd}`);
  let { year, month } = p;
  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return formatYmd(year, month, 1);
}

export function compareYmd(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function getTodayYmd(timeZone = getChannelSyncTimezone()): string {
  const p = getZonedParts(new Date(), timeZone);
  return formatYmd(p.year, p.month, p.day);
}

export function getTomorrowYmd(timeZone = getChannelSyncTimezone()): string {
  const p = getZonedParts(new Date(), timeZone);
  // 用 UTC 日期算术避免夏令时边界问题：先取当日 12:00 UTC 再 +1 天
  const noonUtc = Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0);
  const next = getZonedParts(new Date(noonUtc + 24 * 60 * 60 * 1000), timeZone);
  return formatYmd(next.year, next.month, next.day);
}

export function getMonthStartYmd(timeZone = getChannelSyncTimezone()): string {
  const p = getZonedParts(new Date(), timeZone);
  return formatYmd(p.year, p.month, 1);
}

export function buildChannelDataUrl(startdate: string, enddate: string, base = getChannelDataUrlBase()) {
  const url = new URL(base);
  url.searchParams.set("startdate", startdate);
  url.searchParams.set("enddate", enddate);
  return url.toString();
}

export async function fetchChannelData(startdate: string, enddate: string): Promise<CrmChannelRow[]> {
  const url = buildChannelDataUrl(startdate, enddate);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHANNEL_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Channel data API HTTP ${res.status}`);
    }
    const json = (await res.json()) as CrmChannelResponse;
    if (!json.success || !Array.isArray(json.data)) {
      throw new Error(json.error || "Channel data API returned invalid payload");
    }
    return json.data;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`Channel data API timeout after ${CHANNEL_FETCH_TIMEOUT_MS}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function parseChannelDate(raw: string | undefined | null) {
  if (!raw?.trim()) return null;
  const normalized = raw.trim().replace(" ", "T");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function trimOrNull(raw: string | undefined | null) {
  const v = raw?.trim();
  return v ? v : null;
}

function resolveChannelId(row: CrmChannelRow): string | null {
  const clueId = row.clue_id?.trim();
  if (clueId) return clueId;
  const comId = row.com_id?.trim();
  if (comId) return `${CHANNEL_COM_PREFIX}${comId}`;
  return null;
}

/** 返回真实 CRM clue_id；com: 兜底无 clue_id */
export function getChannelClueId(channelId: string): string | null {
  return channelId.startsWith(CHANNEL_COM_PREFIX) ? null : channelId;
}

export function normalizeChannelRows(rows: CrmChannelRow[]) {
  const channels = new Map<string, CrmChannelUpsert>();

  for (const row of rows) {
    const id = resolveChannelId(row);
    if (!id) continue;

    channels.set(id, {
      id,
      companyId: trimOrNull(row.com_id),
      name: trimOrNull(row.com_name),
      status: trimOrNull(row.com_status),
      province: trimOrNull(row.com_province),
      countryCn: trimOrNull(row.cou_CN_name),
      city: trimOrNull(row.com_city),
      region: trimOrNull(row.reg),
      zone: trimOrNull(row.zone),
      rank: trimOrNull(row.com_rank),
      source: trimOrNull(row.com_source),
      sourceDetail: trimOrNull(row.source),
      phone: trimOrNull(row.actphone),
      contName: trimOrNull(row.cont_name),
      contEmail: trimOrNull(row.cont_email),
      contDuty: trimOrNull(row.cont_duty),
      salesman: trimOrNull(row.com_salesman),
      typeDetail: trimOrNull(row.typedetail),
      overseaAgent: trimOrNull(row.com_oversea_agent),
      contRecdate: parseChannelDate(row.cont_recdate),
      staSalesOld: trimOrNull(row.sta_sales_old),
      staRecdate: parseChannelDate(row.sta_recdate),
    });
  }

  return { channels: [...channels.values()] };
}
