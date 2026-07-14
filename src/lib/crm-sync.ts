import { db } from "./db";
import { fetchCrmData, normalizeCrmRows } from "./crm";

const LAST_SYNC_KEY = "crm_last_sync";
const BATCH = 100;

export type CrmSyncNewCustomer = {
  id: string;
  name: string;
  city: string | null;
  status: string | null;
  salesman: string | null;
  presales: string | null;
};

export type CrmSyncResult = {
  ok: boolean;
  customerCount: number;
  contactCount: number;
  durationMs: number;
  /** 本次同步相对库中原先不存在的客户（用于快捷绑定） */
  newCustomers: CrmSyncNewCustomer[];
  error?: string;
};

export async function getCrmLastSyncAt() {
  const row = await db.setting.findUnique({ where: { key: LAST_SYNC_KEY } });
  if (!row?.value) return null;
  const d = new Date(row.value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function getLatestCrmSyncLog() {
  return db.crmSyncLog.findFirst({ orderBy: { createdAt: "desc" } });
}

export async function syncCrmData(): Promise<CrmSyncResult> {
  const started = Date.now();
  try {
    const existingRows = await db.crmCustomer.findMany({ select: { id: true } });
    const existingIds = new Set(existingRows.map((r) => r.id));

    const rows = await fetchCrmData();
    const { customers, contacts } = normalizeCrmRows(rows);

    const newCustomers: CrmSyncNewCustomer[] = customers
      .filter((c) => !existingIds.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        city: c.city,
        status: c.status,
        salesman: c.salesman,
        presales: c.presales,
      }));

    for (let i = 0; i < customers.length; i += BATCH) {
      const chunk = customers.slice(i, i + BATCH);
      await db.$transaction(
        chunk.map((c) =>
          db.crmCustomer.upsert({
            where: { id: c.id },
            create: c,
            update: {
              name: c.name,
              province: c.province,
              city: c.city,
              status: c.status,
              salesman: c.salesman,
              presales: c.presales,
              projectManager: c.projectManager,
              kpiContactDay: c.kpiContactDay,
            },
          }),
        ),
      );
    }

    for (let i = 0; i < contacts.length; i += BATCH) {
      const chunk = contacts.slice(i, i + BATCH);
      await db.$transaction(
        chunk.map((c) =>
          db.crmContact.upsert({
            where: { id: c.id },
            create: c,
            update: {
              customerId: c.customerId,
              name: c.name,
              mobile: c.mobile,
              email: c.email,
              duty: c.duty,
              recdate: c.recdate,
            },
          }),
        ),
      );
    }

    const durationMs = Date.now() - started;
    const finishedAt = new Date().toISOString();

    await db.$transaction([
      db.setting.upsert({
        where: { key: LAST_SYNC_KEY },
        create: { key: LAST_SYNC_KEY, value: finishedAt },
        update: { value: finishedAt },
      }),
      db.crmSyncLog.create({
        data: {
          status: "SUCCESS",
          customerCount: customers.length,
          contactCount: contacts.length,
          durationMs,
        },
      }),
    ]);

    console.log(
      `[crm-sync] OK — ${customers.length} customers, ${contacts.length} contacts, ${newCustomers.length} new in ${durationMs}ms`,
    );

    return {
      ok: true,
      customerCount: customers.length,
      contactCount: contacts.length,
      durationMs,
      newCustomers,
    };
  } catch (e) {
    const durationMs = Date.now() - started;
    const error = e instanceof Error ? e.message : String(e);
    await db.crmSyncLog.create({
      data: { status: "FAILED", durationMs, error },
    });
    console.error("[crm-sync] failed:", error);
    return {
      ok: false,
      customerCount: 0,
      contactCount: 0,
      durationMs,
      newCustomers: [],
      error,
    };
  }
}

export async function getCrmSyncStats() {
  const [customerCount, contactCount, lastSyncAt, latestLog] = await Promise.all([
    db.crmCustomer.count(),
    db.crmContact.count(),
    getCrmLastSyncAt(),
    getLatestCrmSyncLog(),
  ]);
  return { customerCount, contactCount, lastSyncAt, latestLog };
}
