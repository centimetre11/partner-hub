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
      const marked = marker ? "会中已点过" : "议程上但未点过";
      const orderHint = discussed.findIndex((d) => d.partnerId === it.partnerId);
      const order =
        orderHint >= 0 ? `讨论顺序第 ${orderHint + 1}` : "未出现在讨论顺序";
      return `${idx + 1}. partnerId=${it.partnerId} 名称「${it.partner.name}」· ${marked} · ${order}`;
    })
    .join("\n");

  const orderList = discussed.length
    ? discussed.map((it, i) => `${i + 1}. 「${it.partner.name}」(partnerId=${it.partnerId})`).join("\n")
    : [...meeting.items]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((it, i) => `${i + 1}. 「${it.partner.name}」(partnerId=${it.partnerId})`)
        .join("\n");

  try {
    const ai = await chatJson<{
      segments?: { partnerId?: string; text?: string }[];
      unassigned?: string;
    }>(
      `你是过伙伴会议记录助手。用户粘贴的是本场「过伙伴」会议的腾讯纪要（智能纪要或「发言人 N HH:MM:SS」逐字稿）。

【最重要】
1. 这份纪要讨论的对象，一定是议程上的这些伙伴（封闭集合）。几乎所有实质内容都应归属到某位议程伙伴，不要轻易丢进 unassigned。
2. 纪要里的时间戳（00:mm:ss）与系统「开始开会 / 点伙伴」时间往往对不齐（录音与开会不同步），只能作极弱参考，禁止按绝对时间硬切。
3. 主要依据：伙伴名称/简称/国家/项目语义 + 「讨论顺序」（谁先过、谁后过）判断话题段落属于谁。
4. 可用讨论顺序猜测结构（先过的伙伴对应纪要前段话题，后过的对应后段），但若语义明显指向另一位伙伴，以语义为准。
5. 每位议程伙伴都要有一条 segments；该伙伴确实未出现则 text 为空字符串。
6. 不要编造原文没有的事实；可去掉纯寒暄。

只输出 JSON：
{"segments":[{"partnerId":"...","text":"..."}],"unassigned":"仅开场寒暄/无法判断的串场（尽量短）"}`,
      `讨论顺序（软提示，非时间戳）：\n${orderList}\n\n议程伙伴（封闭集合，内容必属其中）：\n${agenda}\n\n---\n纪要全文：\n${text.slice(0, 28000)}`,
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
      return "已按时间戳弱参考匹配（请核对）";
    case "summary_sections":
      return "已按「小结」与讨论顺序匹配";
    case "ai":
      return "已按议程伙伴与讨论顺序语义拆分";
    case "name":
      return "已按伙伴名称关键词匹配";
    case "timeline_fallback":
      return "时间戳弱参考（开会与录音可能不同步），请核对";
    case "ai_fallback":
      return "AI 按议程伙伴拆分完成，请核对";
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
 * - 讨论顺序（谁先点、谁后点）是软结构提示
 * - 时间戳只能弱参考：开会打点 ≠ 腾讯录音起点，禁止硬对齐时间轴
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

  // 1) 智能纪要「小结」编号 ↔ 讨论顺序（不依赖绝对时间戳）
  const byOrder = matchSectionsByMarkerOrder(text, meeting.items, meeting.startedAt);
  if (byOrder) {
    const orderWithText = countPartnersWithText(byOrder);
    const expect = Math.max(2, Math.min(markedCount || meeting.items.length, 3));
    if (orderWithText >= expect || (orderWithText >= 2 && isAiStyleMinutes(text))) {
      return { segments: byOrder, method: "summary_sections" };
    }
  }

  // 2) AI：议程封闭集合 + 讨论顺序语义（主路径）
  const aiSegments = await aiMatchMinutesToPartners(meeting, userId);
  if (aiSegments && countPartnersWithText(aiSegments) > 0) {
    return { segments: aiSegments, method: "ai" };
  }

  // 3) 名称关键词
  const heur = heuristicMatchByPartnerName(text, meeting.items);
  if (countPartnersWithText(heur) > 0) {
    return { segments: heur, method: "name" };
  }

  // 4) 时间轴仅最后兜底，且要求能拆到多家
  const timeSegments = computeTranscriptSegments(meeting);
  if (isUsableTimelineFallback(timeSegments, partnerIds, markedCount)) {
    return { segments: timeSegments, method: "timeline_fallback" };
  }

  if (aiSegments?.length) {
    return { segments: aiSegments, method: "ai_fallback" };
  }

  // 封闭集合兜底：全文先挂到「未归属」，避免误绑到单一伙伴
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
