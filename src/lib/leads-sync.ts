import { db } from "./db";
import { fetchLeadsData, normalizeLeadRows } from "./leads";

const LAST_SYNC_KEY = "leads_last_sync";
const BATCH = 100;

export type LeadsSyncResult = {
  ok: boolean;
  leadCount: number;
  durationMs: number;
  error?: string;
};

export async function getLeadsLastSyncAt() {
  const row = await db.setting.findUnique({ where: { key: LAST_SYNC_KEY } });
  if (!row?.value) return null;
  const d = new Date(row.value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function getLatestLeadsSyncLog() {
  return db.leadsSyncLog.findFirst({ orderBy: { createdAt: "desc" } });
}

export async function syncLeadsData(): Promise<LeadsSyncResult> {
  const started = Date.now();
  try {
    const rows = await fetchLeadsData();
    const { leads } = normalizeLeadRows(rows);

    for (let i = 0; i < leads.length; i += BATCH) {
      const chunk = leads.slice(i, i + BATCH);
      await db.$transaction(
        chunk.map((lead) => {
          const { id, ...rest } = lead;
          return db.crmLead.upsert({
            where: { id },
            create: lead,
            update: rest,
          });
        }),
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
      db.leadsSyncLog.create({
        data: {
          status: "SUCCESS",
          leadCount: leads.length,
          durationMs,
        },
      }),
    ]);

    console.log(`[leads-sync] OK — ${leads.length} leads in ${durationMs}ms`);

    return { ok: true, leadCount: leads.length, durationMs };
  } catch (e) {
    const durationMs = Date.now() - started;
    const error = e instanceof Error ? e.message : String(e);
    await db.leadsSyncLog.create({
      data: { status: "FAILED", durationMs, error },
    });
    console.error("[leads-sync] failed:", error);
    return { ok: false, leadCount: 0, durationMs, error };
  }
}

export async function getLeadsSyncStats() {
  const [leadCount, lastSyncAt, latestLog] = await Promise.all([
    db.crmLead.count(),
    getLeadsLastSyncAt(),
    getLatestLeadsSyncLog(),
  ]);
  return { leadCount, lastSyncAt, latestLog };
}
