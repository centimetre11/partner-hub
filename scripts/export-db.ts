/**
 * Dump every table to prisma/_dump/<Model>.json using the *current* Prisma
 * client (run this while the datasource is still SQLite). Pairs with
 * scripts/import-db.ts which loads the dump into the new PostgreSQL database.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), "prisma", "_dump");

function delegateKey(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

async function main() {
  const db = new PrismaClient();
  mkdirSync(OUT_DIR, { recursive: true });

  const models = Prisma.dmmf.datamodel.models;
  const summary: Record<string, number> = {};
  const skipped: string[] = [];

  for (const model of models) {
    const key = delegateKey(model.name);
    const delegate = (db as unknown as Record<string, { findMany?: () => Promise<unknown[]> }>)[key];
    if (!delegate?.findMany) {
      skipped.push(model.name);
      continue;
    }
    const rows = await delegate.findMany();
    writeFileSync(join(OUT_DIR, `${model.name}.json`), JSON.stringify(rows));
    summary[model.name] = rows.length;
  }

  writeFileSync(
    join(OUT_DIR, "_manifest.json"),
    JSON.stringify({ exportedAt: new Date().toISOString(), counts: summary }, null, 2),
  );

  console.log("=== export complete ===");
  console.log(JSON.stringify(summary, null, 2));
  if (skipped.length) console.warn("skipped (no delegate):", skipped.join(", "));
  console.log("total rows:", Object.values(summary).reduce((a, b) => a + b, 0));

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
