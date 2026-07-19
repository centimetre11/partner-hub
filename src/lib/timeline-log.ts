import { db } from "./db";
import { type OwnerRef, ownerData } from "./owner";

type TimelineOpts = {
  title: string;
  content?: string | null;
  type?: string;
  meta?: Record<string, unknown>;
  projectId?: string | null;
};

export async function logOwnerTimeline(owner: OwnerRef, userId: string, opts: TimelineOpts) {
  await db.timelineEvent.create({
    data: {
      ...ownerData(owner),
      projectId: opts.projectId ?? null,
      type: opts.type ?? "CHANGE",
      title: opts.title,
      content: opts.content ?? null,
      createdById: userId,
      meta: opts.meta ? JSON.stringify(opts.meta) : null,
    },
  });
}

/** 待办等可能同时挂在客户/伙伴上：有链接则各写一条，便于两侧详情页可见 */
export async function logLinkedTimeline(
  userId: string,
  opts: TimelineOpts & { customerId?: string | null; partnerId?: string | null },
) {
  const { customerId, partnerId, ...rest } = opts;
  if (customerId) await logOwnerTimeline({ kind: "customer", id: customerId }, userId, rest);
  if (partnerId) await logOwnerTimeline({ kind: "partner", id: partnerId }, userId, rest);
}
