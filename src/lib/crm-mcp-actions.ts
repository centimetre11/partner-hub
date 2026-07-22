"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { extractCrmRows, isCrmMcpConfigured, withCrmMcpSession } from "@/lib/crm-mcp";
import {
  contractHitToDraft,
  mapContractHit,
  mapOpportunityHit,
  mapProjectHit,
  opportunityHitToDraft,
  projectHitToDraft,
  type CrmContractDraft,
  type CrmContractHit,
  type CrmOpportunityDraft,
  type CrmOpportunityHit,
  type CrmProjectDraft,
  type CrmProjectHit,
} from "@/lib/crm-mcp-map";

export type CrmImportKind = "opportunity" | "contract" | "project";

type CallTool = (name: string, args?: Record<string, unknown>) => Promise<unknown>;

function looksLikeUuid(q: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
}

function looksLikePrjNumber(q: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{2,}$/.test(q) && !/\s/.test(q) && !looksLikeUuid(q);
}

async function resolveLocalCustomerId(crmCustomerId: string): Promise<string | null> {
  if (!crmCustomerId) return null;
  const c = await db.customer.findFirst({
    where: { crmCustomerId },
    select: { id: true },
  });
  return c?.id ?? null;
}

async function queryView(
  call: CallTool,
  viewName: string,
  filters: Record<string, unknown>,
  opts?: { limit?: number; responseMode?: "sample" | "full" },
) {
  const raw = await call("crm_query_view", {
    view_name: viewName,
    filters,
    limit: opts?.limit ?? 20,
    response_mode: opts?.responseMode ?? "sample",
    include_total: false,
  });
  return extractCrmRows(raw);
}

function requireBoundCrmCustomer(crmCustomerId?: string | null): string | null {
  const id = crmCustomerId?.trim() || "";
  return id || null;
}

export async function getCrmMcpImportStatusAction() {
  await requireUser();
  return { configured: await isCrmMcpConfigured() };
}

