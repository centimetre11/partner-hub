import {
  computeNextRunFromCron,
  resolveAgentTimezone,
  SCHEDULER_TIMEZONE,
} from "./cron";
import { getChannelLastDailySyncAt, runChannelSyncTick } from "./channel-sync";

let ticking = false;

const DEFAULT_CRON = "30 5 * * *";

function getChannelSyncCron() {
  return process.env.CHANNEL_SYNC_CRON?.trim() || DEFAULT_CRON;
}

function getChannelSyncTimezone() {
  return resolveAgentTimezone(process.env.CHANNEL_SYNC_TIMEZONE ?? SCHEDULER_TIMEZONE);
}

function isDue(lastSync: Date | null): boolean {
  if (!lastSync) return true;
  const nextRun = computeNextRunFromCron(getChannelSyncCron(), lastSync, getChannelSyncTimezone());
  if (!nextRun) return false;
  return Date.now() >= nextRun.getTime();
}

export async function channelSchedulerTick() {
  if (process.env.CHANNEL_SYNC_ENABLED === "0") return;
  if (ticking) return;
  ticking = true;
  try {
    const lastSync = await getChannelLastDailySyncAt();
    if (!isDue(lastSync)) return;
    await runChannelSyncTick();
  } catch (e) {
    console.error("[channel-scheduler] tick error:", e);
  } finally {
    ticking = false;
  }
}
