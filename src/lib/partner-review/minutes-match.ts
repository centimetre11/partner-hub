import "server-only";

import type { PartnerReviewMeeting, PartnerReviewItem, Partner } from "@prisma/client";
import { chatJson } from "../ai";
import type { TranscriptSegment } from "./markers";
import { computeTranscriptSegments } from "./segment";
import {
  parseTimedTranscriptDoc,
  parseTranscriptTextToTimedDoc,
  type TimedTranscriptDoc,
  type TranscriptSentence,
} from "./transcript";

type MeetingWithItems = PartnerReviewMeeting & {
  items: (PartnerReviewItem & { partner: Pick<Partner, "id" | "name"> })[];
};

export type MarkerDurationSlot = {
  partnerId: string;
  partnerName: string;
  /** 相邻打点间隔（末位用结束时间或中位估计） */
  durationMs: number;
  markerAtMs: number;
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
  // 含括号简称：Industrial … (IICS) → 也能匹配文中的 IICS / global com
  for (const part of name.split(/[\s,/|()]+/).filter((x) => x.length >= 3)) {
    const i = lower.indexOf(part.toLowerCase());
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

function lineStartAt(text: string, index: number): number {
  if (index <= 0) return 0;
  const prev = text.lastIndexOf("\n", index - 1);
  return prev < 0 ? 0 : prev + 1;
}

/**
 * 主持人换话题口令：Okay next / Next is / 接下来 / 下一个 …
 * 过伙伴会议里这类句子几乎就是下一位伙伴的切点。
 */
const TOPIC_TRANSITION_RE =
  /(?:okay[,.]?\s+|alright[,.]?\s+|all\s+right[,.]?\s+|so[,.]?\s+|well[,.]?\s+|right[,.]?\s+|好的?[，,.\s]+|嗯[，,.\s]+|好[，,.\s]+)?(?:next(?:\s+is|\s+up|\s*:)?|moving\s+on(?:\s+to)?|let'?s\s+(?:move|go|look)\s+(?:on\s+)?(?:to\s+)?|接下来(?:是|看|讨论|过)?|下一个(?:是|伙伴|客户|公司)?|下一位|下面(?:一个|是|看|过)?|下一(?:家|个伙伴)?)/gi;

function isFalsePositiveTransition(ctx: string): boolean {
  const s = ctx.toLowerCase();
  if (/\bnext\s+(week|year|time|month|day|steps?|level|phase|quarter|sprint)\b/.test(s)) {
    return true;
  }
  if (/下一次|下一周|下一年|下个月|下一步|下一阶段/.test(ctx)) return true;
  return false;
}

/** 全文中话题切换口令的行首位置（已去重、滤误报） */
export function findTopicTransitionOffsets(text: string): number[] {
  const re = new RegExp(TOPIC_TRANSITION_RE.source, "gi");
  const raw: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const ctx = text.slice(m.index, m.index + 96);
    if (isFalsePositiveTransition(ctx)) continue;
    raw.push(lineStartAt(text, m.index));
  }
  const deduped: number[] = [];
  for (const at of raw) {
    if (!deduped.length || at - deduped[deduped.length - 1]! > 40) deduped.push(at);
  }
  return deduped;
}

/** 在 searchFrom 之后，找「切换口令 + 附近出现伙伴名」的切点（优先口令行首） */
function findTransitionCutForPartner(
  text: string,
  searchFrom: number,
  partnerName: string,
  windowAfterCue = 280,
): number {
  const transitions = findTopicTransitionOffsets(text).filter((at) => at >= searchFrom);
  for (const at of transitions) {
    const after = text.slice(at, at + windowAfterCue);
    if (findNameOffset(after, partnerName) >= 0) return at;
  }
  return -1;
}

function formatDurationHint(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}分${s.toString().padStart(2, "0")}秒` : `${s}秒`;
}

/**
 * 会中打点间隔 → 每位伙伴讨论时长。
 * 绝对时刻可能对不上录音，但间隔（讲了多久）通常准。
 */
export function buildMarkerDurationSlots(meeting: MeetingWithItems): MarkerDurationSlot[] | null {
  const marked = markedItems(meeting);
  if (marked.length < 2) return null;

  const slots: MarkerDurationSlot[] = [];
  for (let i = 0; i < marked.length; i++) {
    const item = marked[i]!;
    const cur = (item.markerInsertedAt ?? item.discussedAt)!.getTime();
    let durationMs: number;
    if (i + 1 < marked.length) {
      const next = (marked[i + 1]!.markerInsertedAt ?? marked[i + 1]!.discussedAt)!.getTime();
      durationMs = next - cur;
    } else if (meeting.endedAt && meeting.endedAt.getTime() > cur) {
      durationMs = meeting.endedAt.getTime() - cur;
    } else {
      const priors = slots.map((s) => s.durationMs).filter((d) => d >= 30_000);
      const sorted = [...priors].sort((a, b) => a - b);
      durationMs = sorted.length
        ? sorted[Math.floor(sorted.length / 2)]!
        : 3 * 60_000;
    }
    // 误点连点会极短；仍保留下限，避免完全吞掉
    durationMs = Math.max(20_000, durationMs);
    slots.push({
      partnerId: item.partnerId,
      partnerName: item.partner.name,
      durationMs,
      markerAtMs: cur,
    });
  }
  return slots;
}

function sentenceRelMs(
  sentence: TranscriptSentence,
  doc: TimedTranscriptDoc,
  recordingStartedAt: Date | null,
): number | null {
  const t = sentence.startTime;
  if (!Number.isFinite(t)) return null;
  if (doc.timeBase === "relative_ms" || t < 1e12) {
    return t > 0 && t < 1e7 ? Math.round(t * 1000) : Math.round(t);
  }
  if (recordingStartedAt) return t - recordingStartedAt.getTime();
  return null;
}

/** 在 approx 附近吸附到换话题口令 / 下一位伙伴名（缩小切点误差） */
function snapCutNear(
  text: string,
  approx: number,
  nextPartnerName: string,
  radiusChars: number,
): number {
  const lo = Math.max(0, approx - radiusChars);
  const hi = Math.min(text.length, approx + radiusChars);
  if (hi <= lo) return Math.max(0, Math.min(text.length, approx));

  const slice = text.slice(lo, hi);
  const localTransitions = findTopicTransitionOffsets(slice).map((at) => lo + at);
  let best = -1;
  let bestScore = -1;
  for (const at of localTransitions) {
    const after = text.slice(at, at + 280);
    const named = findNameOffset(after, nextPartnerName) >= 0;
    const dist = Math.abs(at - approx);
    const score = (named ? 10_000 : 0) - dist;
    if (score > bestScore) {
      bestScore = score;
      best = at;
    }
  }
  if (best >= 0) return best;

  const nameRel = findNameOffset(slice, nextPartnerName);
  if (nameRel >= 0) return lineStartAt(text, lo + nameRel);

  return lineStartAt(text, approx);
}

/**
 * 按打点时长从录音/纪要【尾部向前】切段。
 * 中途才开录时，前面缺失不影响后半场伙伴的时长对齐；第一位可能被截短。
 */
export function partitionByMarkerDurations(
  meeting: MeetingWithItems,
  text: string,
): TranscriptSegment[] | null {
  const slots = buildMarkerDurationSlots(meeting);
  if (!slots || slots.length < 2) return null;

  const raw = text.trim();
  if (!raw) return null;

  const anchor = meeting.startedAt ?? meeting.recordingStartedAt;
  const timed =
    parseTimedTranscriptDoc(meeting.transcriptJson) ??
    parseTranscriptTextToTimedDoc(raw, { recordingStartedAt: anchor });

  if (timed?.sentences?.length) {
    const withTime = timed.sentences
      .map((s) => {
        const atMs = sentenceRelMs(s, timed, anchor);
        const line = s.speaker ? `${s.speaker}: ${s.text}` : s.text;
        return { atMs, line: line.trim() };
      })
      .filter((s): s is { atMs: number; line: string } => s.atMs != null && !!s.line);

    if (withTime.length >= 4) {
      const tMin = Math.min(...withTime.map((s) => s.atMs));
      const tMax = Math.max(...withTime.map((s) => s.atMs));
      // 每个句子在全文中的字符起点（用于吸附换话题）
      let built = "";
      const sentenceCharAt: { atMs: number; charAt: number; line: string }[] = [];
      for (const s of withTime) {
        const charAt = built.length;
        sentenceCharAt.push({ atMs: s.atMs, charAt, line: s.line });
        built += (built ? "\n" : "") + s.line;
      }
      const corpus = built;

      type Range = { partnerId: string; partnerName: string; t0: number; t1: number };
      const ranges: Range[] = [];
      let cursor = tMax + 1;
      for (let i = slots.length - 1; i >= 0; i--) {
        const slot = slots[i]!;
        if (i === 0) {
          ranges.push({
            partnerId: slot.partnerId,
            partnerName: slot.partnerName,
            t0: tMin,
            t1: cursor,
          });
        } else {
          const t0 = Math.max(tMin, cursor - slot.durationMs);
          ranges.push({
            partnerId: slot.partnerId,
            partnerName: slot.partnerName,
            t0,
            t1: cursor,
          });
          cursor = t0;
          if (cursor <= tMin + 500) {
            for (let j = i - 1; j >= 0; j--) {
              const earlier = slots[j]!;
              ranges.push({
                partnerId: earlier.partnerId,
                partnerName: earlier.partnerName,
                t0: tMin,
                t1: tMin,
              });
            }
            break;
          }
        }
      }
      ranges.reverse();

      // 边界吸附：用 next/名称在邻域内收紧切点（映射到最近句子时间）
      for (let i = 1; i < ranges.length; i++) {
        const prev = ranges[i - 1]!;
        const cur = ranges[i]!;
        if (cur.t1 <= cur.t0) continue;
        const approxSentence = sentenceCharAt.reduce((best, s) => {
          const d = Math.abs(s.atMs - cur.t0);
          if (!best || d < best.d) return { d, s };
          return best;
        }, null as null | { d: number; s: (typeof sentenceCharAt)[number] });
        if (!approxSentence) continue;
        const snappedChar = snapCutNear(
          corpus,
          approxSentence.s.charAt,
          cur.partnerName,
          900,
        );
        const snappedSentence = sentenceCharAt.reduce((best, s) => {
          const d = Math.abs(s.charAt - snappedChar);
          if (!best || d < best.d) return { d, s };
          return best;
        }, null as null | { d: number; s: (typeof sentenceCharAt)[number] });
        if (!snappedSentence) continue;
        const cutT = snappedSentence.s.atMs;
        if (cutT > prev.t0 + 5_000 && cutT < cur.t1 - 5_000) {
          prev.t1 = cutT;
          cur.t0 = cutT;
        }
      }

      const buckets = new Map<string, string[]>();
      const unassigned: string[] = [];
      for (const s of slots) buckets.set(s.partnerId, []);

      for (const sent of withTime) {
        let owner: Range | null = null;
        for (const r of ranges) {
          if (r.t1 <= r.t0) continue;
          if (sent.atMs >= r.t0 && sent.atMs < r.t1) {
            owner = r;
            break;
          }
        }
        if (!owner) {
          // 落在空窗或缝隙：归最近有内容的段，优先后一段
          const next = ranges.find((r) => r.t0 > sent.atMs && r.t1 > r.t0);
          const prev = [...ranges].reverse().find((r) => r.t1 <= sent.atMs && r.t1 > r.t0);
          owner = next ?? prev ?? null;
        }
        if (!owner) unassigned.push(sent.line);
        else buckets.get(owner.partnerId)?.push(sent.line);
      }

      const segments: TranscriptSegment[] = [];
      if (unassigned.length) {
        segments.push({ partnerId: null, partnerName: null, text: unassigned.join("\n") });
      }
      for (const slot of slots) {
        segments.push({
          partnerId: slot.partnerId,
          partnerName: slot.partnerName,
          text: (buckets.get(slot.partnerId) ?? []).join("\n"),
        });
      }
      for (const item of meeting.items) {
        if (!segments.some((s) => s.partnerId === item.partnerId)) {
          segments.push({
            partnerId: item.partnerId,
            partnerName: item.partner.name,
            text: "",
          });
        }
      }
      if (countPartnersWithText(segments) >= 2) return segments;
    }
  }

  // 无可靠时间轴：按时长比例从文末向前切字符（仍保留相对长短）
  const totalDur = slots.reduce((a, s) => a + s.durationMs, 0) || 1;
  const cuts: number[] = [raw.length];
  let cursor = raw.length;
  for (let i = slots.length - 1; i >= 1; i--) {
    const share = slots[i]!.durationMs / totalDur;
    const take = Math.max(80, Math.round(raw.length * share));
    cursor = Math.max(0, cursor - take);
    cuts.push(cursor);
  }
  cuts.push(0);
  cuts.reverse();

  const charBounds = cuts.map((c, i) => {
    if (i === 0) return 0;
    if (i >= slots.length) return raw.length;
    return snapCutNear(raw, c, slots[i]!.partnerName, Math.round(raw.length * 0.04) + 200);
  });
  // 单调
  for (let i = 1; i < charBounds.length; i++) {
    if (charBounds[i]! < charBounds[i - 1]!) charBounds[i] = charBounds[i - 1]!;
  }

  const segments: TranscriptSegment[] = [];
  // 文首开场：若第一位伙伴名出现较晚，之前归未归属
  const firstNameAt = findNameOffset(raw, slots[0]!.partnerName);
  let start0 = 0;
  if (firstNameAt > 40 && firstNameAt < (charBounds[1] ?? raw.length) * 0.5) {
    const headText = raw.slice(0, firstNameAt).trim();
    if (headText) {
      segments.push({ partnerId: null, partnerName: null, text: headText });
      start0 = firstNameAt;
    }
  }

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const from = i === 0 ? start0 : charBounds[i]!;
    const to = i + 1 < slots.length ? charBounds[i + 1]! : raw.length;
    segments.push({
      partnerId: slot.partnerId,
      partnerName: slot.partnerName,
      text: raw.slice(from, to).trim(),
    });
  }
  for (const item of meeting.items) {
    if (!segments.some((s) => s.partnerId === item.partnerId)) {
      segments.push({
        partnerId: item.partnerId,
        partnerName: item.partner.name,
        text: "",
      });
    }
  }
  return countPartnersWithText(segments) >= 2 ? segments : null;
}

/** 按时长比例估计第 i 位伙伴在全文中的大致起点（仅作 next 搜索的邻域提示） */
function approxCharStartFromDurations(
  textLen: number,
  slots: MarkerDurationSlot[],
  partnerIndex: number,
): number | null {
  if (partnerIndex <= 0 || partnerIndex >= slots.length || textLen <= 0) return null;
  const total = slots.reduce((a, s) => a + s.durationMs, 0);
  if (total <= 0) return null;
  let cum = 0;
  for (let i = 0; i < partnerIndex; i++) cum += slots[i]!.durationMs;
  return Math.round((cum / total) * textLen);
}

/**
 * 在 searchFrom 之后选换话题切点：优先「口令+点名」；
 * 若有时长邻域，优先靠近邻域的 next（时长只缩小范围，不硬切）。
 */
function pickTransitionCut(
  text: string,
  searchFrom: number,
  partnerName: string,
  preferNear: number | null,
): number {
  const transitions = findTopicTransitionOffsets(text).filter((at) => at >= searchFrom);
  if (!transitions.length) return -1;

  let bestNamed = -1;
  let bestNamedScore = -Infinity;
  let bestNear = -1;
  let bestNearScore = -Infinity;

  for (const at of transitions) {
    const after = text.slice(at, at + 280);
    const named = findNameOffset(after, partnerName) >= 0;
    const dist = preferNear != null ? Math.abs(at - preferNear) : 0;
    if (named) {
      const score = 20_000 - dist;
      if (score > bestNamedScore) {
        bestNamedScore = score;
        bestNamed = at;
      }
    }
    if (preferNear != null) {
      // 邻域外的无名 next 不抢；邻域内可作弱候选
      const radius = Math.max(800, Math.round(text.length * 0.06));
      if (dist <= radius) {
        const score = 5_000 - dist;
        if (score > bestNearScore) {
          bestNearScore = score;
          bestNear = at;
        }
      }
    }
  }

  if (bestNamed >= 0) return bestNamed;
  if (bestNear >= 0) return bestNear;
  return -1;
}

/**
 * 按讨论顺序切成连续整段。
 * 切点主依据：主持人 next/下一个（可带伙伴名）；时长比例仅缩小搜索邻域。
 */
export function sequentialPartitionByDiscussOrder(
  text: string,
  ordered: { partnerId: string; partnerName: string }[],
  durationSlots?: MarkerDurationSlot[] | null,
): TranscriptSegment[] | null {
  const raw = text.trim();
  if (!raw || ordered.length < 2) return null;

  const slotsForOrder =
    durationSlots &&
    durationSlots.length >= 2 &&
    durationSlots.every((s, i) => ordered[i] && s.partnerId === ordered[i]!.partnerId)
      ? durationSlots
      : null;

  type Anchor = { at: number; partnerId: string; partnerName: string };
  const anchors: Anchor[] = [];
  let searchFrom = 0;
  const transitions = findTopicTransitionOffsets(raw);
  let transitionCursor = 0;

  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i]!;
    let at = -1;
    const preferNear = slotsForOrder
      ? approxCharStartFromDurations(raw.length, slotsForOrder, i)
      : null;

    if (i === 0) {
      // 第一位：名称锚点；若名称在开场很后，仍可用名称，开场归未归属
      at = findNameOffset(raw, p.partnerName);
      if (at < 0) at = 0;
    } else {
      // 1) next/换话题（时长邻域加权）
      at = pickTransitionCut(raw, searchFrom, p.partnerName, preferNear);
      // 2) 按讨论顺序对齐第 N 次「next」（无点名时）
      if (at < 0) {
        while (
          transitionCursor < transitions.length &&
          transitions[transitionCursor]! < searchFrom
        ) {
          transitionCursor += 1;
        }
        if (transitionCursor < transitions.length) {
          // 若有时长邻域，在剩余 next 里挑最近的
          if (preferNear != null) {
            let best = transitions[transitionCursor]!;
            let bestDist = Math.abs(best - preferNear);
            for (let k = transitionCursor; k < transitions.length; k++) {
              const t = transitions[k]!;
              const d = Math.abs(t - preferNear);
              if (d < bestDist) {
                bestDist = d;
                best = t;
                transitionCursor = k;
              }
            }
            at = best;
            transitionCursor += 1;
          } else {
            at = transitions[transitionCursor]!;
            transitionCursor += 1;
          }
        }
      } else {
        while (
          transitionCursor < transitions.length &&
          transitions[transitionCursor]! <= at
        ) {
          transitionCursor += 1;
        }
      }
      // 3) 名称首次出现（可偏向时长邻域）
      if (at < 0) {
        if (preferNear != null) {
          const lo = Math.max(searchFrom, preferNear - Math.round(raw.length * 0.08));
          const hi = Math.min(raw.length, preferNear + Math.round(raw.length * 0.08));
          const rel = findNameOffset(raw.slice(lo, hi), p.partnerName);
          if (rel >= 0) at = lo + rel;
        }
        if (at < 0) {
          const rel = findNameOffset(raw.slice(searchFrom), p.partnerName);
          if (rel >= 0) at = searchFrom + rel;
        }
      }
    }

    if (at < 0) continue;
    if (anchors.length && at <= anchors[anchors.length - 1]!.at) continue;
    anchors.push({ at, partnerId: p.partnerId, partnerName: p.partnerName });
    searchFrom = at + 1;
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

  const durationSlots = buildMarkerDurationSlots(meeting);
  const durationHint = durationSlots
    ? durationSlots
        .map(
          (s, i) =>
            `${i + 1}. 「${s.partnerName}」约讨论 ${formatDurationHint(s.durationMs)}（会中打点间隔，相对长短可信；绝对时刻可能对不上录音）`,
        )
        .join("\n")
    : "（无足够打点，无法估计讨论时长）";

  try {
    const ai = await chatJson<{
      segments?: { partnerId?: string; text?: string }[];
      unassigned?: string;
    }>(
      `你是过伙伴会议记录助手。用户粘贴的是本场「过伙伴」会议纪要（智能纪要或发言人逐字稿）。

【核心假设 — 必须遵守】
过伙伴会议大概率是【顺序整段】进行的：先完整讨论伙伴 A，再完整讨论伙伴 B，再 C……
请把全文切成若干【连续、互不交叉】的整段，按「讨论顺序」依次归属。

【最强切点信号 — 必须以此为主】
主持人换话题时常说（中英皆可），这类句子几乎就是下一位伙伴的起点，请优先在此切开：
- "Okay, next …" / "Next is …" / "Next up …" / "Alright, next …"
- "Moving on to …" / "Let's move to …"
- 「接下来」「下一个」「下一位」「下面是」「好，下一个」
例："Okay, next global com, Jackie." → 从这句起归下一位（Global Com），前面整段仍归上一位。
注意：next week / next steps / 下一步 / 下一次 等不是换伙伴，不要当切点。

【讨论时长（弱辅助）】
会中打点的绝对时刻常对不上录音，但「讲了多久」可帮助在多个 next 候选里选更合理的那个；不要按时长比例硬切而丢掉 next 口令。

规则：
1. 纪要对象是议程伙伴封闭集合；实质内容尽量都挂到某位伙伴。
2. 禁止按偶发提到的名字把内容打散到多段；后半场话题不要塞给前面的伙伴。
3. 禁止按绝对时间戳硬切。
4. 切段依据优先级：换话题口令（next/下一个）> 讨论顺序 > 伙伴名；时长仅辅助消歧。
5. 切点从换话题那句开始归新伙伴（口令句本身归下一段）。
6. 每位议程伙伴都要有一条 segments（未讨论则 text 为空）。
7. 不要编造；开场寒暄可放 unassigned。

只输出 JSON：
{"segments":[{"partnerId":"...","text":"..."}],"unassigned":"开场寒暄（尽量短）"}`,
      `讨论顺序（从前到后）：\n${orderList}\n\n各伙伴讨论时长（仅辅助，勿硬切）：\n${durationHint}\n\n议程伙伴：\n${agenda}\n\n请以 next/下一个 换话题句为主切段。\n\n---\n纪要全文：\n${text.slice(0, 28000)}`,
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
    case "duration":
      return "已按会中打点讨论时长（从后向前对齐）整段切分，请核对切点";
    case "sequential":
      return "已按讨论顺序整段切分（重点对齐 next/下一个 换话题），请核对切点";
    case "ai":
      return "已按讨论顺序+时长比例+换话题口令整段切分，请核对切点";
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
 * - 会议大概率按讨论顺序【整段连续】进行
 * - 切点主依据：next/下一个 等换话题口令
 * - 打点间隔（讨论时长）只作邻域提示，禁止单独硬切抢主路径
 */
export async function matchMinutesToPartners(
  meeting: MeetingWithItems,
  userId?: string,
): Promise<{ segments: TranscriptSegment[]; method: string }> {
  const text = meeting.transcriptText?.trim() ?? "";
  const partnerIds = meeting.items.map((it) => it.partnerId);
  const markedCount = markedItems(meeting).length;
  const orderPartners = discussOrderPartners(meeting);
  const durationSlots = buildMarkerDurationSlots(meeting);

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

  // 2) 主路径：next/换话题整段切分；时长仅缩小搜索邻域
  const sequential = sequentialPartitionByDiscussOrder(text, orderPartners, durationSlots);
  if (sequential && countPartnersWithText(sequential) >= 2) {
    return { segments: sequential, method: "sequential" };
  }

  // 3) 时长硬切仅兜底，且要求覆盖大多数已打点伙伴（避免中间大片「暂无内容」）
  const byDuration = partitionByMarkerDurations(meeting, text);
  const durationFilled = byDuration ? countPartnersWithText(byDuration) : 0;
  const durationMin = Math.max(3, Math.ceil((markedCount || orderPartners.length) * 0.6));
  if (byDuration && durationFilled >= durationMin) {
    return { segments: byDuration, method: "duration" };
  }

  // 4) AI：讨论顺序 + 换话题口令（时长作提示）
  const aiSegments = await aiMatchMinutesToPartners(meeting, userId);
  if (aiSegments && countPartnersWithText(aiSegments) > 0) {
    return { segments: aiSegments, method: "ai" };
  }

  // 5) 名称关键词（易打散，仅兜底）
  const heur = heuristicMatchByPartnerName(text, meeting.items);
  if (countPartnersWithText(heur) > 0) {
    return { segments: heur, method: "name" };
  }

  // 6) 绝对时间轴仅最后兜底（易因开录偏移失效）
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
