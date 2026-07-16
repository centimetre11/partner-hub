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

/** 时间轴仅作弱参考：开会打点与腾讯录音起点常不同步，绝不当主依据 */
function isUsableTimelineFallback(
  segments: TranscriptSegment[],
  partnerIds: string[],
  markedCount: number,
): boolean {
  const withText = countPartnersWithText(segments);
  if (withText === 0 || isMostlyUnassigned(segments, partnerIds.length)) return false;
  // 多名已讨论伙伴却只落到一家 → 典型偏移错误，不可用
  if (markedCount >= 2 && withText <= 1) return false;
  return withText >= 2;
}

function findNameOffset(hay: string, partnerName: string): number {
  const name = partnerName.trim();
  if (!name || !hay) return -1;
  const lower = hay.toLowerCase();
  const direct = lower.indexOf(name.toLowerCase());
  if (direct >= 0) return direct;
  let best = -1;
  for (const part of name.split(/[\s,/|]+/).filter((x) => x.length >= 3)) {
    const i = lower.indexOf(part.toLowerCase());
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

/** 按讨论顺序，用伙伴名首次出现作锚点，切成连续整段（不打散） */
export function sequentialPartitionByDiscussOrder(
  text: string,
  ordered: { partnerId: string; partnerName: string }[],
): TranscriptSegment[] | null {
  const raw = text.trim();
  if (!raw || ordered.length < 2) return null;

  type Anchor = { at: number; partnerId: string; partnerName: string };
  const anchors: Anchor[] = [];
  let searchFrom = 0;

  for (const p of ordered) {
    const rel = findNameOffset(raw.slice(searchFrom), p.partnerName);
    if (rel < 0) continue;
    const at = searchFrom + rel;
    if (anchors.length && at <= anchors[anchors.length - 1]!.at) continue;
    anchors.push({ at, partnerId: p.partnerId, partnerName: p.partnerName });
    searchFrom = at + Math.max(1, p.partnerName.trim().length);
  }

  if (anchors.length < 2) return null;

  const segments: TranscriptSegment[] = [];
  const head = raw.slice(0, anchors[0]!.at).trim();
  if (head) segments.push({ partnerId: null, partnerName: null, text: head });

  for (let i = 0; i < anchors.length; i++) {
    const cur = anchors[i]!;
    const end = i + 1 < anchors.length ? anchors[i + 1]!.at : raw.length;
    segments.push({
      partnerId: cur.partnerId,
      partnerName: cur.partnerName,
      text: raw.slice(cur.at, end).trim(),
    });
  }

  for (const p of ordered) {
    if (!segments.some((s) => s.partnerId === p.partnerId)) {
      segments.push({ partnerId: p.partnerId, partnerName: p.partnerName, text: "" });
    }
  }

  return segments;
}

function discussOrderPartners(meeting: MeetingWithItems): { partnerId: string; partnerName: string }[] {
  const discussed = markedItems(meeting);
  if (discussed.length) {
    return discussed.map((it) => ({ partnerId: it.partnerId, partnerName: it.partner.name }));
  }
  return [...meeting.items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((it) => ({ partnerId: it.partnerId, partnerName: it.partner.name }));
}

async function aiMatchMinutesToPartners(
  meeting: MeetingWithItems,
  userId?: string,
): Promise<TranscriptSegment[] | null> {
  const text = meeting.transcriptText?.trim();
  if (!text) return null;

  const orderPartners = discussOrderPartners(meeting);
  const agenda = [...meeting.items]
    .map((it, idx) => {
      const marker = it.markerInsertedAt ?? it.discussedAt;
      const marked = marker ? "会中已点过" : "议程上但未点过";
      const orderHint = orderPartners.findIndex((d) => d.partnerId === it.partnerId);
      const order =
        orderHint >= 0 ? `讨论顺序第 ${orderHint + 1}` : "未出现在讨论顺序";
      return `${idx + 1}. partnerId=${it.partnerId} 名称「${it.partner.name}」· ${marked} · ${order}`;
    })
    .join("\n");

  const orderList = orderPartners
    .map((it, i) => `${i + 1}. 「${it.partnerName}」(partnerId=${it.partnerId})`)
    .join("\n");

  try {
    const ai = await chatJson<{
      segments?: { partnerId?: string; text?: string }[];
      unassigned?: string;
    }>(
      `你是过伙伴会议记录助手。用户粘贴的是本场「过伙伴」会议纪要（智能纪要或发言人逐字稿）。

【核心假设 — 必须遵守】
过伙伴会议大概率是【顺序整段】进行的：先完整讨论伙伴 A，再完整讨论伙伴 B，再 C……
请把全文切成若干【连续、互不交叉】的整段，按「讨论顺序」依次归属。

规则：
1. 纪要对象是议程伙伴封闭集合；实质内容尽量都挂到某位伙伴。
2. 禁止按偶发提到的名字把内容打散到多段；后半场话题不要塞给前面的伙伴。
3. 时间戳（00:mm:ss）与开会打点常不同步，只能极弱参考，禁止按绝对时间硬切。
4. 切段依据：讨论顺序 + 话题切换（换伙伴/换项目）；每位讨论顺序中的伙伴对应原文里的一块连续文本。
5. 每位议程伙伴都要有一条 segments（未讨论则 text 为空）。
6. 不要编造；开场寒暄可放 unassigned。

只输出 JSON：
{"segments":[{"partnerId":"...","text":"..."}],"unassigned":"开场寒暄（尽量短）"}`,
      `讨论顺序（整段切分的主依据，从前到后）：\n${orderList}\n\n议程伙伴：\n${agenda}\n\n---\n纪要全文：\n${text.slice(0, 28000)}`,
      {
        feature: "partner_review_match",
        userId,
        scene: "default",
        taskTier: "fast",
        temperature: 0.1,
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
      return "已按时间戳弱参考匹配（请核对）";
    case "summary_sections":
      return "已按「小结」编号整段对齐讨论顺序";
    case "sequential":
      return "已按讨论顺序整段切分（连续段落），请核对切点";
    case "ai":
      return "已按讨论顺序整段语义切分，请核对切点";
    case "name":
      return "已按名称关键词匹配（可能打散，请优先按顺序整段核对）";
    case "timeline_fallback":
      return "时间戳弱参考（开会与录音可能不同步），请核对";
    case "ai_fallback":
      return "AI 整段切分完成，请核对";
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
 * 将粘贴的腾讯纪要匹配到议程伙伴。
 *
 * 原则：
 * - 纪要内容一定对应议程上的伙伴（封闭集合）
 * - 会议大概率按讨论顺序【整段连续】进行，优先顺序整段切分
 * - 时间戳只能弱参考：开会打点 ≠ 腾讯录音起点
 */
export async function matchMinutesToPartners(
  meeting: MeetingWithItems,
  userId?: string,
): Promise<{ segments: TranscriptSegment[]; method: string }> {
  const text = meeting.transcriptText?.trim() ?? "";
  const partnerIds = meeting.items.map((it) => it.partnerId);
  const markedCount = markedItems(meeting).length;
  const orderPartners = discussOrderPartners(meeting);

  if (!text) {
    return { segments: [], method: "empty" };
  }

  // 1) 智能纪要「小结」编号 ↔ 讨论顺序（天然整段）
  const byOrder = matchSectionsByMarkerOrder(text, meeting.items, meeting.startedAt);
  if (byOrder) {
    const orderWithText = countPartnersWithText(byOrder);
    const expect = Math.max(2, Math.min(markedCount || meeting.items.length, 3));
    if (orderWithText >= expect || (orderWithText >= 2 && isAiStyleMinutes(text))) {
      return { segments: byOrder, method: "summary_sections" };
    }
  }

  // 2) 讨论顺序 + 名称锚点 → 连续整段切分（不打散）
  const sequential = sequentialPartitionByDiscussOrder(text, orderPartners);
  if (sequential && countPartnersWithText(sequential) >= 2) {
    return { segments: sequential, method: "sequential" };
  }

  // 3) AI：强制按讨论顺序整段切
  const aiSegments = await aiMatchMinutesToPartners(meeting, userId);
  if (aiSegments && countPartnersWithText(aiSegments) > 0) {
    return { segments: aiSegments, method: "ai" };
  }

  // 4) 名称关键词（易打散，仅兜底）
  const heur = heuristicMatchByPartnerName(text, meeting.items);
  if (countPartnersWithText(heur) > 0) {
    return { segments: heur, method: "name" };
  }

  // 5) 时间轴仅最后兜底
  const timeSegments = computeTranscriptSegments(meeting);
  if (isUsableTimelineFallback(timeSegments, partnerIds, markedCount)) {
    return { segments: timeSegments, method: "timeline_fallback" };
  }

  if (aiSegments?.length) {
    return { segments: aiSegments, method: "ai_fallback" };
  }

  return {
    segments: [
      { partnerId: null, partnerName: null, text },
      ...meeting.items.map((it) => ({
        partnerId: it.partnerId,
        partnerName: it.partner.name,
        text: "",
      })),
    ],
    method: "unassigned",
  };
}
