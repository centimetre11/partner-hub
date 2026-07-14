import { db } from "./db";
import type { IntakeProposal, BusinessRecordProposal } from "./ai-intake";
import { END_CUSTOMER_WHERE } from "./customer-filters";
import { CRM_TRACE_ACTIONS, CRM_TRACE_NATURES } from "./crm-trace-constants";
import {
  enrichProposalPartnerFromText,
  extractPartnerNameFromIntakeText,
  lookupSinglePartnerByName,
} from "./intake-partner-binding";

export type BusinessRecordSyncPlan =
  | "both"
  | "hub_only"
  | "crm_only_pending"
  | "unresolved";

export type BusinessRecordCompanyTarget = {
  syncPlan: BusinessRecordSyncPlan;
  hubPartnerId?: string;
  hubPartnerName?: string;
  /** 新「客户」实体（Partner Hub 维护的终端客户） */
  customerId?: string;
  customerName?: string;
  crmCustomerId?: string;
  crmCustomerName?: string;
  companyLabel?: string;
};

async function findCrmCustomersByName(query: string, limit = 6) {
  const q = query.trim();
  if (!q) return [];
  const exact = await db.crmCustomer.findMany({
    where: { name: { equals: q, mode: "insensitive" } },
    select: { id: true, name: true },
    take: limit,
  });
  if (exact.length) return exact;
  return db.crmCustomer.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true },
    take: limit,
    orderBy: { name: "asc" },
  });
}

export async function lookupSingleCrmCustomerByName(query: string) {
  const matches = await findCrmCustomersByName(query);
  return matches.length === 1 ? matches[0]! : null;
}

async function findCustomersByName(query: string, limit = 6) {
  const q = query.trim();
  if (!q) return [];
  const baseWhere = { ...END_CUSTOMER_WHERE };
  const exact = await db.customer.findMany({
    where: { ...baseWhere, name: { equals: q } },
    select: { id: true, name: true, crmCustomerId: true },
    take: limit,
  });
  if (exact.length) return exact;
  return db.customer.findMany({
    where: { ...baseWhere, name: { contains: q } },
    select: { id: true, name: true, crmCustomerId: true },
    take: limit,
    orderBy: { name: "asc" },
  });
}

export async function lookupSingleCustomerByName(query: string) {
  const matches = await findCustomersByName(query);
  return matches.length === 1 ? matches[0]! : null;
}

/** Build a target for the new Customer entity (Hub-side customer, may carry its own CRM id). */
async function customerEntityTarget(customer: {
  id: string;
  name: string;
  crmCustomerId: string | null;
}): Promise<BusinessRecordCompanyTarget> {
  let crmCustomerName: string | undefined;
  if (customer.crmCustomerId) {
    const crm = await db.crmCustomer.findUnique({
      where: { id: customer.crmCustomerId },
      select: { name: true },
    });
    crmCustomerName = crm?.name;
  }
  return {
    syncPlan: customer.crmCustomerId ? "both" : "hub_only",
    customerId: customer.id,
    customerName: customer.name,
    crmCustomerId: customer.crmCustomerId ?? undefined,
    crmCustomerName,
    companyLabel: customer.name,
  };
}

