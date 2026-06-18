import { getCrmLastSyncAt, syncCrmData } from "./crm-sync";

let ticking = false;

function getIntervalMs() {
  const hours = Number(process.env.CRM_SYNC_INTERVAL_HOURS ?? "24");
  if (!Number.isFinite(hours) || hours <= 0) return 24 * 60 * 60 * 1000;
  return hours * 60 * 60 * 1000;
}

export async function crmSchedulerTick() {
  if (process.env.CRM_SYNC_ENABLED === "0") return;
  if (ticking) return;
  ticking = true;
  try {
    const lastSync = await getCrmLastSyncAt();
    const due = !lastSync || Date.now() - lastSync.getTime() >= getIntervalMs();
    if (!due) return;
    await syncCrmData();
  } catch (e) {
    console.error("[crm-scheduler] tick error:", e);
  } finally {
    ticking = false;
  }
}
