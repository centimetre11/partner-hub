import { extractCrmRows, withCrmMcpSession } from "../src/lib/crm-mcp";

async function main() {
  await withCrmMcpSession(async (call) => {
    const detail = await call("crm_query_view", {
      view_name: "contract_detail",
      filters: { ctr_id: { op: "eq", value: "81fe46a6-f024-4987-934b-2b655f0ea7e3" } },
      limit: 1,
      response_mode: "full",
      include_total: false,
    });
    const rows = extractCrmRows(detail);
    console.log("detail rows", rows.length);
    if (!rows[0]) {
      console.log(JSON.stringify(detail).slice(0, 3000));
      return;
    }
    const r = rows[0];
    console.log("all keys:", Object.keys(r).sort().join(", "));
    for (const [k, v] of Object.entries(r)) {
      if (/date|start|end|sign|ts|yw|serv|support|maint/i.test(k) || /202[0-9]/.test(String(v))) {
        console.log(`${k} = ${JSON.stringify(v)}`);
      }
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
