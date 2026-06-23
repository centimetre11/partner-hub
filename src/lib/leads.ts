export const LEADS_DEFAULT_DATA_URL =
  "https://crm.fineres.com/crm/api/pub/data?id=79a8c7c489314494ba78eed58d269c8a&secret=crm123";

// 仅保留该年份的线索（按 com_recdate 创建时间过滤）
export const LEADS_TARGET_YEAR = 2026;

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
    // 接口在 IP 未加白或失败时返回 { success:true, error:"IP限制..." } 且无 data
    throw new Error(json.error || "Leads data API returned invalid payload");
  }
  return json.data;
}

export type CrmLeadUpsert = {
  id: string;
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
    const id = row.clue_id?.trim();
    if (!id) continue;

    const recdate = parseLeadDate(row.com_recdate);
    // 仅保留目标年份（按创建时间）；无法解析创建时间的线索跳过
    if (!recdate || recdate.getFullYear() !== LEADS_TARGET_YEAR) continue;

    leads.set(id, {
      id,
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

/** 培育线索：SDR 已离开「未联系」，或销售状态已离开「销售尚未联络」 */
export function isNurturingLead(lead: { sdrState?: string | null; status?: string | null }) {
  const sdr = lead.sdrState?.trim() ?? "";
  const status = lead.status?.trim() ?? "";
  if (sdr && !sdr.startsWith("未联系")) return true;
  if (status && status !== "销售尚未联络") return true;
  return false;
}

export type LeadView = "new" | "nurture";

export function leadViewWhere(view: LeadView) {
  const newLead = {
    AND: [
      {
        OR: [{ sdrState: null }, { sdrState: "" }, { sdrState: { startsWith: "未联系" } }],
      },
      {
        OR: [{ status: null }, { status: "" }, { status: "销售尚未联络" }],
      },
    ],
  };
  if (view === "new") return newLead;
  return {
    OR: [
      { AND: [{ sdrState: { not: null } }, { NOT: { sdrState: { startsWith: "未联系" } } }] },
      { AND: [{ status: { not: null } }, { status: { not: "销售尚未联络" } }] },
    ],
  };
}
