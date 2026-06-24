/**
 * One-time (idempotent) migration: backfill the CustomerPartner join table from the
 * legacy Customer.partnerId / Customer.partnerRelation single-binding columns.
 *
 * 运行时机：必须在 `prisma db push` 之后（关联表已建好），旧列仍保留可读。
 * 幂等：已存在的链接会跳过，可在每次部署时安全重复执行。
 *
 * Usage: npx tsx scripts/migrate-customer-partner-links.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const customers = await db.customer.findMany({
    where: { partnerId: { not: null } },
    select: { id: true, name: true, partnerId: true, partnerRelation: true },
  });

  let created = 0;
  let skipped = 0;
  for (const c of customers) {
    const partnerId = c.partnerId!;
    const relation = c.partnerRelation === "SELF" ? "SELF" : "SERVED_BY";
    const existing = await db.customerPartner.findUnique({
      where: { customerId_partnerId: { customerId: c.id, partnerId } },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await db.customerPartner.create({
      data: { customerId: c.id, partnerId, relation },
    });
    created++;
  }

  console.log(
    `Done. Backfilled ${created} customer-partner link(s), skipped ${skipped} existing, from ${customers.length} bound customer(s).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
