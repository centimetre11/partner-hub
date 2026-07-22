import { normalizeAmountInput, normalizeCurrency, type AmountCurrency } from "@/lib/amount";
import {
  normalizeBillingCycle,
  normalizeContractStatus,
  normalizeContractType,
  type ContractStatusCode,
  type ContractTypeCode,
} from "@/lib/contract-types";
import { normalizeOpportunityStatus, type OpportunityStatusCode } from "@/lib/opportunity-status";

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function toDateInput(v: unknown): string {
  const s = pickString(v);
  if (!s) return "";
  // already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function mapOppStatus(row: Record<string, unknown>): OpportunityStatusCode {
  const status = pickString(row.opp_status);
  if (status) {
    const mapped = normalizeOpportunityStatus(status);
    if (/赢|won|签约|成交/i.test(status)) return "WON";
    if (/丢|lost|失败|输/i.test(status)) return "LOST";
    if (/暂停|搁置|pause/i.test(status)) return "PAUSED";
    if (mapped !== "P20" || /20|50|80/.test(status)) return mapped;
  }
  const chance = pickString(row.opp_chance);
  if (chance) return normalizeOpportunityStatus(chance);
  return "P20";
}

function mapContractType(row: Record<string, unknown>): ContractTypeCode | "" {
  const blob = [
    pickString(row.productline),
    pickString(row.target_type),
    pickString(row.pro_bitype),
    pickString(row.ctr_name),
  ]
    .filter(Boolean)
    .join(" ");
  if (!blob) return "";
  if (/维保|维护|运维|maintenance/i.test(blob) && /项目|project|实施/i.test(blob)) {
    return "PROJECT_MAINTENANCE";
  }
  if (/维保|维护|运维|maintenance|yw_/i.test(blob)) return "PRODUCT_MAINTENANCE";
  if (/订阅|年费|续费|subscription|saas/i.test(blob)) return "SUBSCRIPTION";
  // CRM target_type 常见「产品,技术支持服务」——按订阅/维保类服务期合同处理
  if (/技术支持/i.test(blob) && !/项目|实施|impl|project/i.test(blob)) return "SUBSCRIPTION";
  if (/买断|buyout|永久/i.test(blob)) return "BUYOUT";
  if (/项目|实施|impl|project/i.test(blob)) return "PROJECT";
  const typed = normalizeContractType(blob);
  return typed ?? "";
}

function mapContractStatus(row: Record<string, unknown>): ContractStatusCode {
  const raw = pickString(row.ctr_newtype, row.ctr_file_status);
  if (!raw) return "ACTIVE";
  if (/作废|取消|cancel/i.test(raw)) return "CANCELLED";
  if (/到期|过期|expir/i.test(raw)) return "EXPIRED";
  if (/草稿|draft/i.test(raw)) return "DRAFT";
  if (/续约|renew/i.test(raw)) return "RENEWED";
  return normalizeContractStatus(raw) ?? "ACTIVE";
}

/** CRM 表「技术支持服务开始/结束时间」等候选字段（MCP 目前常未开放，预留兼容）。 */
const SERVICE_START_KEYS = [
  "tech_support_service_start",
  "tech_support_start_time",
  "tech_support_start",
  "ctr_ts_start_date",
  "ctr_service_start",
  "service_start_date",
  "ts_start_date",
  "support_start_date",
] as const;

const SERVICE_END_KEYS = [
  "tech_support_service_end",
  "tech_support_end_time",
  "tech_support_end",
  "ctr_ts_end_date",
  "ctr_service_end",
  "service_end_date",
  "ts_end_date",
  "support_end_date",
] as const;

function pickFirstDate(row: Record<string, unknown>, keys: readonly string[]): string {
  for (const k of keys) {
    const d = toDateInput(row[k]);
    if (d) return d;
  }
  return "";
}

/** 从合同名解析服务年，如「PureCS FineReport 2026年续费」→ 2026；「2024-2026年」→ 起止年。 */
function serviceYearsFromName(name: string): { startYear: number; endYear: number } | null {
  const range = name.match(/(20\d{2})\s*[-~～至到]\s*(20\d{2})\s*年/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a >= 2000 && b >= a && b <= 2100) return { startYear: a, endYear: b };
  }
  const single = name.match(/(20\d{2})\s*年/);
  if (single) {
    const y = Number(single[1]);
    if (y >= 2000 && y <= 2100) return { startYear: y, endYear: y };
  }
  return null;
}

function isServicePeriodContract(row: Record<string, unknown>, contractType: ContractTypeCode | ""): boolean {
  if (
    contractType === "SUBSCRIPTION" ||
    contractType === "PRODUCT_MAINTENANCE" ||
    contractType === "PROJECT_MAINTENANCE"
  ) {
    return true;
  }
  const blob = [pickString(row.target_type), pickString(row.ctr_name), pickString(row.productline)]
    .filter(Boolean)
    .join(" ");
  return /技术支持|运维|维保|维护|订阅|续费|年费|maintenance|subscription/i.test(blob);
}