export async function searchCrmOpportunitiesAction(input: {
  crmCustomerId?: string | null;
  query?: string;
  limit?: number;
}): Promise<{ items: CrmOpportunityHit[]; error?: string }> {
  await requireUser();
  if (!(await isCrmMcpConfigured())) {
    return { items: [], error: "CRM MCP 未配置（请设置 CRM_MCP_TOKEN）" };
  }
  const comId = requireBoundCrmCustomer(input.crmCustomerId);
  if (!comId) {
    return { items: [], error: "请先在客户档案绑定 CRM 客户后再使用" };
  }

  const q = input.query?.trim() || "";
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

  try {
    const items = await withCrmMcpSession(async (call) => {
      if (q && looksLikeUuid(q)) {
        const rows = await queryView(
          call,
          "opportunity_detail",
          { opp_id: { op: "eq", value: q } },
          { limit: 1, responseMode: "full" },
        );
        return rows
          .map(mapOpportunityHit)
          .filter((x): x is CrmOpportunityHit => !!x && (!x.crmCustomerId || x.crmCustomerId === comId));
      }

      const filters: Record<string, unknown> = {
        opp_company: { op: "eq", value: comId },
      };
      if (q) filters.opp_name = { op: "ilike", value: q };
      const rows = await queryView(call, "opportunity_list", filters, {
        limit,
        responseMode: "sample",
      });
      return rows.map(mapOpportunityHit).filter((x): x is CrmOpportunityHit => !!x);
    });
    return { items };
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function searchCrmContractsAction(input: {
  crmCustomerId?: string | null;
  query?: string;
  limit?: number;
}): Promise<{ items: CrmContractHit[]; error?: string }> {
  await requireUser();
  if (!(await isCrmMcpConfigured())) {
    return { items: [], error: "CRM MCP 未配置（请设置 CRM_MCP_TOKEN）" };
  }
  const comId = requireBoundCrmCustomer(input.crmCustomerId);
  if (!comId) {
    return { items: [], error: "请先在客户档案绑定 CRM 客户后再使用" };
  }

  const q = input.query?.trim() || "";
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

  try {
    const items = await withCrmMcpSession(async (call) => {
      // UUID that equals the bound customer id is not a contract id — list by com_id.
      if (q && looksLikeUuid(q) && q.toLowerCase() !== comId.toLowerCase()) {
        const rows = await queryView(
          call,
          "contract_detail",
          { ctr_id: { op: "eq", value: q } },
          { limit: 1, responseMode: "full" },
        );
        return rows
          .map(mapContractHit)
          .filter((x): x is CrmContractHit => !!x && (!x.crmCustomerId || x.crmCustomerId === comId));
      }

      // Always scope by bound CRM customer id. Optional keyword filters contract name only.
      const filters: Record<string, unknown> = { com_id: { op: "eq", value: comId } };
      if (q && !looksLikeUuid(q)) filters.ctr_name = { op: "ilike", value: q };
      const rows = await queryView(call, "contract_list", filters, {
        limit,
        responseMode: "sample",
      });
      return rows.map(mapContractHit).filter((x): x is CrmContractHit => !!x);
    });
    return { items };
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function searchCrmProjectsAction(input: {
  crmCustomerId?: string | null;
  query?: string;
  limit?: number;
}): Promise<{ items: CrmProjectHit[]; error?: string }> {
  await requireUser();
  if (!(await isCrmMcpConfigured())) {
    return { items: [], error: "CRM MCP 未配置（请设置 CRM_MCP_TOKEN）" };
  }
  const comId = requireBoundCrmCustomer(input.crmCustomerId);
  if (!comId) {
    return { items: [], error: "请先在客户档案绑定 CRM 客户后再使用" };
  }

  const q = input.query?.trim() || "";
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

  try {
    const items = await withCrmMcpSession(async (call) => {
      if (q && looksLikeUuid(q)) {
        const rows = await queryView(
          call,
          "project_info_detail",
          { key_id: { op: "eq", value: q } },
          { limit: 1, responseMode: "full" },
        );
        return rows
          .map(mapProjectHit)
          .filter((x): x is CrmProjectHit => !!x && (!x.crmCustomerId || x.crmCustomerId === comId));
      }
      if (q && looksLikePrjNumber(q)) {
        const rows = await queryView(
          call,
          "project_info_detail",
          { prj_number: { op: "eq", value: q } },
          { limit: 1, responseMode: "full" },
        );
        return rows
          .map(mapProjectHit)
          .filter((x): x is CrmProjectHit => !!x && (!x.crmCustomerId || x.crmCustomerId === comId));
      }

      const filters: Record<string, unknown> = {
        customer_id: { op: "eq", value: comId },
      };
      if (q) filters.opportunity_name = { op: "ilike", value: q };
      const rows = await queryView(call, "project_info_list", filters, {
        limit,
        responseMode: "sample",
      });
      return rows.map(mapProjectHit).filter((x): x is CrmProjectHit => !!x);
    });
    return { items };
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function pickCrmOpportunityDraftAction(
  hit: CrmOpportunityHit,
): Promise<{ draft: CrmOpportunityDraft; localCustomerId: string | null }> {
  await requireUser();
  const draft = opportunityHitToDraft(hit);
  const localCustomerId = await resolveLocalCustomerId(draft.crmCustomerId);
  return { draft, localCustomerId };
}

export async function pickCrmContractDraftAction(
  hit: CrmContractHit,
): Promise<{ draft: CrmContractDraft; localCustomerId: string | null }> {
  await requireUser();
  const draft = contractHitToDraft(hit);
  const localCustomerId = await resolveLocalCustomerId(draft.crmCustomerId);
  return { draft, localCustomerId };
}

export async function pickCrmProjectDraftAction(
  hit: CrmProjectHit,
): Promise<{ draft: CrmProjectDraft; localCustomerId: string | null }> {
  await requireUser();
  const draft = projectHitToDraft(hit);
  const localCustomerId = await resolveLocalCustomerId(draft.crmCustomerId);
  return { draft, localCustomerId };
}
