import { getLeadsLastSyncAt, syncLeadsData } from "./leads-sync";

let ticking = false;

function getIntervalMs() {
  const hours = Number(process.env.LEADS_SYNC_INTERVAL_HOURS ?? "24");
  if (!Number.isFinite(hours) || hours <= 0) return 24 * 60 * 60 * 1000;
  return hours * 60 * 60 * 1000;
}

export async function leadsSchedulerTick() {
  if (process.env.LEADS_SYNC_ENABLED === "0") return;
  if (ticking) return;
  ticking = true;
  try {
    const lastSync = await getLeadsLastSyncAt();
    const due = !lastSync || Date.now() - lastSync.getTime() >= getIntervalMs();
    if (!due) return;
    await syncLeadsData();
  } catch (e) {
    console.error("[leads-scheduler] tick error:", e);
  } finally {
    ticking = false;
  }
}
