import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listHubUsersWithCrmAccount } from "@/lib/business-record-core";
import { requireUser } from "@/lib/session";

export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const partnerId = url.searchParams.get("partnerId")?.trim() || null;
  const customerId = url.searchParams.get("customerId")?.trim() || null;

  if (!partnerId && !customerId) {
    return NextResponse.json({ error: "missing owner" }, { status: 400 });
  }

  const ownerRow = customerId
    ? await db.customer.findUnique({ where: { id: customerId }, select: { crmCustomerId: true } })
    : await db.partner.findUnique({ where: { id: partnerId! }, select: { crmCustomerId: true } });

  const crmCustomerId = ownerRow?.crmCustomerId ?? null;
  const [crmCustomer, salesman, crmRecorders] = await Promise.all([
    crmCustomerId
      ? db.crmCustomer.findUnique({ where: { id: crmCustomerId }, select: { id: true, name: true } })
      : Promise.resolve(null),
    db.user.findUnique({ where: { id: user.id }, select: { crmSalesmanName: true } }),
    listHubUsersWithCrmAccount(),
  ]);

  return NextResponse.json({
    crmCustomerBound: !!crmCustomerId && !!crmCustomer,
    crmCustomerName: crmCustomer?.name ?? null,
    crmSalesmanBound: !!salesman?.crmSalesmanName?.trim(),
    currentUserId: user.id,
    crmRecorders,
  });
}
