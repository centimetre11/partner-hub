import { db } from "./db";

const EXTRA_RECORDERS_KEY = "crm_extra_recorders";

function parseRecorderList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\n,，;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getCrmExtraRecordersFromSettings(): Promise<string[]> {
  const row = await db.setting.findUnique({ where: { key: EXTRA_RECORDERS_KEY } });
  return parseRecorderList(row?.value);
}

export async function saveCrmExtraRecorders(raw: string) {
  const names = [...new Set(parseRecorderList(raw))].sort((a, b) => a.localeCompare(b));
  await db.setting.upsert({
    where: { key: EXTRA_RECORDERS_KEY },
    create: { key: EXTRA_RECORDERS_KEY, value: names.join("\n") },
    update: { value: names.join("\n") },
  });
  return names;
}

/** CRM trace_recorder 候选：销售 + 售前 + 项目 + 已绑定用户 + 管理员补录 */
export async function getCrmRecorderNames(): Promise<string[]> {
  const [customers, boundUsers, extraFromSettings] = await Promise.all([
    db.crmCustomer.findMany({
      select: { salesman: true, presales: true, projectManager: true },
    }),
    db.user.findMany({
      where: { crmSalesmanName: { not: null } },
      distinct: ["crmSalesmanName"],
      select: { crmSalesmanName: true },
    }),
    getCrmExtraRecordersFromSettings(),
  ]);

  const fromEnv = parseRecorderList(process.env.CRM_EXTRA_RECORDERS);
  const names = new Set<string>();

  for (const c of customers) {
    if (c.salesman?.trim()) names.add(c.salesman.trim());
    if (c.presales?.trim()) names.add(c.presales.trim());
    if (c.projectManager?.trim()) names.add(c.projectManager.trim());
  }
  for (const u of boundUsers) {
    if (u.crmSalesmanName?.trim()) names.add(u.crmSalesmanName.trim());
  }
  for (const n of [...fromEnv, ...extraFromSettings]) names.add(n);

  return [...names].sort((a, b) => a.localeCompare(b));
}
