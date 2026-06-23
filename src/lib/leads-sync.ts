import { db } from "./db";
import { fetchLeadsData, getClueId, normalizeLeadRows } from "./leads";

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

/** 全量拉取后清空旧数据再写入（整表替换） */
export async function syncLeadsData(): Promise<LeadsSyncResult> {
  const started = Date.now();
  try {
    const rows = await fetchLeadsData();
    const { leads } = normalizeLeadRows(rows);

    await db.crmLead.deleteMany();

    for (let i = 0; i < leads.length; i += BATCH) {
      const chunk = leads.slice(i, i + BATCH);
      await db.crmLead.createMany({ data: chunk });
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

    console.log(`[leads-sync] OK — ${leads.length} leads (full replace) in ${durationMs}ms`);

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

export type RefreshLeadResult =
  | { ok: true; status: "updated" | "removed" }
  | { ok: false; reason: "no_clue_id" | "fetch_failed"; error?: string };

/**
 * 针对单条线索做精准 API 校准（不全表重拉）：
 * - 以 CRM pub API 为准，找到该 clue_id 则 upsert 这一条；
 * - API 中已不存在（如转客户/转 channel 后离开 2026 线索集）则删除这一条。
 */
export async function refreshLeadById(leadId: string): Promise<RefreshLeadResult> {
  const clueId = getClueId(leadId);
  if (!clueId) return { ok: false, reason: "no_clue_id" };

  let leads;
  try {
    const rows = await fetchLeadsData();
    ({ leads } = normalizeLeadRows(rows));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "fetch_failed", error };
  }

  const match = leads.find((l) => l.id === clueId);

  if (!match) {
    await db.crmLead.deleteMany({ where: { id: leadId } });
    return { ok: true, status: "removed" };
  }

  const { id: _id, ...data } = match;
  await db.crmLead.upsert({
    where: { id: match.id },
    create: match,
    update: data,
  });
  return { ok: true, status: "updated" };
}

export async function getLeadsSyncStats() {
  const [leadCount, lastSyncAt, latestLog] = await Promise.all([
    db.crmLead.count(),
    getLeadsLastSyncAt(),
    getLatestLeadsSyncLog(),
  ]);
  return { leadCount, lastSyncAt, latestLog };
}
