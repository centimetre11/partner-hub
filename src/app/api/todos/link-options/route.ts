import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function GET(req: Request) {
  await requireUser();
  const customerId = new URL(req.url).searchParams.get("customerId")?.trim();
  if (!customerId) {
    return NextResponse.json({ error: "missing customerId" }, { status: 400 });
  }

  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      opportunities: {
        where: { status: { not: "LOST" } },
        select: { id: true, name: true },
        orderBy: { updatedAt: "desc" },
      },
      projects: {
        where: { status: { not: "CLOSED" } },
        select: { id: true, name: true },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!customer) {
    return NextResponse.json({ error: "customer not found" }, { status: 404 });
  }

  return NextResponse.json({
    opportunities: customer.opportunities,
    projects: customer.projects,
  });
}
