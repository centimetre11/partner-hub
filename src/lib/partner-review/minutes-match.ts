import "server-only";

import type { PartnerReviewMeeting, PartnerReviewItem, Partner } from "@prisma/client";
import { chatJson } from "../ai";
import type { TranscriptSegment } from "./markers";
import { computeTranscriptSegments } from "./segment";

type MeetingWithItems = PartnerReviewMeeting & {
  items: (PartnerReviewItem & { partner: Pick<Partner, "id" | "name"> })[];
};

export function isAiStyleMinutes(text: string): boolean {
  return /会议概览|智能纪要|AI纪要|元宝|会议助手|小结|会议概览/i.test(text);
}

function countAssignedPartners(segments: TranscriptSegment[], partnerIds: string[]): number {
  return partnerIds.filter((pid) =>
    segments.some((s) => s.partnerId === pid && s.text.trim()),
  ).length;
}

function formatRelativeMarker(
  markerAt: Date | null,
  startedAt: Date | null,
): string {
  if (!markerAt || !startedAt) return "—";
  const sec = Math.max(0, Math.round((markerAt.getTime() - startedAt.getTime()) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `会议 +${mm}:${ss}`;
}

/** 解析「小结」里 1. 标题 + 正文 的结构（腾讯 AI 纪要常见） */
export function parseNumberedSummarySections(text: string): { title: string; body: string }[] {
  const sections: { title: string; body: string }[] = [];
  const re = /(?:^|\n)\s*(\d+)\.\s*([^\n]+)\n([\s\S]*?)(?=\n\s*\d+\.\s|\n*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const title = m[2]!.trim();
    const body = m[3]!.trim();
    if (title) sections.push({ title, body });
  }
  return sections;
}

/** 按会中打点顺序，把「小结」编号段落对应到议程伙伴 */
export function matchSectionsByMarkerOrder(
  text: string,
  items: MeetingWithItems["items"],
  startedAt: Date | null,
): TranscriptSegment[] | null {
  const sections = parseNumberedSummarySections(text);
  if (!sections.length) return null;

  const marked = [...items]
    .filter((it) => it.markerInsertedAt || it.discussedAt)
    .sort((a, b) => {
      const ta = (a.markerInsertedAt ?? a.discussedAt)!.getTime();
      const tb = (b.markerInsertedAt ?? b.discussedAt)!.getTime();
      return ta - tb;
    });

  if (!marked.length) return null;

  const unassigned: string[] = [];
  const beforeSummary = text.split(/小结/)[0]?.trim();
  if (beforeSummary && !/^会议概览\s*$/.test(beforeSummary.slice(0, 40))) {
    unassigned.push(beforeSummary);
  }

  const segments: TranscriptSegment[] = [];
  if (unassigned.length) {
    segments.push({ partnerId: null, partnerName: null, text: unassigned.join("\n\n") });
  }

  if (sections.length === marked.length) {
    for (let i = 0; i < marked.length; i++) {
      const item = marked[i]!;
      const sec = sections[i]!;
      segments.push({
        partnerId: item.partnerId,
        partnerName: item.partner.name,
        text: `[${sec.title}]\n${sec.body}`.trim(),
      });
    }
  } else {
    const used = new Set<string>();
    for (const sec of sections) {
      let best: (typeof marked)[number] | null = null;
      let bestScore = 0;
      for (const item of marked) {
        if (used.has(item.partnerId)) continue;
        const score = Math.max(
          nameMatchScore(sec.title + sec.body, item.partner.name),
          nameMatchScore(sec.title, item.partner.name),
        );
        if (score > bestScore) {
          bestScore = score;
          best = item;
        }
      }
      if (best && bestScore > 0) {
        used.add(best.partnerId);
        segments.push({
          partnerId: best.partnerId,
          partnerName: best.partner.name,
          text: `[${sec.title}]\n${sec.body}`.trim(),
        });
      } else {
        const un = segments.find((s) => !s.partnerId);
        const block = `[${sec.title}]\n${sec.body}`.trim();
        if (un) un.text = `${un.text}\n\n${block}`.trim();
        else segments.push({ partnerId: null, partnerName: null, text: block });
      }
    }
    for (const item of marked) {
      if (!segments.some((s) => s.partnerId === item.partnerId)) {
        segments.push({ partnerId: item.partnerId, partnerName: item.partner.name, text: "" });
      }
    }
  }

  // 时间线叙述（14:28 等）追加到最相关伙伴或未归属
  const narrative = extractNarrativeBlocks(text);
  if (narrative.trim()) {
    for (const block of narrative.split(/\n\n+/).filter(Boolean)) {
      let best: (typeof marked)[number] | null = null;
      let bestScore = 0;
      for (const item of marked) {
        const score = nameMatchScore(block, item.partner.name);
        if (score > bestScore) {
          bestScore = score;
          best = item;
        }
      }
      if (best && bestScore > 0) {
        const seg = segments.find((s) => s.partnerId === best!.partnerId);
        if (seg) seg.text = `${seg.text}\n\n${block}`.trim();
        else {
          segments.push({
            partnerId: best.partnerId,
            partnerName: best.partner.name,
            text: block,
          });
        }
      } else {
        const un = segments.find((s) => !s.partnerId);
        if (un) un.text = `${un.text}\n\n${block}`.trim();
        else segments.push({ partnerId: null, partnerName: null, text: block });
      }
    }
  }

  return segments;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
}

function nameMatchScore(text: string, partnerName: string): number {
  const hay = normalizeName(text);
  const name = normalizeName(partnerName);
  if (!name || !hay) return 0;
  if (hay.includes(name)) return name.length + 10;
  const parts = partnerName.split(/\s+/).filter((p) => p.length > 2);
  let score = 0;
  for (const p of parts) {
    const np = normalizeName(p);
    if (np && hay.includes(np)) score += np.length;
  }
  return score;
}

function extractNarrativeBlocks(text: string): string {
  const lines = text.split(/\r?\n/);
  const blocks: string[] = [];
  let buf: string[] = [];
  for (const line of lines) {
    if (/^\d{1,2}:\d{2}(?::\d{2})?\s/.test(line.trim())) {
      if (buf.length) blocks.push(buf.join("\n"));
      buf = [line.trim()];
    } else if (buf.length && line.trim()) {
      buf.push(line.trim());
    }
  }
  if (buf.length) blocks.push(buf.join("\n"));
  return blocks.join("\n\n");
}

/** 按伙伴名在全文中的出现分配段落（兜底） */
export function heuristicMatchByPartnerName(
  text: string,
  items: MeetingWithItems["items"],
): TranscriptSegment[] {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
  const assigned = new Map<string, string[]>();
  const unassigned: string[] = [];

  for (const para of paragraphs) {
    let bestId: string | null = null;
    let bestScore = 0;
    for (const item of items) {
      const score = nameMatchScore(para, item.partner.name);
      if (score > bestScore) {
        bestScore = score;
        bestId = item.partnerId;
      }
    }
    if (bestId && bestScore > 3) {
      assigned.set(bestId, [...(assigned.get(bestId) ?? []), para]);
    } else {
      unassigned.push(para);
    }
  }

  const segments: TranscriptSegment[] = [];
  if (unassigned.length) {
    segments.push({
      partnerId: null,
      partnerName: null,
      text: unassigned.join("\n\n"),
    });
  }
  for (const item of items) {
    const chunks = assigned.get(item.partnerId);
    segments.push({
      partnerId: item.partnerId,
      partnerName: item.partner.name,
      text: chunks?.join("\n\n") ?? "",
    });
  }
  return segments;
}

function markedItems(meeting: MeetingWithItems) {
  return [...meeting.items]
    .filter((it) => it.markerInsertedAt || it.discussedAt)
    .sort((a, b) => {
      const ta = (a.markerInsertedAt ?? a.discussedAt)!.getTime();
      const tb = (b.markerInsertedAt ?? b.discussedAt)!.getTime();
      return ta - tb;
    });
}

function countPartnersWithText(segments: TranscriptSegment[]): number {
  return segments.filter((s) => s.partnerId && s.text.trim()).length;
}

/** 时间轴结果是否可信：多名已打点伙伴时，不能几乎全归到一家 */
function isStrongTimelineMatch(
  segments: TranscriptSegment[],
  partnerIds: string[],
  markedCount: number,
): boolean {
  const assigned = countAssignedPartners(segments, partnerIds);
  const withText = countPartnersWithText(segments);
  if (assigned === 0 || isMostlyUnassigned(segments, partnerIds.length)) return false;
  if (markedCount >= 2 && withText <= 1) return false;
  return assigned >= Math.max(1, Math.min(partnerIds.length, 2));
}

async function aiMatchMinutesToPartners(
  meeting: MeetingWithItems,
  userId?: string,
): Promise<TranscriptSegment[] | null> {
  const text = meeting.transcriptText?.trim();
  if (!text) return null;

  const discussed = markedItems(meeting);
  const agenda = [...meeting.items]
    .map((it, idx) => {
      const marker = it.markerInsertedAt ?? it.discussedAt;
      const rel = formatRelativeMarker(marker, meeting.startedAt);
      const marked = marker ? "已打点" : "未打点";
      return `${idx + 1}. partnerId=${it.partnerId} 名称「${it.partner.name}」${marked}${marker ? ` ${rel}` : ""}`;
    })
    .join("\n");

  const processHint = discussed.length
    ? `会中实际讨论顺序（按打点时间，最重要）：\n${discussed
        .map((it, i) => {
          const marker = it.markerInsertedAt ?? it.discussedAt;
          return `${i + 1}. 「${it.partner.name}」${formatRelativeMarker(marker, meeting.startedAt)} partnerId=${it.partnerId}`;
        })
        .join("\n")}\n\n请优先按该讨论时间线切分：从某伙伴打点起，到下一位打点前的内容，归该伙伴；最后一位打点之后的内容归最后一位。若文本为逐字稿且含 00:mm:ss，请对齐相对时间。`
    : "会中未打点：按语义/名称把段落归属到伙伴。";

  try {
    const ai = await chatJson<{
      segments?: { partnerId?: string; text?: string }[];
      unassigned?: string;
    }>(
      `你是过伙伴会议记录助手。用户粘贴腾讯会议纪要（可能是 AI 智能纪要，也可能是「发言人 N HH:MM:SS」逐字稿）。
任务：按会中讨论进程，把全文切分到各位伙伴。
规则：
1. 必须优先遵循「会中实际讨论顺序」与相对时间（会议 +mm:ss），不要只看名字出现次数。
2. 纪要可能用国家、项目、简称指代伙伴，结合语义对应。
3. 每位议程伙伴都要有一条 segments（未讨论则 text 为空字符串）。
4. 不要编造原文没有的内容；可压缩重复寒暄，但保留事实。
只输出 JSON：
{"segments":[{"partnerId":"...","text":"..."}],"unassigned":"开场/串场未归属内容"}`,
      `${processHint}\n\n议程伙伴：\n${agenda}\n\n---\n纪要全文：\n${text.slice(0, 28000)}`,
      {
        feature: "partner_review_match",
        userId,
        scene: "default",
        taskTier: "fast",
        temperature: 0.15,
      },
    );

    const byId = new Map(meeting.items.map((it) => [it.partnerId, it]));
    const segments: TranscriptSegment[] = [];
    const un = String(ai.unassigned ?? "").trim();
    if (un) segments.push({ partnerId: null, partnerName: null, text: un });

    for (const row of ai.segments ?? []) {
      const pid = String(row.partnerId ?? "").trim();
      const body = String(row.text ?? "").trim();
      const item = byId.get(pid);
      if (!item) continue;
      segments.push({
        partnerId: item.partnerId,
        partnerName: item.partner.name,
        text: body,
      });
    }

    for (const item of meeting.items) {
      if (!segments.some((s) => s.partnerId === item.partnerId)) {
        segments.push({ partnerId: item.partnerId, partnerName: item.partner.name, text: "" });
      }
    }

    return segments;
  } catch {
    return null;
  }
}

export function matchMethodLabel(method?: string): string {
  switch (method) {
    case "timeline":
      return "已按打点时间轴匹配";
    case "summary_sections":
      return "已按「小结」编号与打点顺序匹配";
    case "ai":
      return "已用 AI 按伙伴语义匹配";
    case "name":
      return "已按伙伴名称关键词匹配";
    case "timeline_fallback":
      return "时间轴部分匹配，请核对";
    case "ai_fallback":
      return "AI 匹配（部分），请核对";
    default:
      return "已匹配到各伙伴，请核对";
  }
}

function isMostlyUnassigned(segments: TranscriptSegment[], partnerCount: number): boolean {
  const assigned = countAssignedPartners(segments, segments.map((s) => s.partnerId!).filter(Boolean));
  if (partnerCount <= 0) return true;
  return assigned === 0 || (segments.length === 1 && !segments[0]?.partnerId);
}

/**
 * 将粘贴的腾讯纪要匹配到议程伙伴：
 * 有可靠时间轴（打点 + 带时间戳转写）→ 小结编号 → AI（按讨论进程）→ 名称兜底。
 */
export async function matchMinutesToPartners(
  meeting: MeetingWithItems,
  userId?: string,
): Promise<{ segments: TranscriptSegment[]; method: string }> {
  const text = meeting.transcriptText?.trim() ?? "";
  const partnerIds = meeting.items.map((it) => it.partnerId);
  const markedCount = markedItems(meeting).length;

  if (!text) {
    return { segments: [], method: "empty" };
  }

  const timeSegments = computeTranscriptSegments(meeting);
  const timeAssigned = countAssignedPartners(timeSegments, partnerIds);
  const timeWithText = countPartnersWithText(timeSegments);

  if (isStrongTimelineMatch(timeSegments, partnerIds, markedCount)) {
    return { segments: timeSegments, method: "timeline" };
  }

  const byOrder = matchSectionsByMarkerOrder(text, meeting.items, meeting.startedAt);
  if (byOrder) {
    const orderWithText = countPartnersWithText(byOrder);
    if (orderWithText > timeWithText || (orderWithText >= 2 && timeWithText <= 1)) {
      return { segments: byOrder, method: "summary_sections" };
    }
  }

  const aiSegments = await aiMatchMinutesToPartners(meeting, userId);
  if (aiSegments) {
    const aiWithText = countPartnersWithText(aiSegments);
    if (aiWithText > timeWithText || aiWithText >= Math.min(2, Math.max(1, markedCount))) {
      return { segments: aiSegments, method: "ai" };
    }
  }

  const heur = heuristicMatchByPartnerName(text, meeting.items);
  const heurWithText = countPartnersWithText(heur);
  if (heurWithText > timeWithText) {
    return { segments: heur, method: "name" };
  }

  if (aiSegments && countPartnersWithText(aiSegments) > 0) {
    return { segments: aiSegments, method: "ai_fallback" };
  }

  if (timeSegments.some((s) => s.text.trim())) {
    return { segments: timeSegments, method: "timeline_fallback" };
  }

  return {
    segments: [{ partnerId: null, partnerName: null, text }],
    method: "unassigned",
  };
}
