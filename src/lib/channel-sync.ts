import { db } from "./db";
import {
  addDaysYmd,
  addOneMonthYmd,
  compareYmd,
  fetchChannelData,
  getChannelBackfillStart,
  getChannelReconcileChunkDays,
  getChannelReconcileDays,
  getDaysAgoYmd,
  getMonthStartYmd,
  getTodayYmd,
  getTomorrowYmd,
  normalizeChannelRows,
  ymdToDateStart,
  type CrmChannelUpsert,
} from "./channel";

const BACKFILL_CURSOR_KEY = "channel_backfill_cursor";
const BACKFILL_DONE_KEY = "channel_backfill_done";
const LAST_DAILY_SYNC_KEY = "channel_last_daily_sync";
const BATCH = 100;

let syncing = false;

export type ChannelSyncMode = "backfill" | "daily";

export type ChannelRangeSyncResult = {
  ok: boolean;
  mode: ChannelSyncMode;
  rangeStart: string;
  rangeEnd: string;
  rowCount: number;
  deletedCount: number;
  durationMs: number;
  advanced?: boolean;
  backfillDone?: boolean;
  skipped?: boolean;
  error?: string;
};

export type ChannelSyncTickResult = {
  ok: boolean;
  backfill: ChannelRangeSyncResult | null;
  daily: ChannelRangeSyncResult | null;
  error?: string;
};

