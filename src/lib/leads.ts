export const LEADS_DEFAULT_DATA_URL =
  "https://crm.fineres.com/crm/api/pub/data?id=79a8c7c489314494ba78eed58d269c8a&secret=crm123";

// 仅保留该年份的线索（按 com_recdate KPI 开始时间过滤）
export const LEADS_TARGET_YEAR = 2026;

/** com_status 为新线索时的取值（其余视为培育线索） */
export const NEW_LEAD_STATUSES = ["销售尚未联络", "尚未联络"] as const;
export const NEW_LEAD_STATUS = NEW_LEAD_STATUSES[0];

export function isNewLeadStatus(status: string | null | undefined) {
  const s = status?.trim() ?? "";
  if (!s) return true;
  return (NEW_LEAD_STATUSES as readonly string[]).includes(s);
}

export type CrmLeadRow = {
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
  tags?: string;
  sdr_state?: string;
  actphone?: string;
  cont_name?: string;
  cont_email?: string;
  cont_duty?: string;
  com_salesman?: string;
  typedetail?: string;
  com_oversea_agent?: string;
  detail?: string;
  trace_detail?: string;
  com_recdate?: string;
  cont_recdate?: string;
  jz_date?: string;
};

export type CrmLeadsResponse = {
  success: boolean;
  error?: string;
  data?: CrmLeadRow[];
};

export function getLeadsDataUrl() {
  return process.env.LEADS_DATA_URL?.trim() || LEADS_DEFAULT_DATA_URL;
}

const LEADS_FETCH_TIMEOUT_MS = Number(process.env.LEADS_FETCH_TIMEOUT_MS ?? "90000");

let inflightFetch: Promise<CrmLeadRow[]> | null = null;
let cachedRows: CrmLeadRow[] | null = null;
let cachedAt = 0;

/** 并发去重 + 可选复用近期缓存，避免多次刷新重复拉全量。 */
export async function fetchLeadsDataCached(options?: { force?: boolean; maxAgeMs?: number }) {
  const maxAgeMs = options?.maxAgeMs ?? 0;
  if (!options?.force && cachedRows && Date.now() - cachedAt <= maxAgeMs) {
    return cachedRows;
  }
  if (inflightFetch) return inflightFetch;

  inflightFetch = fetchLeadsData()
    .then((rows) => {
      cachedRows = rows;
      cachedAt = Date.now();
      return rows;
    })
    .finally(() => {
      inflightFetch = null;
    });

  return inflightFetch;
}

export function invalidateLeadsDataCache() {
  cachedRows = null;
  cachedAt = 0;
}

