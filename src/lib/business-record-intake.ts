import { db } from "./db";
import type { IntakeProposal } from "./ai-intake";
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
  crmCustomerId?: string;
  crmCustomerName?: string;
  companyLabel?: string;
};

async function findCrmCustomersByName(query: string, limit = 6) {
  const q = query.trim();
  if (!q) return [];
  const exact = await db.crmCustomer.findMany({
    where: { name: { equals: q } },
    select: { id: true, name: true },
    take: limit,
  });
  if (exact.length) return exact;
  return db.crmCustomer.findMany({
    where: { name: { contains: q } },
    select: { id: true, name: true },
    take: limit,
    orderBy: { name: "asc" },
  });
}

export async function lookupSingleCrmCustomerByName(query: string) {
  const matches = await findCrmCustomersByName(query);
  return matches.length === 1 ? matches[0]! : null;
}

/** Resolve Hub + CRM company targets for a business record draft. */
export async function resolveBusinessRecordCompanyTarget(opts: {
  proposal: IntakeProposal;
  boundPartnerId?: string;
  saveMode?: IntakeProposal["saveMode"];
}): Promise<BusinessRecordCompanyTarget> {
  const name = opts.proposal.partnerName?.trim();

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

/** Enrich proposal with Hub / CRM company match metadata. */
export async function enrichBusinessRecordCompanyTarget(
  proposal: IntakeProposal,
  userText: string,
  boundPartnerId?: string
): Promise<IntakeProposal> {
  let next = await enrichProposalPartnerFromText(proposal, userText, boundPartnerId);
  const target = await resolveBusinessRecordCompanyTarget({
    proposal: next,
    boundPartnerId,
    saveMode: next.saveMode,
  });

  const companyLabel =
    target.companyLabel ??
    next.partnerName?.trim() ??
    extractPartnerNameFromIntakeText(userText) ??
    undefined;

  return {
    ...next,
    partnerName: target.hubPartnerName ?? companyLabel ?? next.partnerName,
    hubPartnerId: target.hubPartnerId ?? next.hubPartnerId,
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
