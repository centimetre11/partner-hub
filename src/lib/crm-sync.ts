import { db } from "./db";
import { fetchCrmData, normalizeCrmRows } from "./crm";

const LAST_SYNC_KEY = "crm_last_sync";
const BATCH = 100;

export type CrmSyncResult = {
  ok: boolean;
  customerCount: number;
  contactCount: number;
  durationMs: number;
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
    const rows = await fetchCrmData();
    const { customers, contacts } = normalizeCrmRows(rows);

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
      `[crm-sync] OK — ${customers.length} customers, ${contacts.length} contacts in ${durationMs}ms`,
    );

    return {
      ok: true,
      customerCount: customers.length,
      contactCount: contacts.length,
      durationMs,
    };
  } catch (e) {
    const durationMs = Date.now() - started;
    const error = e instanceof Error ? e.message : String(e);
    await db.crmSyncLog.create({
      data: { status: "FAILED", durationMs, error },
    });
    console.error("[crm-sync] failed:", error);
    return { ok: false, customerCount: 0, contactCount: 0, durationMs, error };
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
