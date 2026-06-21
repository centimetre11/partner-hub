export const CRM_DEFAULT_DATA_URL =
  "https://crm.finereporthelp.com/WebReport/decision/url/pub/crm/data?id=fa8f9bcb42b247a7880688336242e40d&secret=zd123456";

export const CRM_TRACE_SUBMIT_URL =
  "https://crm.finereporthelp.com/WebReport/decision/url/datainputcrm/submit?id=zd_trce_in&secret=zd12345";

/** FineReport overseas CRM company detail view (comid = CRM com_id). */
export const CRM_CUSTOMER_VIEW_BASE =
  "https://overseas.finereporthelp.com/WebReport/decision/view/report?viewlet=customer%2Fcompany_view.cpt&op=view";

export function buildCrmCustomerViewUrl(comId: string): string {
  const id = comId.trim();
  if (!id) return CRM_CUSTOMER_VIEW_BASE;
  return `${CRM_CUSTOMER_VIEW_BASE}&comid=${encodeURIComponent(id)}`;
}

export type CrmDataRow = {
  com_id: string;
  com_name: string;
  com_province?: string;
  com_city?: string;
  com_kpi_contactday?: string;
  com_salesman?: string;
  com_presales?: string;
  com_project?: string;
  com_project_manager?: string;
  com_pm?: string;
  com_status?: string;
  cont_id?: string;
  cont_name?: string;
  cont_mobile?: string;
  cont_email?: string;
  cont_duty?: string;
  cont_recdate?: string;
};

export type CrmDataResponse = {
  success: boolean;
  data: CrmDataRow[];
};

export function getCrmDataUrl() {
  return process.env.CRM_DATA_URL?.trim() || CRM_DEFAULT_DATA_URL;
}

function parseCrmDate(raw: string | undefined | null) {
  if (!raw?.trim()) return null;
  const normalized = raw.trim().replace(" ", "T");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function fetchCrmData(url = getCrmDataUrl()): Promise<CrmDataRow[]> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`CRM data API HTTP ${res.status}`);
  }
  const json = (await res.json()) as CrmDataResponse;
  if (!json.success || !Array.isArray(json.data)) {
    throw new Error("CRM data API returned invalid payload");
  }
  return json.data;
}

export type CrmCustomerUpsert = {
  id: string;
  name: string;
  province: string | null;
  city: string | null;
  status: string | null;
  salesman: string | null;
  presales: string | null;
  projectManager: string | null;
  kpiContactDay: Date | null;
};

export type CrmContactUpsert = {
  id: string;
  customerId: string;
  name: string | null;
  mobile: string | null;
  email: string | null;
  duty: string | null;
  recdate: Date | null;
};

export function normalizeCrmRows(rows: CrmDataRow[]) {
  const customers = new Map<string, CrmCustomerUpsert>();
  const contacts = new Map<string, CrmContactUpsert>();

  for (const row of rows) {
    const comId = row.com_id?.trim();
    if (!comId) continue;

    if (!customers.has(comId)) {
      customers.set(comId, {
        id: comId,
        name: row.com_name?.trim() || comId,
        province: row.com_province?.trim() || null,
        city: row.com_city?.trim() || null,
        status: row.com_status?.trim() || null,
        salesman: row.com_salesman?.trim() || null,
        presales: row.com_presales?.trim() || null,
        projectManager:
          row.com_project_manager?.trim() ||
          row.com_pm?.trim() ||
          row.com_project?.trim() ||
          null,
        kpiContactDay: parseCrmDate(row.com_kpi_contactday),
      });
    }

    const contId = row.cont_id?.trim();
    if (!contId) continue;
    contacts.set(contId, {
      id: contId,
      customerId: comId,
      name: row.cont_name?.trim() || null,
      mobile: row.cont_mobile?.trim() || null,
      email: row.cont_email?.trim() || null,
      duty: row.cont_duty?.trim() || null,
      recdate: parseCrmDate(row.cont_recdate),
    });
  }

  return {
    customers: [...customers.values()],
    contacts: [...contacts.values()],
  };
}

export type CrmTraceInsertPayload = {
  traceId: string;
  traceNature: "现场" | "非现场";
  traceCompany: string;
  traceContact?: string | null;
  traceRecdate: string;
  traceRectime: string;
  traceRecorder: string;
  traceAction: string;
  traceDetail: string;
  traceKeyword?: string;
};

export function buildCrmTraceWireBody(payload: CrmTraceInsertPayload) {
  return {
    info: [
      {
        trace_id: payload.traceId,
        trace_nature: payload.traceNature,
        trace_company: payload.traceCompany,
        trace_contact: payload.traceContact ?? "",
        trace_recdate: payload.traceRecdate,
        trace_rectime: payload.traceRectime,
        trace_recorder: payload.traceRecorder,
        trace_action: payload.traceAction,
        trace_detail: payload.traceDetail,
        trace_keyword: payload.traceKeyword || "商务跟进",
        op: "insert",
      },
    ],
  };
}

function tryParseCrmJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function extractCrmSubmitError(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const root = data as Record<string, unknown>;
  if (root.success === false) {
    return String(root.error ?? root.message ?? root.msg ?? "CRM 接口返回失败");
  }
  if (root.result !== undefined && root.result !== "success") {
    return String(root.error ?? root.message ?? root.msg ?? `CRM result=${String(root.result)}`);
  }
  return undefined;
}

export async function submitCrmBusinessRecord(
  payload: CrmTraceInsertPayload,
  submitUrl = process.env.CRM_TRACE_SUBMIT_URL?.trim() || CRM_TRACE_SUBMIT_URL,
) {
  const res = await fetch(submitUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildCrmTraceWireBody(payload)),
    cache: "no-store",
  });
  const raw = await res.text();
  const data = tryParseCrmJson(raw);

  if (!res.ok) {
    const snippet = typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200);
    throw new Error(`CRM trace submit HTTP ${res.status}: ${snippet}`);
  }

  const crmError = extractCrmSubmitError(data);
  if (crmError) {
    const snippet = typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200);
    throw new Error(`${crmError} (${snippet})`);
  }

  if (typeof data === "string") {
    throw new Error(`CRM trace submit returned non-JSON: ${data.slice(0, 200)}`);
  }

  return data as { result?: string; kind?: string };
}
