import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "20"), 50);

    if (!q) {
      return NextResponse.json({ customers: [] });
    }

    const customers = await db.crmCustomer.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { id: { contains: q } },
          { city: { contains: q } },
          { salesman: { contains: q } },
        ],
      },
      orderBy: { name: "asc" },
      take: limit,
      select: {
        id: true,
        name: true,
        city: true,
        status: true,
        salesman: true,
      },
    });

    return NextResponse.json({ customers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
