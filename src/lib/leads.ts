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

export async function fetchLeadsData(url = getLeadsDataUrl()): Promise<CrmLeadRow[]> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Leads data API HTTP ${res.status}`);
  }
  const json = (await res.json()) as CrmLeadsResponse;
  if (!json.success || !Array.isArray(json.data)) {
    throw new Error(json.error || "Leads data API returned invalid payload");
  }
  return json.data;
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
