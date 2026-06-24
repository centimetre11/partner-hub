/**
 * Backfill Partner/GtmLibrary.industries from legacy industry column before schema drop.
 * Safe to re-run; no-ops when industry column is already gone.
 */
import { PrismaClient } from "@prisma/client";
import { stringifyIndustries } from "../src/lib/taxonomy";

const db = new PrismaClient();

type LegacyRow = { id: string; industry: string | null; industries: string | null };

async function tableHasIndustryColumn(table: "Partner" | "GtmLibrary"): Promise<boolean> {
  // Works on both PostgreSQL (information_schema) and SQLite (pragma_table_info).
  // On a fresh Postgres database the legacy `industry` column never existed, so
  // this resolves to false and the backfill is correctly skipped.
  try {
    const rows = await db.$queryRawUnsafe<{ name: string }[]>(
      `SELECT column_name AS name FROM information_schema.columns WHERE table_name = $1 AND column_name = 'industry'`,
      table,
    );
    return rows.length > 0;
  } catch {
    try {
      const rows = await db.$queryRaw<{ name: string }[]>`
        SELECT name FROM pragma_table_info(${table}) WHERE name = 'industry'
      `;
      return rows.length > 0;
    } catch {
      return false;
    }
  }
}

async function backfillTable(table: "Partner" | "GtmLibrary") {
  if (!(await tableHasIndustryColumn(table))) {
    console.log(`[drop-legacy-industry] ${table}.industry already removed — skip`);
    return;
  }

  const rows =
    table === "Partner"
      ? await db.$queryRaw<LegacyRow[]>`
          SELECT id, industry, industries FROM Partner
          WHERE industry IS NOT NULL AND industry != ''
        `
      : await db.$queryRaw<LegacyRow[]>`
          SELECT id, industry, industries FROM GtmLibrary
          WHERE industry IS NOT NULL AND industry != ''
        `;

  for (const row of rows) {
    if (row.industries?.trim()) continue;
    const industries = stringifyIndustries([row.industry!]);
    if (table === "Partner") {
      await db.partner.update({ where: { id: row.id }, data: { industries } });
    } else {
      await db.gtmLibrary.update({ where: { id: row.id }, data: { industries } });
    }
    console.log(`[drop-legacy-industry] ${table} ${row.id}: ${row.industry} → ${industries}`);
  }
}

async function main() {
  await backfillTable("Partner");
  await backfillTable("GtmLibrary");
  console.log("[drop-legacy-industry] backfill done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
