import { NextResponse } from "next/server";
import { BUSINESS_RECORD_PAGE_SIZE, queryBusinessRecords } from "@/lib/business-record-core";
import { normalizeOwner } from "@/lib/owner";
import { requireUser } from "@/lib/session";

export async function GET(req: Request) {
  await requireUser();

  const url = new URL(req.url);
  const partnerId = url.searchParams.get("partnerId");
  const customerId = url.searchParams.get("customerId");
  const owner = customerId
    ? normalizeOwner("customer", customerId)
    : normalizeOwner("partner", partnerId);

  if (!owner) {
    return NextResponse.json({ error: "missing owner" }, { status: 400 });
  }

  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? String(BUSINESS_RECORD_PAGE_SIZE), 10) || BUSINESS_RECORD_PAGE_SIZE),
  );

  const result = await queryBusinessRecords(owner, page, pageSize);

  return NextResponse.json({
    items: result.items.map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title,
      content: row.content,
      occurredAt: row.occurredAt.toISOString(),
      crmTraceNature: row.crmTraceNature,
      crmTraceAction: row.crmTraceAction,
      crmSyncedAt: row.crmSyncedAt?.toISOString() ?? null,
      crmSyncStatus: row.crmSyncStatus,
      crmSyncError: row.crmSyncError,
      createdBy: row.createdBy,
      contact: row.contact,
    })),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  });
}
