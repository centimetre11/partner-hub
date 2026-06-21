// 归属抽象：联系人/权力地图/商机/时间线/待办 等可挂在「伙伴」或「客户」上
export type OwnerKind = "partner" | "customer";

export type OwnerRef = { kind: OwnerKind; id: string };

export function ownerPath(owner: OwnerRef): string {
  return owner.kind === "customer" ? `/customers/${owner.id}` : `/partners/${owner.id}`;
}

export function ownerWhere(owner: OwnerRef): { partnerId: string } | { customerId: string } {
  return owner.kind === "customer" ? { customerId: owner.id } : { partnerId: owner.id };
}

export function ownerData(owner: OwnerRef): { partnerId: string; customerId?: undefined } | { customerId: string; partnerId?: undefined } {
  return owner.kind === "customer" ? { customerId: owner.id } : { partnerId: owner.id };
}

export function isOwnerKind(value: unknown): value is OwnerKind {
  return value === "partner" || value === "customer";
}

export function normalizeOwner(kind: unknown, id: unknown): OwnerRef | null {
  if (!isOwnerKind(kind)) return null;
  const oid = String(id ?? "").trim();
  if (!oid) return null;
  return { kind, id: oid };
}