/**
 * Start/End 应对齐 CRM「技术支持服务开始/结束时间」，而不是「签单日期」。
 * MCP 合同视图目前往往只有 ctr_sign_date / ctr_new_end_date（后者更像收回等行政日期），不可当作服务期。
 */
function mapContractServiceDates(
  row: Record<string, unknown>,
  contractType: ContractTypeCode | "",
): { startDate: string; endDate: string } {
  const fromFieldsStart = pickFirstDate(row, SERVICE_START_KEYS);
  const fromFieldsEnd = pickFirstDate(row, SERVICE_END_KEYS);
  if (fromFieldsStart || fromFieldsEnd) {
    return { startDate: fromFieldsStart, endDate: fromFieldsEnd };
  }

  const name = pickString(row.ctr_name);
  if (isServicePeriodContract(row, contractType)) {
    const years = serviceYearsFromName(name);
    if (years) {
      return {
        startDate: `${years.startYear}-01-01`,
        endDate: `${years.endYear}-12-31`,
      };
    }
    // 服务类合同：宁可留空，也不要用签单日误填
    return { startDate: "", endDate: "" };
  }

  // 买断/项目等：开始日可回退签单日；结束日不用 ctr_new_end_date（易与服务结束混淆）
  return {
    startDate: toDateInput(row.ctr_sign_date) || toDateInput(row.ctr_upload_date),
    endDate: "",
  };
}

function mapProjectStatus(row: Record<string, unknown>): string {
  const raw = pickString(row.prjstatus);
  if (!raw) return "ACTIVE";
  if (/完成|结项|done|closed|关闭/i.test(raw)) return "DONE";
  if (/暂停|hold|搁置/i.test(raw)) return "ON_HOLD";
  if (/关闭/i.test(raw)) return "CLOSED";
  return "ACTIVE";
}

function mapProjectPhase(row: Record<string, unknown>): string {
  const raw = pickString(row.prjstatus);
  if (/运维|维护|maintenance/i.test(raw)) return "MAINTENANCE";
  if (/上线|golive|go-live/i.test(raw)) return "GOLIVE";
  if (/验收|accept/i.test(raw)) return "ACCEPTANCE";
  if (/实施|implement/i.test(raw)) return "IMPLEMENT";
  return "KICKOFF";
}

export type CrmOpportunityHit = {
  id: string;
  name: string;
  crmCustomerId: string;
  amount: string;
  currency: string;
  status: OpportunityStatusCode;
  followUpAt: string;
  salesman: string;
  subtitle: string;
  raw: Record<string, unknown>;
};

export type CrmContractHit = {
  id: string;
  name: string;
  crmCustomerId: string;
  amount: string;
  currency: string;
  status: ContractStatusCode;
  contractType: ContractTypeCode | "";
  startDate: string;
  endDate: string;
  crmOpportunityId: string;
  salesman: string;
  subtitle: string;
  raw: Record<string, unknown>;
};

export type CrmProjectHit = {
  id: string;
  prjNumber: string;
  name: string;
  crmCustomerId: string;
  status: string;
  phase: string;
  startDate: string;
  endDate: string;
  manager: string;
  subtitle: string;
  raw: Record<string, unknown>;
};

export type CrmOpportunityDraft = {
  crmOpportunityId: string;
  crmCustomerId: string;
  name: string;
  amount: string;
  currency: AmountCurrency | "";
  status: OpportunityStatusCode;
  followUpAt: string;
  notes: string;
};

export type CrmContractDraft = {
  crmContractId: string;
  crmCustomerId: string;
  crmOpportunityId: string;
  name: string;
  amount: string;
  currency: AmountCurrency | "";
  status: ContractStatusCode;
  contractType: ContractTypeCode | "";
  billingCycle: string;
  startDate: string;
  endDate: string;
  renewsAt: string;
  notes: string;
};

export type CrmProjectDraft = {
  crmProjectId: string;
  crmPrjNumber: string;
  crmCustomerId: string;
  name: string;
  status: string;
  phase: string;
  startDate: string;
  endDate: string;
  notes: string;
};

export function mapOpportunityHit(row: Record<string, unknown>): CrmOpportunityHit | null {
  const id = pickString(row.opp_id);
  const name = pickString(row.opp_name);
  if (!id && !name) return null;
  const amountRaw = pickString(row.opp_amount, row.opp_budget);
  const amount = normalizeAmountInput(amountRaw) ?? "";
  const currency = normalizeCurrency(pickString(row.opp_currency)) || "";
  const status = mapOppStatus(row);
  const followUpAt = toDateInput(row.opp_predate) || toDateInput(row.opp_enddate);
  const salesman = pickString(row.opp_salesman);
  const crmCustomerId = pickString(row.opp_company);
  return {
    id: id || name,
    name: name || id,
    crmCustomerId,
    amount,
    currency,
    status,
    followUpAt,
    salesman,
    subtitle: [status, amount && `${amount}${currency ? ` ${currency}` : ""}`, salesman]
      .filter(Boolean)
      .join(" · "),
    raw: row,
  };
}