/** Resolve Hub + CRM company targets for a business record draft. */
export async function resolveBusinessRecordCompanyTarget(opts: {
  proposal: IntakeProposal;
  boundPartnerId?: string;
  /** 企微群/会话已绑定的「客户」实体 */
  boundCustomerId?: string;
  saveMode?: IntakeProposal["saveMode"];
}): Promise<BusinessRecordCompanyTarget> {
  const name = opts.proposal.partnerName?.trim();

  if (opts.boundCustomerId && !opts.boundPartnerId) {
    const customer = await db.customer.findUnique({
      where: { id: opts.boundCustomerId },
      select: { id: true, name: true, crmCustomerId: true },
    });
    if (customer) return customerEntityTarget(customer);
  }

  if (opts.boundPartnerId) {
    const partner = await db.partner.findUnique({
      where: { id: opts.boundPartnerId },
      select: { id: true, name: true, crmCustomerId: true },
    });
    if (!partner) return { syncPlan: "unresolved" };
    let crmCustomerName: string | undefined;
    if (partner.crmCustomerId) {
      const crm = await db.crmCustomer.findUnique({
        where: { id: partner.crmCustomerId },
        select: { name: true },
      });
      crmCustomerName = crm?.name;
    }
    return {
      syncPlan: partner.crmCustomerId ? "both" : "hub_only",
      hubPartnerId: partner.id,
      hubPartnerName: partner.name,
      crmCustomerId: partner.crmCustomerId ?? undefined,
      crmCustomerName,
      companyLabel: partner.name,
    };
  }

  if (name) {
    const hubMatches = await db.partner.findMany({
      where: { OR: [{ name: { equals: name } }, { name: { contains: name } }] },
      select: { id: true, name: true, crmCustomerId: true },
      take: 6,
    });
    if (hubMatches.length === 1) {
      const partner = hubMatches[0]!;
      let crmCustomerName: string | undefined;
      if (partner.crmCustomerId) {
        const crm = await db.crmCustomer.findUnique({
          where: { id: partner.crmCustomerId },
          select: { name: true },
        });
        crmCustomerName = crm?.name;
      }
      return {
        syncPlan: partner.crmCustomerId ? "both" : "hub_only",
        hubPartnerId: partner.id,
        hubPartnerName: partner.name,
        crmCustomerId: partner.crmCustomerId ?? undefined,
        crmCustomerName,
        companyLabel: partner.name,
      };
    }
    if (hubMatches.length > 1) {
      return { syncPlan: "unresolved", companyLabel: name };
    }

    // 无伙伴匹配时，再看新「客户」实体（Hub 维护的终端客户，优先于纯 CRM 客户）
    const customerMatches = await findCustomersByName(name);
    if (customerMatches.length === 1) {
      return customerEntityTarget(customerMatches[0]!);
    }
    if (customerMatches.length > 1) {
      return { syncPlan: "unresolved", companyLabel: name };
    }

    const crmMatches = await findCrmCustomersByName(name);
    if (crmMatches.length === 1) {
      const crm = crmMatches[0]!;
      if (opts.saveMode === "crm_only") {
        return {
          syncPlan: "crm_only_pending",
          crmCustomerId: crm.id,
          crmCustomerName: crm.name,
          companyLabel: crm.name,
        };
      }
      return {
        syncPlan: "crm_only_pending",
        crmCustomerId: crm.id,
        crmCustomerName: crm.name,
        companyLabel: crm.name,
      };
    }
    if (crmMatches.length > 1) {
      return { syncPlan: "unresolved", companyLabel: name };
    }
  }

  return { syncPlan: "unresolved", companyLabel: name };
}

/** Enrich proposal with Hub / Customer / CRM company match metadata. */
export async function enrichBusinessRecordCompanyTarget(
  proposal: IntakeProposal,
  userText: string,
  boundPartnerId?: string,
  boundCustomerId?: string,
): Promise<IntakeProposal> {
  const next = await enrichProposalPartnerFromText(proposal, userText, boundPartnerId);
  const target = await resolveBusinessRecordCompanyTarget({
    proposal: next,
    boundPartnerId,
    boundCustomerId,
    saveMode: next.saveMode,
  });

  const companyLabel =
    target.companyLabel ??
    next.partnerName?.trim() ??
    extractPartnerNameFromIntakeText(userText) ??
    undefined;

  return {
    ...next,
    partnerName:
      target.hubPartnerName ?? target.customerName ?? companyLabel ?? next.partnerName,
    hubPartnerId: target.hubPartnerId ?? next.hubPartnerId,
    customerId: target.customerId ?? next.customerId,
    customerName: target.customerName ?? next.customerName,
    crmCustomerId: target.crmCustomerId ?? next.crmCustomerId,
    crmCustomerName: target.crmCustomerName ?? next.crmCustomerName,
  };
}

export function businessRecordHubReady(target: BusinessRecordCompanyTarget): boolean {
  return target.syncPlan === "both" || target.syncPlan === "hub_only";
}

export function businessRecordCrmOnlyReady(target: BusinessRecordCompanyTarget): boolean {
  return target.syncPlan === "crm_only_pending";
}

