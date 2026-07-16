import "server-only";

import { db } from "../db";
import { chatJson } from "../ai";
import { parsePartnerSectionsFromLiveNotes, type TranscriptSegment } from "./markers";
import { matchMinutesToPartners } from "./minutes-match";
import type { SplitProposal, SplitProposalItem } from "./split-types";

export type { SplitProposal, SplitProposalItem } from "./split-types";

async function compressSegmentText(opts: {
  partnerName: string;
  segmentText: string;
  userId?: string;
}): Promise<string> {
  const raw = opts.segmentText.trim();
  if (!raw) return "";
  if (raw.length <= 1800) return raw;

  try {
    const ai = await chatJson<{ compressed?: string }>(
      `你是商务助理。把过伙伴会议中关于某伙伴的长纪要压缩为要点列表（保留事实、数字、人名、日期；去掉重复与寒暄）。输出 JSON：{ compressed: string }`,
      `伙伴：${opts.partnerName}\n\n原文（${raw.length} 字）：\n${raw.slice(0, 24000)}`,
      {
        feature: "partner_review_split",
        userId: opts.userId,
        scene: "default",
        taskTier: "fast",
        temperature: 0.1,
      },
    );
    const compressed = String(ai.compressed ?? "").trim();
    return compressed || raw.slice(0, 1800);
  } catch {
    return raw.slice(0, 1800);
  }
}

async function summarizeSegment(opts: {
  partnerName: string;
  segmentText: string;
  userId?: string;
}): Promise<{
  coreNotes: string;
  businessRecordTitle: string;
  businessRecordContent: string;
  todos: { title: string; detail?: string; dueDate?: string | null }[];
}> {
  if (!opts.segmentText.trim()) {
    return {
      coreNotes: "",
      businessRecordTitle: `${opts.partnerName} 过伙伴讨论`,
      businessRecordContent: "",
      todos: [],
    };
  }

  const compressed = await compressSegmentText(opts);

  try {
    const ai = await chatJson<{
      progressSummary?: string;
      todos?: { title?: string; detail?: string; dueDate?: string | null }[];
    }>(
      `你是商务助理。过伙伴会议已按讨论进程把纪要归属到某伙伴。请提炼：
1. progressSummary：该伙伴「近两周 / 会前至今」的进展与本次会上相关结论（200-400字，适合写入商务记录；只写片段中提及的内容，不要编造）
2. todos：明确的「后续两周」待办数组 {title, detail?, dueDate?}，dueDate 用 YYYY-MM-DD 或 null

只输出 JSON：{ progressSummary, todos }`,
      `伙伴：${opts.partnerName}\n\n讨论片段：\n${compressed.slice(0, 12000)}`,
      {
        feature: "partner_review_split",
        userId: opts.userId,
        scene: "default",
        taskTier: "fast",
        temperature: 0.2,
      },
    );

    const progressSummary = String(ai.progressSummary ?? "").trim();
    return {
      coreNotes: progressSummary,
      businessRecordTitle: `${opts.partnerName} 过伙伴讨论`,
      businessRecordContent: progressSummary || compressed.slice(0, 2000),
      todos: (ai.todos ?? [])
        .map((t) => ({
          title: String(t.title ?? "").trim(),
          detail: t.detail ? String(t.detail).trim() : undefined,
          dueDate: t.dueDate ? String(t.dueDate).trim() : null,
        }))
        .filter((t) => t.title),
    };
  } catch {
    return {
      coreNotes: compressed.slice(0, 400),
      businessRecordTitle: `${opts.partnerName} 过伙伴讨论`,
      businessRecordContent: compressed.slice(0, 2000),
      todos: [],
    };
  }
}

function mergeSegmentsForPartner(segments: TranscriptSegment[], partnerId: string): string {
  return segments
    .filter((s) => s.partnerId === partnerId)
    .map((s) => s.text)
    .filter(Boolean)
    .join("\n\n");
}

/**
 * 为每个议程项生成进展总结 + 待办（不落库）。
 * 优先使用已确认的 liveNotes 归属，避免覆盖人工调整；无 liveNotes 时才回退自动匹配。
 */
export async function buildSplitProposal(meetingId: string, userId?: string): Promise<SplitProposal> {
  const meeting = await db.partnerReviewMeeting.findUnique({
    where: { id: meetingId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { partner: { select: { id: true, name: true } } },
      },
    },
  });
  if (!meeting) throw new Error("会议不存在");

  const agenda = meeting.items.map((it) => ({
    partnerId: it.partnerId,
    partnerName: it.partner.name,
  }));

  const fromNotes = meeting.liveNotes?.trim()
    ? parsePartnerSectionsFromLiveNotes(meeting.liveNotes, agenda).filter(
        (s) => s.partnerId || s.text.trim(),
      )
    : [];

  const noteSegments = fromNotes.length
    ? fromNotes
    : (await matchMinutesToPartners(meeting, userId)).segments;

  const unassignedText = noteSegments
    .filter((s) => !s.partnerId)
    .map((s) => s.text)
    .filter(Boolean)
    .join("\n\n");

  const items: SplitProposalItem[] = [];
  for (const item of meeting.items) {
    const segmentText = mergeSegmentsForPartner(noteSegments, item.partnerId);
    const summary = await summarizeSegment({
      partnerName: item.partner.name,
      segmentText,
      userId,
    });
    items.push({
      itemId: item.id,
      partnerId: item.partnerId,
      partnerName: item.partner.name,
      segmentText,
      ...summary,
    });
  }

  return { meetingId, items, unassignedText };
}

/** 把 AI 拆分结果写入草案字段（仍需人工确认才写商务记录/正式待办） */
export async function persistSplitDrafts(proposal: SplitProposal) {
  for (const row of proposal.items) {
    await db.partnerReviewTodoDraft.deleteMany({ where: { itemId: row.itemId, confirmed: false } });
    await db.partnerReviewItem.update({
      where: { id: row.itemId },
      data: {
        coreNotes: row.coreNotes || null,
      },
    });
    if (row.todos.length) {
      await db.partnerReviewTodoDraft.createMany({
        data: row.todos.map((t, i) => ({
          itemId: row.itemId,
          title: t.title,
          detail: t.detail ?? null,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
          sortOrder: i,
          confirmed: false,
        })),
      });
    }
  }

  await db.partnerReviewMeeting.update({
    where: { id: proposal.meetingId },
    data: { status: "PROCESSING" },
  });
}