export function mapContractHit(row: Record<string, unknown>): CrmContractHit | null {
  const id = pickString(row.ctr_id);
  const name = pickString(row.ctr_name);
  if (!id && !name) return null;
  const amountRaw = pickString(row.ctr_amt, row.ctr_amt_cny);
  const amount = normalizeAmountInput(amountRaw) ?? "";
  const currency =
    normalizeCurrency(pickString(row.currency_type)) ||
    (pickString(row.ctr_amt_cny) && !pickString(row.ctr_amt) ? "CNY" : "") ||
    "";
  const status = mapContractStatus(row);
  const contractType = mapContractType(row);
  const { startDate, endDate } = mapContractServiceDates(row, contractType);
  const salesman = pickString(row.ctr_salesman);
  return {
    id: id || name,
    name: name || id,
    crmCustomerId: pickString(row.com_id),
    amount,
    currency,
    status,
    contractType,
    startDate,
    endDate,
    crmOpportunityId: pickString(row.opp_id),
    salesman,
    subtitle: [status, amount && `${amount}${currency ? ` ${currency}` : ""}`, salesman]
      .filter(Boolean)
      .join(" · "),
    raw: row,
  };
}

export function mapProjectHit(row: Record<string, unknown>): CrmProjectHit | null {
  const id = pickString(row.key_id);
  const prjNumber = pickString(row.prj_number);
  const name = pickString(row.opportunity_name, row.prj_number);
  if (!id && !prjNumber && !name) return null;
  const manager = pickString(row.project_manager_zxname, row.projectmanager_name);
  const status = mapProjectStatus(row);
  const phase = mapProjectPhase(row);
  return {
    id: id || prjNumber || name,
    prjNumber,
    name: name || prjNumber || id,
    crmCustomerId: pickString(row.customer_id, row.com_id),
    status,
    phase,
    startDate: toDateInput(row.prj_startdate),
    endDate: toDateInput(row.prj_enddate),
    manager,
    subtitle: [prjNumber, pickString(row.prjstatus), manager].filter(Boolean).join(" · "),
    raw: row,
  };
}

export function opportunityHitToDraft(hit: CrmOpportunityHit): CrmOpportunityDraft {
  const noteBits = [
    hit.salesman ? `CRM销售：${hit.salesman}` : "",
    pickString(hit.raw.opp_presales) ? `CRM售前：${pickString(hit.raw.opp_presales)}` : "",
    pickString(hit.raw.opp_fail_reason) ? `失败原因：${pickString(hit.raw.opp_fail_reason)}` : "",
  ].filter(Boolean);
  return {
    crmOpportunityId: hit.id,
    crmCustomerId: hit.crmCustomerId,
    name: hit.name,
    amount: hit.amount,
    currency: (hit.currency as AmountCurrency) || "",
    status: hit.status,
    followUpAt: hit.followUpAt,
    notes: noteBits.join("；"),
  };
}

export function contractHitToDraft(hit: CrmContractHit): CrmContractDraft {
  const contractType = hit.contractType;
  const billingCycle =
    contractType === "SUBSCRIPTION" ||
    contractType === "PRODUCT_MAINTENANCE" ||
    contractType === "PROJECT_MAINTENANCE"
      ? normalizeBillingCycle(pickString(hit.raw.pro_bitype)) || "YEARLY"
      : "";
  const signDate = toDateInput(hit.raw.ctr_sign_date) || toDateInput(hit.raw.ctr_upload_date);
  const noteBits = [
    hit.salesman ? `CRM销售：${hit.salesman}` : "",
    pickString(hit.raw.productline) ? `产品线：${pickString(hit.raw.productline)}` : "",
    signDate ? `CRM签单日期：${signDate}` : "",
  ].filter(Boolean);
  return {
    crmContractId: hit.id,
    crmCustomerId: hit.crmCustomerId,
    crmOpportunityId: hit.crmOpportunityId,
    name: hit.name,
    amount: hit.amount,
    currency: (hit.currency as AmountCurrency) || "",
    status: hit.status,
    contractType,
    billingCycle: billingCycle || "",
    startDate: hit.startDate,
    endDate: hit.endDate,
    renewsAt: hit.endDate && contractType === "SUBSCRIPTION" ? hit.endDate : "",
    notes: noteBits.join("；"),
  };
}

export function projectHitToDraft(hit: CrmProjectHit): CrmProjectDraft {
  const noteBits = [
    hit.prjNumber ? `CRM项目编号：${hit.prjNumber}` : "",
    hit.manager ? `CRM项目经理：${hit.manager}` : "",
    pickString(hit.raw.prjstatus) ? `CRM状态：${pickString(hit.raw.prjstatus)}` : "",
  ].filter(Boolean);
  return {
    crmProjectId: hit.id,
    crmPrjNumber: hit.prjNumber,
    crmCustomerId: hit.crmCustomerId,
    name: hit.name,
    status: hit.status,
    phase: hit.phase,
    startDate: hit.startDate,
    endDate: hit.endDate,
    notes: noteBits.join("；"),
  };
}
