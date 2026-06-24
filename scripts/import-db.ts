/**
 * Load prisma/_dump/<Model>.json into the current database (run this after the
 * datasource has been switched to PostgreSQL and `prisma db push` has created
 * the schema). Foreign-key checks are disabled for the duration of the import
 * (session_replication_role = replica) so insertion order does not matter.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const IN_DIR = join(process.cwd(), "prisma", "_dump");

function delegateKey(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

async function main() {
  const db = new PrismaClient();
  const models = Prisma.dmmf.datamodel.models;
  const summary: Record<string, number> = {};

  await db.$transaction(
    async (tx) => {
      // Disable FK triggers so we can insert in any order (requires superuser).
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'");

      for (const model of models) {
        const file = join(IN_DIR, `${model.name}.json`);
        if (!existsSync(file)) continue;
        const rows = JSON.parse(readFileSync(file, "utf8")) as unknown[];
        if (!rows.length) {
          summary[model.name] = 0;
          continue;
        }
        const delegate = (tx as unknown as Record<string, { createMany?: (a: unknown) => Promise<{ count: number }> }>)[
          delegateKey(model.name)
        ];
        if (!delegate?.createMany) continue;
        const res = await delegate.createMany({ data: rows, skipDuplicates: true });
        summary[model.name] = res.count;
      }
    },
    { timeout: 300_000, maxWait: 30_000 },
  );

  console.log("=== import complete ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("total rows:", Object.values(summary).reduce((a, b) => a + b, 0));

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
