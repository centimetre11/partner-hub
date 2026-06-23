import type { LeadView } from "./leads";
import { leadViewWhere } from "./leads";
import { db } from "./db";

export type LeadsListParams = {
  q?: string;
  rank?: string;
  salesman?: string;
  view?: string;
};

export function resolveLeadView(raw?: string): LeadView {
  return raw === "nurture" ? "nurture" : "new";
}

/** 未传 salesman 时默认当前用户绑定的 CRM 销售名；salesman=all 表示全部 */
export function resolveSalesmanFilter(
  raw: string | undefined,
  crmSalesmanName: string | null | undefined,
): string | undefined {
  if (raw === "all") return undefined;
  if (raw?.trim()) return raw.trim();
  return crmSalesmanName?.trim() || undefined;
}

export function buildLeadsWhere(
  sp: LeadsListParams,
  crmSalesmanName: string | null | undefined,
) {
  const view = resolveLeadView(sp.view);
  const salesman = resolveSalesmanFilter(sp.salesman, crmSalesmanName);

  const and: Record<string, unknown>[] = [leadViewWhere(view)];

  if (sp.q) {
    and.push({
      OR: [
        { name: { contains: sp.q } },
        { phone: { contains: sp.q } },
        { salesman: { contains: sp.q } },
      ],
    });
  }
  if (sp.rank) and.push({ rank: sp.rank });
  if (salesman) and.push({ salesman });

  return { AND: and };
}

export function buildLeadsSearchParams(
  current: LeadsListParams,
  patch: Partial<LeadsListParams>,
) {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  const view = resolveLeadView(next.view);
  if (view !== "new") params.set("view", view);
  if (next.q?.trim()) params.set("q", next.q.trim());
  if (next.rank?.trim()) params.set("rank", next.rank.trim());
  if (next.salesman?.trim()) params.set("salesman", next.salesman.trim());
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function getLeadSalesmen() {
  const rows = await db.crmLead.findMany({
    where: { salesman: { not: null } },
    distinct: ["salesman"],
    select: { salesman: true },
    orderBy: { salesman: "asc" },
  });
  return rows.map((r) => r.salesman!).filter(Boolean);
}
