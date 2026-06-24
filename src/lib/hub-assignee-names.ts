import { db } from "./db";

let cache: { names: string[]; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Hub user display names for todo assignee matching (prompt + heuristics). */
export async function listHubAssigneeNames(): Promise<string[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.names;
  const users = await db.user.findMany({
    select: { name: true, email: true },
    take: 100,
    orderBy: { name: "asc" },
  });
  const names = new Set<string>();
  for (const u of users) {
    const n = u.name?.trim();
    if (n) names.add(n);
    const local = u.email?.split("@")[0]?.trim();
    if (local && local.length >= 2) names.add(local);
  }
  const list = [...names].filter(Boolean).slice(0, 40);
  cache = { names: list, at: Date.now() };
  return list;
}

export function formatHubAssigneeHint(locale: "zh" | "en", names: string[]): string {
  if (!names.length) return "";
  const joined = names.join(locale === "zh" ? "、" : ", ");
  return locale === "zh"
    ? `\n[Hub 团队成员（负责人 assigneeName，不是 partnerName/公司名）]\n${joined}`
    : `\n[Hub team members — use assigneeName for owner, never partnerName]\n${joined}`;
}

/** True when text looks like a Hub user name rather than a company/partner. */
export async function isLikelyHubAssigneeName(name: string): Promise<boolean> {
  const q = name.trim();
  if (!q || q.length < 2) return false;
  const names = await listHubAssigneeNames();
  const lower = q.toLowerCase();
  return names.some((n) => {
    const nl = n.toLowerCase();
    return nl === lower || nl.includes(lower) || lower.includes(nl);
  });
}
