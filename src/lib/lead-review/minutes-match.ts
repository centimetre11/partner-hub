import "server-only";

import type { LeadReviewItem, LeadReviewMeeting } from "@prisma/client";
import { chatJson } from "../ai";
import {
  parseNumberedSummarySections,
  isAiStyleMinutes,
  sequentialPartitionByDiscussOrder,
} from "../partner-review/minutes-match";
import type { TranscriptSegment } from "../partner-review/markers";
import {
  parseTimedTranscriptDoc,
  type TimedTranscriptDoc,
} from "../partner-review/transcript";
import {
  buildLeadLiveNotesFromSegments,
  type LeadTranscriptSegment,
} from "./markers";

type MeetingWithItems = LeadReviewMeeting & {
  items: LeadReviewItem[];
};

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
}

function nameMatchScore(text: string, displayName: string): number {
  const hay = normalizeName(text);
  const name = normalizeName(displayName);
  if (!name || !hay) return 0;
  if (hay.includes(name)) return name.length + 10;
  const parts = displayName.split(/\s+/).filter((p) => p.length > 2);
  let score = 0;
  for (const p of parts) {
    const np = normalizeName(p);
    if (np && hay.includes(np)) score += np.length;
  }
  return score;
}

function countWithText(segments: LeadTranscriptSegment[]): number {
  return segments.filter((s) => s.itemId && s.text.trim()).length;
}

