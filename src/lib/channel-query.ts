import { db } from "./db";
import { nameContainsWhere } from "./name-search";

export type ChannelListParams = {
  q?: string;
  type?: string;
  salesman?: string;
};

/** 未传 salesman 时默认当前用户绑定的 CRM 销售名；salesman=all 表示全部 */
export function resolveChannelSalesmanFilter(
  raw: string | undefined,
  crmSalesmanName: string | null | undefined,
): string | undefined {
  if (raw === "all") return undefined;
  if (raw?.trim()) return raw.trim();
  return crmSalesmanName?.trim() || undefined;
}

export function buildChannelWhere(
  sp: ChannelListParams,
  crmSalesmanName: string | null | undefined,
) {
  const salesman = resolveChannelSalesmanFilter(sp.salesman, crmSalesmanName);
  const and: Record<string, unknown>[] = [];

  const qFilter = nameContainsWhere(sp.q);
  if (qFilter) {
    and.push({
      OR: [
        { name: qFilter },
        { phone: qFilter },
        { contName: qFilter },
        { contEmail: qFilter },
        { salesman: qFilter },
        { staSalesOld: qFilter },
      ],
    });
  }

  const type = sp.type?.trim();
  if (type) and.push({ typeDetail: type });
  if (salesman) and.push({ salesman });

  return and.length ? { AND: and } : {};
}

export function buildChannelSearchParams(
  current: ChannelListParams,
  patch: Partial<ChannelListParams>,
) {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.q?.trim()) params.set("q", next.q.trim());
  if (next.type?.trim()) params.set("type", next.type.trim());
  if (next.salesman?.trim()) params.set("salesman", next.salesman.trim());
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function getChannelSalesmen() {
  const rows = await db.crmChannel.findMany({
    where: { salesman: { not: null } },
    distinct: ["salesman"],
    select: { salesman: true },
    orderBy: { salesman: "asc" },
  });
  return rows.map((r) => r.salesman!).filter(Boolean);
}

export async function getChannelTypeDetails() {
  const rows = await db.crmChannel.findMany({
    where: { typeDetail: { not: null } },
    distinct: ["typeDetail"],
    select: { typeDetail: true },
    orderBy: { typeDetail: "asc" },
  });
  return rows.map((r) => r.typeDetail!).filter(Boolean);
}