export async function fetchLeadsData(url = getLeadsDataUrl()): Promise<CrmLeadRow[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LEADS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Leads data API HTTP ${res.status}`);
    }
    const json = (await res.json()) as CrmLeadsResponse;
    if (!json.success || !Array.isArray(json.data)) {
      throw new Error(json.error || "Leads data API returned invalid payload");
    }
    return json.data;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`Leads data API timeout after ${LEADS_FETCH_TIMEOUT_MS}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function parseLeadDate(raw: string | undefined | null) {
  if (!raw?.trim()) return null;
  const normalized = raw.trim().replace(" ", "T");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function trimOrNull(raw: string | undefined | null) {
  const v = raw?.trim();
  return v ? v : null;
}

/** 无 clue_id 时用 com:<com_id> 兜底为主键，这类线索没有真实 CRM clue_id。 */
export const CRM_LEAD_COM_PREFIX = "com:";

function resolveLeadId(row: CrmLeadRow): string | null {
  const clueId = row.clue_id?.trim();
  if (clueId) return clueId;
  const comId = row.com_id?.trim();
  if (comId) return `${CRM_LEAD_COM_PREFIX}${comId}`;
  return null;
}

/** 返回真实 CRM clue_id：兜底（com: 前缀）线索没有 clue_id，返回 null。 */
export function getClueId(leadId: string): string | null {
  return leadId.startsWith(CRM_LEAD_COM_PREFIX) ? null : leadId;
}

export type CrmLeadUpsert = {
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
  tags: string | null;
  sdrState: string | null;
  phone: string | null;
  contName: string | null;
  contEmail: string | null;
  contDuty: string | null;
  salesman: string | null;
  typeDetail: string | null;
  overseaAgent: string | null;
  detail: string | null;
  traceDetail: string | null;
  recdate: Date | null;
  contRecdate: Date | null;
  jzDate: Date | null;
};

export function normalizeLeadRows(rows: CrmLeadRow[]) {
  const leads = new Map<string, CrmLeadUpsert>();

  for (const row of rows) {
    const id = resolveLeadId(row);
    if (!id) continue;

    const recdate = parseLeadDate(row.com_recdate);
    if (!recdate || recdate.getFullYear() !== LEADS_TARGET_YEAR) continue;

    leads.set(id, {
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
      tags: trimOrNull(row.tags),
      sdrState: trimOrNull(row.sdr_state),
      phone: trimOrNull(row.actphone),
      contName: trimOrNull(row.cont_name),
      contEmail: trimOrNull(row.cont_email),
      contDuty: trimOrNull(row.cont_duty),
      salesman: trimOrNull(row.com_salesman),
      typeDetail: trimOrNull(row.typedetail),
      overseaAgent: trimOrNull(row.com_oversea_agent),
      detail: trimOrNull(row.detail),
      traceDetail: trimOrNull(row.trace_detail),
      recdate,
      contRecdate: parseLeadDate(row.cont_recdate),
      jzDate: parseLeadDate(row.jz_date),
    });
  }

  return { leads: [...leads.values()] };
}

function normalizeLeadRow(row: CrmLeadRow): CrmLeadUpsert | null {
  const id = resolveLeadId(row);
  if (!id) return null;

  const recdate = parseLeadDate(row.com_recdate);
  if (!recdate || recdate.getFullYear() !== LEADS_TARGET_YEAR) return null;

  return {
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
    tags: trimOrNull(row.tags),
    sdrState: trimOrNull(row.sdr_state),
    phone: trimOrNull(row.actphone),
    contName: trimOrNull(row.cont_name),
    contEmail: trimOrNull(row.cont_email),
    contDuty: trimOrNull(row.cont_duty),
    salesman: trimOrNull(row.com_salesman),
    typeDetail: trimOrNull(row.typedetail),
    overseaAgent: trimOrNull(row.com_oversea_agent),
    detail: trimOrNull(row.detail),
    traceDetail: trimOrNull(row.trace_detail),
    recdate,
    contRecdate: parseLeadDate(row.cont_recdate),
    jzDate: parseLeadDate(row.jz_date),
  };
}

/** 在全量 API 数据中只查找并归一化一条线索，避免 normalize 全部记录。 */
export function findNormalizedLeadByClueId(rows: CrmLeadRow[], clueId: string) {
  for (const row of rows) {
    if (row.clue_id?.trim() !== clueId) continue;
    return normalizeLeadRow(row);
  }
  return null;
}

export type CrmLeadAction = "toNurture" | "toChannel" | "toCustomer" | "edit" | "shift" | "view";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** KPI 截止距今天数（按本地日历日；无截止日返回 null；培育线索不关注 KPI） */
export function getKpiDaysRemaining(
  jzDate: Date | null | undefined,
  now = new Date(),
  status?: string | null,
) {
  if (isNurturingLead(status)) return null;
  if (!jzDate) return null;
  const today = startOfLocalDay(now).getTime();
  const deadline = startOfLocalDay(jzDate).getTime();
  return Math.round((deadline - today) / MS_PER_DAY);
}

/** 截止日在 3 天内（含已过期）标为紧急；培育线索不标红 */
export function isKpiDeadlineUrgent(
  jzDate: Date | null | undefined,
  now = new Date(),
  status?: string | null,
) {
  const days = getKpiDaysRemaining(jzDate, now, status);
  return days !== null && days <= 3;
}

/** KPI 截止时间由近到远；无截止日的排最后；培育线索不参与 KPI 排序 */
export function compareKpiDeadline(
  a: { jzDate: Date | null; status?: string | null },
  b: { jzDate: Date | null; status?: string | null },
) {
  const aNurture = isNurturingLead(a.status);
  const bNurture = isNurturingLead(b.status);
  if (aNurture && bNurture) return 0;
  if (aNurture) return 1;
  if (bNurture) return -1;
  if (!a.jzDate && !b.jzDate) return 0;
  if (!a.jzDate) return 1;
  if (!b.jzDate) return -1;
  return a.jzDate.getTime() - b.jzDate.getTime();
}

/** 培育线索：com_status 不为空且不属于新线索状态 */
export function isNurturingLead(status: string | null | undefined) {
  const s = status?.trim() ?? "";
  if (!s) return false;
  return !isNewLeadStatus(s);
}

export type LeadView = "new" | "nurture";

export function leadViewWhere(view: LeadView) {
  if (view === "new") {
    return {
      OR: [
        { status: null },
        { status: "" },
        ...NEW_LEAD_STATUSES.map((status) => ({ status })),
      ],
    };
  }
  return {
    AND: [
      { status: { not: null } },
      { status: { not: "" } },
      ...NEW_LEAD_STATUSES.map((status) => ({ status: { not: status } })),
    ],
  };
}
