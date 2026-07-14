import "server-only";

import { db } from "../db";
import { chatJson } from "../ai";
import {
  assignSentencesByMarkerTime,
  splitTranscriptByMarkers,
  type TranscriptSegment,
} from "./markers";
import {
  parseTimedTranscriptDoc,
  parseTranscriptTextToTimedDoc,
  sentenceAbsoluteMs,
  sentencesToPlain,
} from "./transcript";
import type { SplitProposal, SplitProposalItem } from "./split-types";

export type { SplitProposal, SplitProposalItem } from "./split-types";

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

  try {
    const ai = await chatJson<{
      coreNotes?: string;
      businessRecordTitle?: string;
      businessRecordContent?: string;
      todos?: { title?: string; detail?: string; dueDate?: string | null }[];
    }>(
      `你是商务助理。根据「过伙伴」会议中关于某个伙伴的讨论片段，整理：
1. coreNotes：核心讨论内容（200字内）
2. businessRecordTitle：商务记录标题
3. businessRecordContent：可写入商务记录的正文（Markdown 短文）
4. todos：抽出的待办数组 {title, detail?, dueDate?}，dueDate 用 YYYY-MM-DD 或 null
只输出 JSON。不要编造片段中未提及的事实。`,
      `伙伴：${opts.partnerName}\n\n讨论片段：\n${opts.segmentText.slice(0, 12000)}`,
      {
        feature: "partner_review_split",
        userId: opts.userId,
        scene: "default",
        taskTier: "fast",
        temperature: 0.2,
      },
    );

    return {
      coreNotes: String(ai.coreNotes ?? "").trim(),
      businessRecordTitle: String(ai.businessRecordTitle ?? "").trim() || `${opts.partnerName} 过伙伴讨论`,
      businessRecordContent: String(ai.businessRecordContent ?? "").trim() || opts.segmentText.slice(0, 2000),
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
      coreNotes: opts.segmentText.slice(0, 400),
      businessRecordTitle: `${opts.partnerName} 过伙伴讨论`,
      businessRecordContent: opts.segmentText.slice(0, 2000),
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

/** 按标记拆分转写，并为每个议程项生成 AI 提案（不落库） */
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

  // 手写记录本：仍按文本标记切段
  const noteSegments = splitTranscriptByMarkers(meeting.liveNotes ?? "");

  // 转写：优先按标记时刻 × 句子时间对齐
  const timed =
    parseTimedTranscriptDoc(meeting.transcriptJson) ??
    parseTranscriptTextToTimedDoc(meeting.transcriptText ?? "", {
      recordingStartedAt: meeting.startedAt,
    });

  let transcriptSegments: TranscriptSegment[] = [];
  if (timed?.sentences.length) {
    const boundaries = meeting.items
      .map((it) => {
        const at = it.markerInsertedAt ?? it.discussedAt;
        if (!at) return null;
        return {
          partnerId: it.partnerId,
          partnerName: it.partner.name,
          atMs: at.getTime(),
        };
      })
      .filter((b): b is { partnerId: string; partnerName: string; atMs: number } => !!b)
      .sort((a, b) => a.atMs - b.atMs);

    if (boundaries.length) {
      const sentences = timed.sentences.map((s) => ({
        absoluteMs: sentenceAbsoluteMs(s, timed, meeting.startedAt),
        line: s.speaker ? `${s.speaker}: ${s.text}` : s.text,
      }));
      transcriptSegments = assignSentencesByMarkerTime(sentences, boundaries);
    } else {
      // 有时间轴但无标记时刻：整段未归属，避免误挂到某一伙伴
      transcriptSegments = [
        {
          partnerId: null,
          partnerName: null,
          text: timed.plain || sentencesToPlain(timed.sentences),
        },
      ];
    }
  } else if (meeting.transcriptText?.trim()) {
    // 无时间轴的旧转写：勿与 liveNotes 拼接后按标记切（会整段落到最后伙伴）
    // 若转写自身含标记则按标记切，否则全部未归属
    const hasMarkers = /<<<PARTNER:[^|>]+\|[^>]+>>>/.test(meeting.transcriptText);
    transcriptSegments = hasMarkers
      ? splitTranscriptByMarkers(meeting.transcriptText)
      : [{ partnerId: null, partnerName: null, text: meeting.transcriptText.trim() }];
  }

  const allSegments = [...noteSegments, ...transcriptSegments];
  const unassignedText = allSegments
    .filter((s) => !s.partnerId)
    .map((s) => s.text)
    .filter(Boolean)
    .join("\n\n");

  const items: SplitProposalItem[] = [];
  for (const item of meeting.items) {
    const fromNotes = mergeSegmentsForPartner(noteSegments, item.partnerId);
    const fromTranscript = mergeSegmentsForPartner(transcriptSegments, item.partnerId);
    // 记录本已写入实时转写时，不再与 transcriptText 叠一份，避免重复
    const segmentText = fromNotes.trim()
      ? fromNotes
      : fromTranscript;
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
