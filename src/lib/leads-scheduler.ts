import {
  computeNextRunFromCron,
  resolveAgentTimezone,
  SCHEDULER_TIMEZONE,
} from "./cron";
import { getLeadsLastSyncAt, syncLeadsData } from "./leads-sync";

let ticking = false;

const DEFAULT_CRON = "0 5 * * *";

function getLeadsSyncCron() {
  return process.env.LEADS_SYNC_CRON?.trim() || DEFAULT_CRON;
}

function getLeadsSyncTimezone() {
  return resolveAgentTimezone(process.env.LEADS_SYNC_TIMEZONE ?? SCHEDULER_TIMEZONE);
}

function isDue(lastSync: Date | null): boolean {
  if (!lastSync) return true;
  const nextRun = computeNextRunFromCron(getLeadsSyncCron(), lastSync, getLeadsSyncTimezone());
  if (!nextRun) return false;
  return Date.now() >= nextRun.getTime();
}

export async function leadsSchedulerTick() {
  if (process.env.LEADS_SYNC_ENABLED === "0") return;
  if (ticking) return;
  ticking = true;
  try {
    const lastSync = await getLeadsLastSyncAt();
    if (!isDue(lastSync)) return;
    await syncLeadsData();
  } catch (e) {
    console.error("[leads-scheduler] tick error:", e);
  } finally {
    ticking = false;
  }
}
