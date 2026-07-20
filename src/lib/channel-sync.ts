import { db } from "./db";
import {
  addOneMonthYmd,
  compareYmd,
  fetchChannelData,
  getChannelBackfillStart,
  getMonthStartYmd,
  getTodayYmd,
  getTomorrowYmd,
  normalizeChannelRows,
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
          },
        }),
      ),
    );
  }
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
    const durationMs = Date.now() - started;
    await writeLog({
      status: "SUCCESS",
      mode,
      rangeStart,
      rangeEnd,
      rowCount: channels.length,
      durationMs,
    });
    console.log(
      `[channel-sync] ${mode} OK — ${channels.length} rows (${rangeStart} → ${rangeEnd}) in ${durationMs}ms`,
    );
    return {
      ok: true,
      mode,
      rangeStart,
      rangeEnd,
      rowCount: channels.length,
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
      durationMs,
      error,
    };
  }
}

/**
 * 历史回补：每次最多拉一个月；成功才推进 cursor。
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

/** 日常：按 sta_recdate 拉取当天（startdate=今天, enddate=明天） */
export async function syncChannelDaily(): Promise<ChannelRangeSyncResult> {
  const rangeStart = getTodayYmd();
  const rangeEnd = getTomorrowYmd();
  const result = await syncChannelRange("daily", rangeStart, rangeEnd);
  if (result.ok) {
    await setSetting(LAST_DAILY_SYNC_KEY, new Date().toISOString());
  }
  return result;
}

/** 调度 / 手动：先回补一个月（若未完成），再同步当天 */
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
