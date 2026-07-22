import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { safeJson } from "@/lib/activity-log";
import type { TrackingEvent } from "@/lib/tracking/types";

function truncateText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function sanitizeMeta(value: unknown): string | null {
  if (!value || typeof value !== "object") return safeJson(value as Record<string, unknown>);
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    const lowerKey = key.toLowerCase();
    if (
      [
        "password",
        "token",
        "secret",
        "authorization",
        "apikey",
        "api_key",
        "api-key",
        "content",
        "body",
        "credential",
        "private_key",
        "privatekey",
      ].some((sk) => lowerKey.includes(sk))
    ) {
      cleaned[key] = "[redacted]";
      continue;
    }
    if (typeof val === "string" && val.length > 2000) {
      cleaned[key] = truncateText(val, 2000);
      continue;
    }
    cleaned[key] = val;
  }
  return safeJson(cleaned);
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { events?: TrackingEvent[]; sessionId?: string };
    const events = Array.isArray(body.events) ? body.events : [];
    if (events.length === 0) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const user = await getCurrentUser().catch(() => null);
    const sessionId = body.sessionId ?? null;
    const ipHash = hashIp(getClientIp(req));

    const data = events.map((event) => ({
      project: event.project ?? "partner-hub",
      userId: user?.id ?? null,
      sessionId,
      eventType: event.eventType,
      action: event.action,
      pagePath: event.pagePath ?? null,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      targetLabel: event.targetLabel ? truncateText(event.targetLabel, 500) : null,
      meta: sanitizeMeta(event.meta),
      ipHash,
      durationMs: event.durationMs ?? null,
      status: event.status ?? "SUCCESS",
    }));

    await db.userBehaviorLog.createMany({ data });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("[tracking beacon] failed:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