function discussOrderItems(meeting: MeetingWithItems): { id: string; displayName: string }[] {
  const marked = [...meeting.items]
    .filter((it) => it.markerInsertedAt || it.discussedAt)
    .sort((a, b) => {
      const ta = (a.markerInsertedAt ?? a.discussedAt)!.getTime();
      const tb = (b.markerInsertedAt ?? b.discussedAt)!.getTime();
      return ta - tb;
    });
  if (marked.length) {
    return marked.map((it) => ({
      id: it.id,
      displayName: it.displayName?.trim() || it.id.slice(0, 8),
    }));
  }
  return [...meeting.items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((it) => ({
      id: it.id,
      displayName: it.displayName?.trim() || it.id.slice(0, 8),
    }));
}

function fromPartnerSegments(
  segs: TranscriptSegment[],
  idMap: Map<string, string>,
): LeadTranscriptSegment[] {
  return segs.map((s) => ({
    itemId: s.partnerId ? idMap.get(s.partnerId) ?? s.partnerId : null,
    displayName: s.partnerName,
    text: s.text,
  }));
}

/** 按打点相对时间切讯飞句子 */
function matchByTimeline(meeting: MeetingWithItems): LeadTranscriptSegment[] | null {
  const json = meeting.transcriptJson || meeting.xfyunTranscriptJson;
  if (!json) return null;
  let doc: TimedTranscriptDoc | null = null;
  try {
    doc = parseTimedTranscriptDoc(json);
  } catch {
    return null;
  }
  if (!doc?.sentences?.length) return null;

  const anchor = meeting.recordingStartedAt ?? meeting.startedAt;
  if (!anchor) return null;

  const ordered = discussOrderItems(meeting).filter((it) => {
    const row = meeting.items.find((i) => i.id === it.id);
    return !!(row?.markerInsertedAt || row?.discussedAt);
  });
  if (ordered.length < 2) return null;

  const boundaries = ordered.map((it) => {
    const row = meeting.items.find((i) => i.id === it.id)!;
    const mark = row.markerInsertedAt ?? row.discussedAt!;
    return {
      itemId: it.id,
      displayName: it.displayName,
      relativeMs: Math.max(0, mark.getTime() - anchor.getTime()),
    };
  });

  const buckets = new Map<string, string[]>();
  const unKey = "__un__";
  buckets.set(unKey, []);
  for (const b of boundaries) buckets.set(b.itemId, []);

  for (const s of doc.sentences) {
    const t = s.startTime ?? 0;
    let owner: (typeof boundaries)[0] | null = null;
    for (const b of boundaries) {
      if (b.relativeMs <= t) owner = b;
      else break;
    }
    const line = s.text.trim();
    if (!line) continue;
    if (!owner) buckets.get(unKey)!.push(line);
    else buckets.get(owner.itemId)!.push(line);
  }

  const segments: LeadTranscriptSegment[] = [];
  const un = buckets.get(unKey)!;
  if (un.length) segments.push({ itemId: null, displayName: null, text: un.join("\n") });
  for (const b of boundaries) {
    segments.push({
      itemId: b.itemId,
      displayName: b.displayName,
      text: (buckets.get(b.itemId) ?? []).join("\n"),
    });
  }
  return segments;
}

function matchNumberedSummary(meeting: MeetingWithItems, text: string): LeadTranscriptSegment[] | null {
  const sections = parseNumberedSummarySections(text);
  if (!sections.length) return null;
  const marked = discussOrderItems(meeting);
  if (!marked.length) return null;

  const segments: LeadTranscriptSegment[] = [];
  const beforeSummary = text.split(/小结/)[0]?.trim();
  if (beforeSummary && !/^会议概览\s*$/.test(beforeSummary.slice(0, 40))) {
    segments.push({ itemId: null, displayName: null, text: beforeSummary });
  }

  if (sections.length === marked.length) {
    for (let i = 0; i < marked.length; i++) {
      const item = marked[i]!;
      const sec = sections[i]!;
      segments.push({
        itemId: item.id,
        displayName: item.displayName,
        text: `[${sec.title}]\n${sec.body}`.trim(),
      });
    }
    return segments;
  }

  const used = new Set<string>();
  for (const sec of sections) {
    let best: (typeof marked)[number] | null = null;
    let bestScore = 0;
    for (const item of marked) {
      if (used.has(item.id)) continue;
      const score = Math.max(
        nameMatchScore(sec.title + sec.body, item.displayName),
        nameMatchScore(sec.title, item.displayName),
      );
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    if (best && bestScore > 0) {
      used.add(best.id);
      segments.push({
        itemId: best.id,
        displayName: best.displayName,
        text: `[${sec.title}]\n${sec.body}`.trim(),
      });
    } else {
      const block = `[${sec.title}]\n${sec.body}`.trim();
      const un = segments.find((s) => !s.itemId);
      if (un) un.text = `${un.text}\n\n${block}`.trim();
      else segments.push({ itemId: null, displayName: null, text: block });
    }
  }
  for (const item of marked) {
    if (!segments.some((s) => s.itemId === item.id)) {
      segments.push({ itemId: item.id, displayName: item.displayName, text: "" });
    }
  }
  return segments;
}

function heuristicByName(meeting: MeetingWithItems, text: string): LeadTranscriptSegment[] {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
  const assigned = new Map<string, string[]>();
  const unassigned: string[] = [];

  for (const para of paragraphs) {
    let bestId: string | null = null;
    let bestScore = 0;
    for (const item of meeting.items) {
      const name = item.displayName?.trim();
      if (!name) continue;
      const score = nameMatchScore(para, name);
      if (score > bestScore) {
        bestScore = score;
        bestId = item.id;
      }
    }
    if (bestId && bestScore > 3) {
      assigned.set(bestId, [...(assigned.get(bestId) ?? []), para]);
    } else {
      unassigned.push(para);
    }
  }

  const segments: LeadTranscriptSegment[] = [];
  if (unassigned.length) {
    segments.push({ itemId: null, displayName: null, text: unassigned.join("\n\n") });
  }
  for (const item of meeting.items) {
    const name = item.displayName?.trim() || item.id.slice(0, 8);
    segments.push({
      itemId: item.id,
      displayName: name,
      text: (assigned.get(item.id) ?? []).join("\n\n"),
    });
  }
  return segments;
}

async function aiMatchMinutesToLeads(
  meeting: MeetingWithItems,
  userId?: string,
): Promise<LeadTranscriptSegment[] | null> {
  const text = meeting.transcriptText?.trim();
  if (!text) return null;

  const order = discussOrderItems(meeting);
  const agenda = meeting.items
    .map((it, idx) => {
      const name = it.displayName?.trim() || it.id.slice(0, 8);
      const marked = it.markerInsertedAt || it.discussedAt ? "会中已点过" : "未点过";
      const orderHint = order.findIndex((d) => d.id === it.id);
      const orderLabel = orderHint >= 0 ? `讨论顺序第 ${orderHint + 1}` : "未在讨论顺序";
      return `${idx + 1}. itemId=${it.id} 名称「${name}」· ${marked} · ${orderLabel}`;
    })
    .join("\n");

  const orderList = order
    .map((it, i) => `${i + 1}. 「${it.displayName}」(itemId=${it.id})`)
    .join("\n");

  try {
    const ai = await chatJson<{
      segments?: Array<{ itemId?: string; text?: string }>;
      unassigned?: string;
    }>(
      `你是过线索会议记录助手。用户粘贴的是本场会议纪要（智能纪要或发言人逐字稿）。
把内容归属到议程线索（封闭集合），按讨论顺序整段连续切分。

议程：
${agenda}

讨论顺序（优先）：
${orderList}

规则：
1. segments[].itemId 必须是议程里的 itemId。
2. 不要编造内容；开场寒暄放 unassigned。
3. 尽量整段归属，不要打散同一线索。

输出 JSON：
{"segments":[{"itemId":"...","text":"..."}],"unassigned":"开场（尽量短）"}`,
      text.slice(0, 28000),
      { userId, temperature: 0.2 },
    );

    const nameById = new Map(
      meeting.items.map((it) => [
        it.id,
        it.displayName?.trim() || it.id.slice(0, 8),
      ]),
    );
    const segments: LeadTranscriptSegment[] = [];
    const un = String(ai.unassigned ?? "").trim();
    if (un) segments.push({ itemId: null, displayName: null, text: un });
    for (const s of ai.segments ?? []) {
      const id = String(s.itemId ?? "").trim();
      if (!id || !nameById.has(id)) continue;
      segments.push({
        itemId: id,
        displayName: nameById.get(id)!,
        text: String(s.text ?? "").trim(),
      });
    }
    for (const it of meeting.items) {
      if (!segments.some((s) => s.itemId === it.id)) {
        segments.push({
          itemId: it.id,
          displayName: nameById.get(it.id)!,
          text: "",
        });
      }
    }
    return countWithText(segments) > 0 ? segments : null;
  } catch {
    return null;
  }
}

/**
 * 将粘贴/转写纪要匹配到议程线索。
 */
export async function matchMinutesToLeads(
  meeting: MeetingWithItems,
  userId?: string,
): Promise<{ segments: LeadTranscriptSegment[]; method: string }> {
  const text = meeting.transcriptText?.trim() ?? "";
  if (!text) return { segments: [], method: "empty" };

  const markedCount = meeting.items.filter((it) => it.markerInsertedAt || it.discussedAt).length;
  const isXfyun = meeting.matchSource === "xfyun";

  if (isXfyun && markedCount >= 2) {
    const timeSegs = matchByTimeline(meeting);
    if (timeSegs && countWithText(timeSegs) >= Math.max(2, Math.ceil(markedCount * 0.5))) {
      return { segments: timeSegs, method: "timeline" };
    }
  }

  const byOrder = matchNumberedSummary(meeting, text);
  if (byOrder) {
    const n = countWithText(byOrder);
    const expect = Math.max(2, Math.min(markedCount || meeting.items.length, 3));
    if (n >= expect || (n >= 2 && isAiStyleMinutes(text))) {
      return { segments: byOrder, method: "summary_sections" };
    }
  }

  const orderPartners = discussOrderItems(meeting).map((it) => ({
    partnerId: it.id,
    partnerName: it.displayName,
  }));
  const idMap = new Map(orderPartners.map((p) => [p.partnerId, p.partnerId]));
  const sequential = sequentialPartitionByDiscussOrder(text, orderPartners);
  if (sequential && countWithText(fromPartnerSegments(sequential, idMap)) >= 2) {
    return {
      segments: fromPartnerSegments(sequential, idMap),
      method: "sequential",
    };
  }

  const aiSegs = await aiMatchMinutesToLeads(meeting, userId);
  if (aiSegs && countWithText(aiSegs) > 0) {
    return { segments: aiSegs, method: "ai" };
  }

  const heur = heuristicByName(meeting, text);
  if (countWithText(heur) > 0) {
    return { segments: heur, method: "name" };
  }

  if (aiSegs?.length) return { segments: aiSegs, method: "ai_fallback" };

  return {
    segments: [
      { itemId: null, displayName: null, text },
      ...meeting.items.map((it) => ({
        itemId: it.id,
        displayName: it.displayName?.trim() || it.id.slice(0, 8),
        text: "",
      })),
    ],
    method: "unassigned",
  };
}

export async function materializeLeadReviewLiveNotesFromMatch(
  meetingId: string,
  userId?: string,
): Promise<{ liveNotes: string | null; matchMethod?: string }> {
  const { db } = await import("../db");
  const meeting = await db.leadReviewMeeting.findUnique({
    where: { id: meetingId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!meeting) return { liveNotes: null };
  if (!meeting.transcriptText?.trim()) return { liveNotes: null };

  const { segments, method } = await matchMinutesToLeads(meeting, userId);
  if (!segments.length) return { liveNotes: null, matchMethod: method };

  const liveNotes = buildLeadLiveNotesFromSegments(segments);
  await db.leadReviewMeeting.update({
    where: { id: meetingId },
    data: { liveNotes },
  });
  return { liveNotes, matchMethod: method };
}
