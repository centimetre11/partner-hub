import { syncCrmData } from "../src/lib/crm-sync";

async function main() {
  console.log("[crm-sync] Starting manual sync…");
  const result = await syncCrmData();
  if (!result.ok) {
    console.error("[crm-sync] Failed:", result.error);
    process.exit(1);
  }
  console.log(
    `[crm-sync] Done — ${result.customerCount} customers, ${result.contactCount} contacts in ${result.durationMs}ms`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
