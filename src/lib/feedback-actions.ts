"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperAdmin, requireUser } from "@/lib/session";

const FEEDBACK_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export async function createFeedbackAction(formData: FormData) {
  const user = await requireUser();
  const description = String(formData.get("description") ?? "").trim() || null;

  const assetIds = formData
    .getAll("assetIds")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (!description && assetIds.length === 0) {
    return { ok: false as const, error: "content_required" };
  }

  const title =
    description?.replace(/\s+/g, " ").slice(0, 80) ||
    (assetIds.length > 0 ? "Screenshot feedback" : "Feedback");

  await db.feedbackSubmission.create({
    data: {
      type: "OTHER",
      title,
      description,
      createdById: user.id,
      assets: assetIds.length
        ? {
            create: assetIds.map((assetId) => ({ assetId })),
          }
        : undefined,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/account");
  return { ok: true as const };
}

export async function updateFeedbackStatusAction(feedbackId: string, formData: FormData) {
  await requireSuperAdmin();
  const status = String(formData.get("status") ?? "").trim();
  if (!FEEDBACK_STATUSES.includes(status as FeedbackStatus)) {
    return { ok: false as const, error: "Invalid status" };
  }

  await db.feedbackSubmission.update({
    where: { id: feedbackId },
    data: { status },
  });

  revalidatePath("/settings");
  revalidatePath("/account");
  return { ok: true as const };
}