async function getSetting(key: string) {
  const row = await db.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function setSetting(key: string, value: string) {
  await db.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function isChannelBackfillDone() {
  return (await getSetting(BACKFILL_DONE_KEY)) === "1";
}

export async function getChannelBackfillCursor() {
  const stored = await getSetting(BACKFILL_CURSOR_KEY);
  return stored?.trim() || getChannelBackfillStart();
}

export async function getChannelLastDailySyncAt() {
  const raw = await getSetting(LAST_DAILY_SYNC_KEY);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function getChannelLastSyncAt() {
  const log = await db.channelSyncLog.findFirst({
    where: { status: "SUCCESS" },
    orderBy: { createdAt: "desc" },
  });
  return log?.createdAt ?? (await getChannelLastDailySyncAt());
}

export async function getLatestChannelSyncLog() {
  return db.channelSyncLog.findFirst({ orderBy: { createdAt: "desc" } });
}

export async function getChannelBackfillProgress() {
  const [done, cursor] = await Promise.all([isChannelBackfillDone(), getChannelBackfillCursor()]);
  return {
    done,
    cursor,
    start: getChannelBackfillStart(),
    monthStart: getMonthStartYmd(),
  };
}

async function upsertChannels(channels: CrmChannelUpsert[]) {
  for (let i = 0; i < channels.length; i += BATCH) {
    const chunk = channels.slice(i, i + BATCH);
    await db.$transaction(
      chunk.map((c) =>
        db.crmChannel.upsert({
          where: { id: c.id },
          create: c,
          update: {
            companyId: c.companyId,
            name: c.name,
            status: c.status,
            province: c.province,
            countryCn: c.countryCn,
            city: c.city,
            region: c.region,
            zone: c.zone,
            rank: c.rank,
            source: c.source,
            sourceDetail: c.sourceDetail,
            phone: c.phone,
            contName: c.contName,
            contEmail: c.contEmail,
            contDuty: c.contDuty,
            salesman: c.salesman,
            typeDetail: c.typeDetail,
            overseaAgent: c.overseaAgent,
            contRecdate: c.contRecdate,
            staSalesOld: c.staSalesOld,
            staRecdate: c.staRecdate,
            detail: c.detail,
            traceDetail: c.traceDetail,
          },
        }),
      ),
    );
  }
}

/**
 * 删除本地落在 [rangeStart, rangeEnd) 且不在本次 CRM 返回集合中的记录
 *（CRM 已从公海捞走 → Hub 同步移除）
 */
async function deleteMissingInRange(
  rangeStart: string,
  rangeEnd: string,
  keepIds: Set<string>,
): Promise<number> {
  const start = ymdToDateStart(rangeStart);
  const end = ymdToDateStart(rangeEnd);
  const existing = await db.crmChannel.findMany({
    where: { staRecdate: { gte: start, lt: end } },
    select: { id: true },
  });
  const toDelete = existing.filter((r) => !keepIds.has(r.id)).map((r) => r.id);
  if (toDelete.length === 0) return 0;

  for (let i = 0; i < toDelete.length; i += BATCH) {
    const chunk = toDelete.slice(i, i + BATCH);
    await db.crmChannel.deleteMany({ where: { id: { in: chunk } } });
  }
  return toDelete.length;
}

async function writeLog(input: {
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  mode: ChannelSyncMode;
  rangeStart: string;
  rangeEnd: string;
  rowCount?: number;
  durationMs: number;
  error?: string;
}) {
  await db.channelSyncLog.create({
    data: {
      status: input.status,
      mode: input.mode,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      rowCount: input.rowCount,
      durationMs: input.durationMs,
      error: input.error,
    },
  });
}

/** 拉取区间 → upsert → 删除 CRM 已不在公海的本地行 */
async function syncChannelRange(
  mode: ChannelSyncMode,
  rangeStart: string,
  rangeEnd: string,
): Promise<ChannelRangeSyncResult> {
  const started = Date.now();
  try {
    const rows = await fetchChannelData(rangeStart, rangeEnd);
    const { channels } = normalizeChannelRows(rows);
    await upsertChannels(channels);
    const deletedCount = await deleteMissingInRange(
      rangeStart,
      rangeEnd,
      new Set(channels.map((c) => c.id)),
    );
    const durationMs = Date.now() - started;
    await writeLog({
      status: "SUCCESS",
      mode,
      rangeStart,
      rangeEnd,
      rowCount: channels.length,
      durationMs,
      error: deletedCount > 0 ? `deleted=${deletedCount}` : undefined,
    });
    console.log(
      `[channel-sync] ${mode} OK — upsert ${channels.length}, delete ${deletedCount} (${rangeStart} → ${rangeEnd}) in ${durationMs}ms`,
    );
    return {
      ok: true,
      mode,
      rangeStart,
      rangeEnd,
      rowCount: channels.length,
      deletedCount,
      durationMs,
    };
  } catch (e) {
    const durationMs = Date.now() - started;
    const error = e instanceof Error ? e.message : String(e);
    await writeLog({
      status: "FAILED",
      mode,
      rangeStart,
      rangeEnd,
      durationMs,
      error,
    });
    console.error(`[channel-sync] ${mode} failed (${rangeStart} → ${rangeEnd}):`, error);
    return {
      ok: false,
      mode,
      rangeStart,
      rangeEnd,
      rowCount: 0,
      deletedCount: 0,
      durationMs,
      error,
    };
  }
}

/**
 * 历史回补：每次最多拉一个月并对账；成功才推进 cursor。
 * cursor ≥ 当月 1 号时标记完成。
 */
export async function syncChannelBackfillMonth(): Promise<ChannelRangeSyncResult> {
  if (await isChannelBackfillDone()) {
    const monthStart = getMonthStartYmd();
    return {
      ok: true,
      mode: "backfill",
      rangeStart: monthStart,
      rangeEnd: monthStart,
      rowCount: 0,
      deletedCount: 0,
      durationMs: 0,
      skipped: true,
      backfillDone: true,
    };
  }

  const cursor = await getChannelBackfillCursor();
  const monthStart = getMonthStartYmd();

  if (compareYmd(cursor, monthStart) >= 0) {
    await setSetting(BACKFILL_DONE_KEY, "1");
    await setSetting(BACKFILL_CURSOR_KEY, monthStart);
    return {
      ok: true,
      mode: "backfill",
      rangeStart: cursor,
      rangeEnd: monthStart,
      rowCount: 0,
      deletedCount: 0,
      durationMs: 0,
      skipped: true,
      backfillDone: true,
      advanced: true,
    };
  }

  const rangeEnd = addOneMonthYmd(cursor);
  const result = await syncChannelRange("backfill", cursor, rangeEnd);
  if (!result.ok) return result;

  await setSetting(BACKFILL_CURSOR_KEY, rangeEnd);
  const done = compareYmd(rangeEnd, monthStart) >= 0;
  if (done) {
    await setSetting(BACKFILL_DONE_KEY, "1");
  }

  return { ...result, advanced: true, backfillDone: done };
}

/**
 * 日常 / 立即同步：对最近 N 天按小段对账（upsert + 删缺失），
 * 覆盖「从历史公海被捞回跟进」的场景。
 */
export async function syncChannelDaily(): Promise<ChannelRangeSyncResult> {
  const reconcileDays = getChannelReconcileDays();
  const chunkDays = getChannelReconcileChunkDays();
  const rangeEnd = getTomorrowYmd();
  const rangeStart = getDaysAgoYmd(reconcileDays - 1);
  const started = Date.now();

  let rowCount = 0;
  let deletedCount = 0;
  let cursor = rangeStart;

  while (compareYmd(cursor, rangeEnd) < 0) {
    let chunkEnd = addDaysYmd(cursor, chunkDays);
    if (compareYmd(chunkEnd, rangeEnd) > 0) chunkEnd = rangeEnd;

    const result = await syncChannelRange("daily", cursor, chunkEnd);
    if (!result.ok) {
      return {
        ...result,
        rangeStart,
        rangeEnd,
        rowCount,
        deletedCount,
        durationMs: Date.now() - started,
      };
    }
    rowCount += result.rowCount;
    deletedCount += result.deletedCount;
    cursor = chunkEnd;
  }

  await setSetting(LAST_DAILY_SYNC_KEY, new Date().toISOString());
  const durationMs = Date.now() - started;
  console.log(
    `[channel-sync] daily reconcile OK — upsert ${rowCount}, delete ${deletedCount} (${rangeStart} → ${rangeEnd}) in ${durationMs}ms`,
  );
  return {
    ok: true,
    mode: "daily",
    rangeStart,
    rangeEnd,
    rowCount,
    deletedCount,
    durationMs,
  };
}

/** 仅同步当天（调试用） */
export async function syncChannelTodayOnly(): Promise<ChannelRangeSyncResult> {
  const rangeStart = getTodayYmd();
  const rangeEnd = getTomorrowYmd();
  const result = await syncChannelRange("daily", rangeStart, rangeEnd);
  if (result.ok) {
    await setSetting(LAST_DAILY_SYNC_KEY, new Date().toISOString());
  }
  return result;
}

/** 调度 / 手动：先回补一个月（若未完成），再对账最近 N 天 */
export async function runChannelSyncTick(): Promise<ChannelSyncTickResult> {
  if (syncing) {
    return { ok: false, backfill: null, daily: null, error: "SYNC_IN_PROGRESS" };
  }
  syncing = true;
  try {
    let backfill: ChannelRangeSyncResult | null = null;
    if (!(await isChannelBackfillDone())) {
      backfill = await syncChannelBackfillMonth();
    }

    const daily = await syncChannelDaily();
    const ok = (backfill?.ok ?? true) && daily.ok;
    return {
      ok,
      backfill,
      daily,
      error: !ok ? backfill?.error || daily.error : undefined,
    };
  } finally {
    syncing = false;
  }
}
