import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const RETENTION_DAYS = 90;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  cutoff.setHours(0, 0, 0, 0);

  try {
    const [behaviorResult, systemResult] = await Promise.all([
      db.userBehaviorLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      db.systemEventLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    ]);

    return NextResponse.json({
      ok: true,
      deleted: {
        userBehavior: behaviorResult.count,
        systemEvent: systemResult.count,
      },
      cutoff: cutoff.toISOString(),
    });
  } catch (e) {
    console.error("[cleanup-tracking-logs] failed:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
