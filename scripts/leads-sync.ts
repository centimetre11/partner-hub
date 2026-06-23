import { syncLeadsData } from "../src/lib/leads-sync";

async function main() {
  console.log("[leads-sync] Starting manual sync…");
  const result = await syncLeadsData();
  if (!result.ok) {
    console.error("[leads-sync] Failed:", result.error);
    process.exit(1);
  }
  console.log(`[leads-sync] Done — ${result.leadCount} leads in ${result.durationMs}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
