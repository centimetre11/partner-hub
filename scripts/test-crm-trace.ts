/**
 * 验证商务记录 → CRM 双写链路（需网络）
 *
 * 用法:
 *   npx tsx scripts/test-crm-trace.ts              # 真实提交 CRM
 *   npx tsx scripts/test-crm-trace.ts --dry-run    # 仅打印 payload，不提交
 */
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { buildCrmTraceWireBody } from "../src/lib/crm";
import { resolveCrmTraceFields } from "../src/lib/crm-trace-payload";
import { syncBusinessRecordToCrm } from "../src/lib/crm-business-record";

const db = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatCrmDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatCrmTime(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

async function main() {
  const title = "拜访 Sheike 商务交流";
  const content = "今天拜访了 Sheike，一起吃了个饭，讨论 FineBI 合作";
  const category = "VISIT" as const;
  const occurredAt = new Date();

  const crmFields = resolveCrmTraceFields({ title, content, category });
  console.log("CRM field mapping:", crmFields);

  const samplePayload = buildCrmTraceWireBody({
    traceId: randomUUID(),
    traceNature: crmFields.traceNature,
    traceCompany: "00000000-0000-0000-0000-000000000000",
    traceContact: "",
    traceRecdate: formatCrmDate(occurredAt),
    traceRectime: formatCrmTime(new Date()),
    traceRecorder: "Zayne.Zhao",
    traceAction: crmFields.traceAction,
    traceDetail: crmFields.traceDetail,
    traceKeyword: crmFields.traceKeyword,
  });
  console.log("wire payload sample:", JSON.stringify(samplePayload, null, 2));

  if (dryRun) {
    console.log("--dry-run: skipping database and CRM submit");
    return;
  }

  const user = await db.user.findFirst();
  if (!user) throw new Error("No user in database");

  const crmSalesmanName = user.crmSalesmanName ?? "Zayne.Zhao";
  if (!user.crmSalesmanName) {
    await db.user.update({
      where: { id: user.id },
      data: { crmSalesmanName },
    });
  }

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
      category,
      title,
      content,
      occurredAt,
      source: "MANUAL",
      createdById: user.id,
    },
  });

  const result = await syncBusinessRecordToCrm({
    recordId: record.id,
    owner: { kind: "partner", id: partner.id },
    userId: user.id,
    category,
    title: record.title,
    content: record.content,
    occurredAt: record.occurredAt,
  });

  console.log("sync result:", result);
  const updated = await db.businessRecord.findUnique({ where: { id: record.id } });
  console.log("record crm fields:", {
    crmTraceId: updated?.crmTraceId,
    crmSyncedAt: updated?.crmSyncedAt,
    crmSyncStatus: updated?.crmSyncStatus,
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
