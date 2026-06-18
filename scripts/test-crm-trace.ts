/**
 * 验证商务记录 → CRM 双写链路（需网络）
 * 用法: npx tsx scripts/test-crm-trace.ts
 */
import { PrismaClient } from "@prisma/client";
import { syncBusinessRecordToCrm } from "../src/lib/crm-business-record";

const db = new PrismaClient();

async function main() {
  const user = await db.user.findFirst();
  if (!user) throw new Error("No user in database");

  await db.user.update({
    where: { id: user.id },
    data: { crmSalesmanName: "chenmin" },
  });

  let partner = await db.partner.findFirst();
  if (!partner) throw new Error("No partner in database");

  const crmCustomer = await db.crmCustomer.findFirst({ orderBy: { name: "asc" } });
  if (!crmCustomer) throw new Error("Run npm run crm-sync first");

  partner = await db.partner.update({
    where: { id: partner.id },
    data: { crmCustomerId: crmCustomer.id },
  });

  const record = await db.businessRecord.create({
    data: {
      partnerId: partner.id,
      category: "VISIT",
      title: "API 双写测试",
      content: "partner-hub 自动同步验证",
      occurredAt: new Date(),
      source: "MANUAL",
      createdById: user.id,
    },
  });

  const result = await syncBusinessRecordToCrm({
    recordId: record.id,
    partnerId: partner.id,
    userId: user.id,
    category: "VISIT",
    title: record.title,
    content: record.content,
    occurredAt: record.occurredAt,
  });

  console.log("sync result:", result);
  const updated = await db.businessRecord.findUnique({ where: { id: record.id } });
  console.log("record crm fields:", {
    crmTraceId: updated?.crmTraceId,
    crmSyncedAt: updated?.crmSyncedAt,
    crmSyncError: updated?.crmSyncError,
  });

  if (result.status !== "synced") process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
