import type { Prisma } from "@prisma/client";

/** 名称大小写不敏感的模糊匹配（PostgreSQL insensitive）。 */
export function nameContainsWhere(q: string | undefined | null): Prisma.StringFilter | undefined {
  const trimmed = String(q ?? "").trim();
  if (!trimmed) return undefined;
  return { contains: trimmed, mode: "insensitive" };
}