const CLARIFICATION_FOLLOWUP_RE =
  /^(?:【确认选择】|\[Confirmations\]|【偏好调整】|\[Preference\])/i;

const WEAK_BUSINESS_RECORD_TITLE_RE =
  /^(?:现场|非现场)?\s*(?:商务(?:记录|行为|活动)?|拜访|会议|跟进|接待)?\s*$/;

/** Follow-up that only confirms CRM dimensions / clarification cards — not new record content. */
export function isIntakeClarificationFollowUp(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (CLARIFICATION_FOLLOWUP_RE.test(t)) return true;
  if (/^(?:这次是现场还是非现场|CRM 商务行为)/i.test(t)) return true;
  if ((CRM_TRACE_NATURES as readonly string[]).includes(t)) return true;
  if ((CRM_TRACE_ACTIONS as readonly string[]).includes(t)) return true;
  return isWeakBusinessRecordSourceText(t);
}

/** Too short to be a standalone business record (e.g. user confirming「现场商务」). */
export function isWeakBusinessRecordSourceText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length <= 16 && WEAK_BUSINESS_RECORD_TITLE_RE.test(t)) return true;
  if (t.length <= 6 && (CRM_TRACE_NATURES as readonly string[]).includes(t)) return true;
  if (t.length <= 12 && (CRM_TRACE_ACTIONS as readonly string[]).includes(t)) return true;
  return false;
}

export function isWeakBusinessRecordTitle(title: string | undefined, content?: string): boolean {
  const t = title?.trim() ?? "";
  if (!t) return true;
  if (isWeakBusinessRecordSourceText(t)) return true;
  const c = content?.trim();
  if (c && t === c && t.length <= 20) return true;
  return false;
}

function buildBusinessRecordTitle(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 77)}…`;
}

/** Restore title/content from the first substantive user message when LLM/heuristic only kept a confirmation phrase. */
export function enrichWeakBusinessRecordsFromPrimaryText(
  records: BusinessRecordProposal[],
  primaryText: string,
): BusinessRecordProposal[] {
  const source = primaryText.trim();
  if (!source || !records.length || isWeakBusinessRecordSourceText(source)) return records;

  return records.map((r, i) => {
    if (i > 0) return r;
    if (!isWeakBusinessRecordTitle(r.title, r.content)) return r;
    const title = buildBusinessRecordTitle(source);
    return { ...r, title, content: source };
  });
}

/** Merge a follow-up turn into an existing business-record draft without dropping the original body. */
export function mergeBusinessRecordIntakeProposal(
  prev: IntakeProposal | null,
  next: IntakeProposal,
): IntakeProposal {
  if (!prev?.businessRecords?.length) return next;

  const prevRec = prev.businessRecords[0]!;
  const nextRec = next.businessRecords[0];
  if (!nextRec) {
    return {
      ...next,
      summary: prev.summary?.trim() || next.summary,
      businessRecords: prev.businessRecords,
    };
  }

  const prevTitle = prevRec.title?.trim() ?? "";
  const nextTitle = nextRec.title?.trim() ?? "";
  const prevContent = (prevRec.content ?? prevRec.title ?? "").trim();
  const nextContent = (nextRec.content ?? nextRec.title ?? "").trim();
  const nextIsWeak = isWeakBusinessRecordTitle(nextTitle, nextContent);
  const prevIsRicher =
    prevTitle.length > nextTitle.length + 8 ||
    prevContent.length > nextContent.length + 16 ||
    (!isWeakBusinessRecordTitle(prevTitle, prevContent) && nextIsWeak);

  if (nextIsWeak && prevIsRicher) {
    const merged: BusinessRecordProposal = {
      ...prevRec,
      traceNature: nextRec.traceNature ?? prevRec.traceNature,
      traceAction: nextRec.traceAction ?? prevRec.traceAction,
      category: nextRec.category && nextRec.category !== "OTHER" ? nextRec.category : prevRec.category,
      occurredAt: nextRec.occurredAt ?? prevRec.occurredAt,
      contactName: nextRec.contactName ?? prevRec.contactName,
    };
    return {
      ...next,
      summary: prev.summary?.trim() || prevTitle || next.summary,
      businessRecords: [merged],
    };
  }

  return next;
}
