import {
  runChannelSyncTick,
  syncChannelBackfillMonth,
  syncChannelDaily,
} from "../src/lib/channel-sync";

async function main() {
  const mode = (process.argv[2] || "tick").toLowerCase();
  console.log(`[channel-sync] Starting (${mode})…`);

  if (mode === "backfill") {
    const result = await syncChannelBackfillMonth();
    if (!result.ok) {
      console.error("[channel-sync] Backfill failed:", result.error);
      process.exit(1);
    }
    console.log(
      `[channel-sync] Backfill done — ${result.rowCount} rows (${result.rangeStart} → ${result.rangeEnd})` +
        (result.skipped ? " [skipped]" : "") +
        (result.backfillDone ? " [backfill complete]" : ""),
    );
    return;
  }

  if (mode === "daily") {
    const result = await syncChannelDaily();
    if (!result.ok) {
      console.error("[channel-sync] Daily failed:", result.error);
      process.exit(1);
    }
    console.log(
      `[channel-sync] Daily done — ${result.rowCount} rows (${result.rangeStart} → ${result.rangeEnd}) in ${result.durationMs}ms`,
    );
    return;
  }

  const result = await runChannelSyncTick();
  if (!result.ok) {
    console.error("[channel-sync] Tick failed:", result.error);
    process.exit(1);
  }
  if (result.backfill) {
    console.log(
      `[channel-sync] Backfill — ${result.backfill.rowCount} rows (${result.backfill.rangeStart} → ${result.backfill.rangeEnd})` +
        (result.backfill.skipped ? " [skipped]" : ""),
    );
  }
  if (result.daily) {
    console.log(
      `[channel-sync] Daily — ${result.daily.rowCount} rows (${result.daily.rangeStart} → ${result.daily.rangeEnd}) in ${result.daily.durationMs}ms`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
