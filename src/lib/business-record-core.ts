import { db } from "./db";

export const BUSINESS_RECORD_CATEGORIES = [
  "VISIT",
  "TRAINING",
  "NEGOTIATION",
  "DELIVERY",
  "RELATIONSHIP",
  "OTHER",
] as const;

export type BusinessRecordCategory = (typeof BUSINESS_RECORD_CATEGORIES)[number];

export function normalizeBusinessRecordCategory(raw: string): BusinessRecordCategory {
  return BUSINESS_RECORD_CATEGORIES.includes(raw as BusinessRecordCategory) ? (raw as BusinessRecordCategory) : "OTHER";
}

export async function persistBusinessRecord(opts: {
  partnerId: string;
  userId: string;
  category: string;
  title: string;
  content?: string | null;
  occurredAt: Date;
  contactId?: string | null;
  source: string;
  sourceTodoId?: string | null;
}) {
  const category = normalizeBusinessRecordCategory(opts.category);
  const event = await db.timelineEvent.create({
    data: {
      partnerId: opts.partnerId,
      type: "MILESTONE",
      title: opts.title,
      content: opts.content,
      createdById: opts.userId,
      createdAt: opts.occurredAt,
      meta: JSON.stringify({ category, source: opts.source }),
    },
  });

  const record = await db.businessRecord.create({
    data: {
      partnerId: opts.partnerId,
      category,
      title: opts.title,
      content: opts.content,
      occurredAt: opts.occurredAt,
      contactId: opts.contactId,
      timelineEventId: event.id,
      sourceTodoId: opts.sourceTodoId,
      source: opts.source,
      createdById: opts.userId,
    },
  });

  if (opts.sourceTodoId) {
    await db.todoItem.update({
      where: { id: opts.sourceTodoId },
      data: { status: "DONE", doneAt: new Date() },
    });
  }

  return record;
}
