import { db } from "./db";
import {
  fetchLeadsDataCached,
  findNormalizedLeadByClueId,
  getClueId,
  invalidateLeadsDataCache,
  normalizeLeadRows,
  type CrmLeadAction,
} from "./leads";

const LAST_SYNC_KEY = "leads_last_sync";
const BATCH = 100;
const NURTURE_STATUS = "销售培育中";

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
    invalidateLeadsDataCache();
    const rows = await fetchLeadsDataCached({ force: true });
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
  | { ok: true; status: "updated" | "removed"; durationMs: number; reconciled?: boolean }
  | { ok: false; reason: "no_clue_id" | "fetch_failed"; error?: string; durationMs?: number };

async function reconcileLeadFromCrm(leadId: string, clueId: string) {
  const rows = await fetchLeadsDataCached({ force: true });
  const match = findNormalizedLeadByClueId(rows, clueId);

  if (!match) {
    await db.crmLead.deleteMany({ where: { id: leadId } });
    return { ok: true as const, status: "removed" as const };
  }

  const { id: _id, ...data } = match;
  await db.crmLead.upsert({
    where: { id: match.id },
    create: match,
    update: data,
  });
  return { ok: true as const, status: "updated" as const };
}

/**
 * 单条线索校准：
 * - 转培育/转 channel/转客户：先即时更新本地，后台再拉 CRM 校准；
 * - 编辑/责任转移：必须拉 CRM 全量 API 查找该条（pub API 无单条接口，约 1 分钟）。
 */
export async function refreshLeadById(
  leadId: string,
  action?: CrmLeadAction,
): Promise<RefreshLeadResult> {
  const started = Date.now();
  const clueId = getClueId(leadId);
  if (!clueId) return { ok: false, reason: "no_clue_id" };

  try {
    if (action === "toNurture") {
      await db.crmLead.update({
        where: { id: leadId },
        data: { status: NURTURE_STATUS },
      });
      void reconcileLeadFromCrm(leadId, clueId).catch((e) =>
        console.error("[leads-refresh] reconcile failed:", e),
      );
      return { ok: true, status: "updated", durationMs: Date.now() - started, reconciled: false };
    }

    if (action === "toChannel" || action === "toCustomer") {
      await db.crmLead.deleteMany({ where: { id: leadId } });
      void reconcileLeadFromCrm(leadId, clueId).catch((e) =>
        console.error("[leads-refresh] reconcile failed:", e),
      );
      return { ok: true, status: "removed", durationMs: Date.now() - started, reconciled: false };
    }

    const result = await reconcileLeadFromCrm(leadId, clueId);
    return { ...result, durationMs: Date.now() - started, reconciled: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "fetch_failed", error, durationMs: Date.now() - started };
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
