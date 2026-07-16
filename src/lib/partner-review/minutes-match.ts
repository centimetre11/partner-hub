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

export type MarkerDurationSpan = {
  partnerId: string;
  partnerName: string;
  /** 该伙伴讨论时长（相邻打点间隔）；绝对时钟可对不齐，间隔可信 */
  durationMs: number;
};

/** 由会中打点间隔得到各伙伴讨论时长（忽略与录音的绝对对齐） */
export function buildMarkerDurationPlan(meeting: MeetingWithItems): MarkerDurationSpan[] | null {
  const marked = markedItems(meeting);
  if (marked.length < 2) return null;

  const times = marked.map((it) => (it.markerInsertedAt ?? it.discussedAt)!.getTime());
  const gaps: number[] = [];
  for (let i = 0; i < times.length - 1; i++) {
    gaps.push(Math.max(5_000, times[i + 1]! - times[i]!));
  }
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const median = sortedGaps[Math.floor(sortedGaps.length / 2)] ?? 120_000;

  let lastDur: number;
  if (meeting.endedAt) {
    lastDur = Math.max(5_000, meeting.endedAt.getTime() - times[times.length - 1]!);
    // 结束会议忘点时会拉很长，封顶避免末段吞掉全文
    lastDur = Math.min(lastDur, Math.max(median * 3, 10 * 60_000));
  } else {
    lastDur = median;
  }

  return marked.map((it, i) => ({
    partnerId: it.partnerId,
    partnerName: it.partner.name,
    durationMs: i < gaps.length ? gaps[i]! : lastDur,
  }));
}

function formatDurationHint(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}分${s}秒` : `${m}分钟`;
}

/** 在 [lo,hi) 内找最像「下一位伙伴起点」的切点 */
function findBestCutInWindow(text: string, lo: number, hi: number, partnerName: string): number {
  const start = Math.max(0, Math.min(lo, hi));
  const end = Math.min(text.length, Math.max(lo, hi));
  if (end - start < 8) return -1;
  const slice = text.slice(start, end);
  const localTransitions = findTopicTransitionOffsets(slice).map((at) => start + at);

  for (const at of localTransitions) {
    const after = text.slice(at, Math.min(text.length, at + 280));
    if (findNameOffset(after, partnerName) >= 0) return at;
  }
  if (localTransitions.length) {
    const mid = (start + end) / 2;
    localTransitions.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    return localTransitions[0]!;
  }
  const nameRel = findNameOffset(slice, partnerName);
  if (nameRel >= 0) return lineStartAt(text, start + nameRel);
  return -1;
}

/**
 * 用打点间隔（讨论时长）按比例收窄切点，再在窗口内对齐 next/名字。
 * 绝对时间可能对不齐（忘开录、中途开录），但伙伴间时长比例可信；第一位起点放宽。
 */
export function sequentialPartitionByMarkerDurations(
  text: string,
  meeting: MeetingWithItems,
): TranscriptSegment[] | null {
  const plan = buildMarkerDurationPlan(meeting);
  const raw = text.trim();
  if (!plan || plan.length < 2 || !raw) return null;

  const totalDur = plan.reduce((s, p) => s + p.durationMs, 0);
  if (totalDur <= 0) return null;

  // 期望切点：按时长比例落在全文；第一刀窗口更宽（开录偏差）
  const expectedCuts: number[] = [0];
  let acc = 0;
  for (let i = 0; i < plan.length - 1; i++) {
    acc += plan[i]!.durationMs;
    expectedCuts.push(Math.round((acc / totalDur) * raw.length));
  }

  type Anchor = { at: number; partnerId: string; partnerName: string };
  const anchors: Anchor[] = [
    { at: 0, partnerId: plan[0]!.partnerId, partnerName: plan[0]!.partnerName },
  ];

  for (let i = 1; i < plan.length; i++) {
    const p = plan[i]!;
    const expected = expectedCuts[i]!;
    // 第一刀（P1→P2）窗口更大；后续按相邻时长收窄
    const frac = i === 1 ? 0.16 : 0.07;
    const neighborMs = Math.min(plan[i - 1]!.durationMs, p.durationMs);
    const neighborFrac = Math.min(0.12, neighborMs / totalDur);
    const window = Math.max(
      400,
      Math.round(raw.length * Math.max(frac, neighborFrac)),
    );
    const lo = Math.max(anchors[i - 1]!.at + 20, expected - window);
    const hi = Math.min(raw.length, expected + window);

    let at = findBestCutInWindow(raw, lo, hi, p.partnerName);
    if (at < 0) {
      // 窗口外再弱扩一圈找 next+名
      const loose = findBestCutInWindow(
        raw,
        Math.max(anchors[i - 1]!.at + 20, expected - window * 2),
        Math.min(raw.length, expected + window * 2),
        p.partnerName,
      );
      at = loose >= 0 ? loose : expected;
    }
    if (at <= anchors[i - 1]!.at) at = Math.min(raw.length - 1, anchors[i - 1]!.at + 40);
    anchors.push({ at, partnerId: p.partnerId, partnerName: p.partnerName });
  }

  // 第一位起点软处理：若开场很长且中段才出现其名字，开场归未归属
  // （中途开录时前缀可能是别的内容；有名字则从名字附近起算）
  const firstEnd = anchors[1]?.at ?? raw.length;
  const firstNameAt = findNameOffset(raw.slice(0, firstEnd), plan[0]!.partnerName);
  if (firstNameAt > Math.min(500, Math.floor(firstEnd * 0.25))) {
    anchors[0] = {
      at: lineStartAt(raw, firstNameAt),
      partnerId: plan[0]!.partnerId,
      partnerName: plan[0]!.partnerName,
    };
  }

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

  for (const p of plan) {
    if (!segments.some((s) => s.partnerId === p.partnerId)) {
      segments.push({ partnerId: p.partnerId, partnerName: p.partnerName, text: "" });
    }
  }
  for (const it of meeting.items) {
    if (!segments.some((s) => s.partnerId === it.partnerId)) {
      segments.push({ partnerId: it.partnerId, partnerName: it.partner.name, text: "" });
    }
  }

  return segments;
}

/**
 * 按讨论顺序切成连续整段。
 * 切点优先：主持人 next/下一个 等换话题口令（常带上下一位伙伴名）→ 伙伴名首次出现。
 */
export function sequentialPartitionByDiscussOrder(
  text: string,
  ordered: { partnerId: string; partnerName: string }[],
): TranscriptSegment[] | null {
  const raw = text.trim();
  if (!raw || ordered.length < 2) return null;

  type Anchor = { at: number; partnerId: string; partnerName: string };
  const anchors: Anchor[] = [];
  let searchFrom = 0;
  const transitions = findTopicTransitionOffsets(raw);
  let transitionCursor = 0;

  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i]!;
    let at = -1;

    if (i === 0) {
      // 第一位：名称锚点；若名称在开场很后，仍可用名称，开场归未归属
      at = findNameOffset(raw, p.partnerName);
      if (at < 0) at = 0;
    } else {
      // 1) 切换口令附近点名该伙伴（最强）
      at = findTransitionCutForPartner(raw, searchFrom, p.partnerName);
      // 2) 按讨论顺序对齐第 N 次「next」（无点名时仍可用）
      if (at < 0) {
        while (
          transitionCursor < transitions.length &&
          transitions[transitionCursor]! < searchFrom
        ) {
          transitionCursor += 1;
        }
        if (transitionCursor < transitions.length) {
          at = transitions[transitionCursor]!;
          transitionCursor += 1;
        }
      } else {
        // 已用到的口令推进游标，避免下一位重复占用
        while (
          transitionCursor < transitions.length &&
          transitions[transitionCursor]! <= at
        ) {
          transitionCursor += 1;
        }
      }
      // 3) 名称首次出现
      if (at < 0) {
        const rel = findNameOffset(raw.slice(searchFrom), p.partnerName);
        if (rel >= 0) at = searchFrom + rel;
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

  const durationPlan = buildMarkerDurationPlan(meeting);
  const durationTotalMs = durationPlan?.reduce((s, x) => s + x.durationMs, 0) ?? 0;
  const durationHint =
    durationPlan && durationTotalMs > 0
      ? durationPlan
          .map(
            (p, i) =>
              `${i + 1}. 「${p.partnerName}」约讨论 ${formatDurationHint(p.durationMs)}（占 ${Math.round((p.durationMs / durationTotalMs) * 100)}%）`,
          )
          .join("\n")
      : "";

  try {
    const ai = await chatJson<{
      segments?: { partnerId?: string; text?: string }[];
      unassigned?: string;
    }>(
      `你是过伙伴会议记录助手。用户粘贴的是本场「过伙伴」会议纪要（智能纪要或发言人逐字稿）。

【核心假设 — 必须遵守】
过伙伴会议大概率是【顺序整段】进行的：先完整讨论伙伴 A，再完整讨论伙伴 B，再 C……
请把全文切成若干【连续、互不交叉】的整段，按「讨论顺序」依次归属。

【最强切点信号 — 必须重点关注】
主持人换话题时常说（中英皆可），这类句子几乎就是下一位伙伴的起点，请优先在此切开：
- "Okay, next …" / "Next is …" / "Next up …" / "Alright, next …"
- "Moving on to …" / "Let's move to …"
- 「接下来」「下一个」「下一位」「下面是」「好，下一个」
例："Okay, next global com, Jackie." → 从这句起归下一位（Global Com），前面整段仍归上一位。
注意：next week / next steps / 下一步 / 下一次 等不是换伙伴，不要当切点。

【讨论时长比例 — 强约束】
会中每过一个伙伴会打点。打点的绝对时钟常与录音对不齐（忘开录、中途开录），
但【相邻打点的间隔 = 该伙伴讨论多久】是可信的。请按给出的时长比例分配各段篇幅：
谈得久的段落应明显更长。第一位伙伴的起点允许偏差（录音可能从中途开始），其后切点应尽量符合时长比例。

规则：
1. 纪要对象是议程伙伴封闭集合；实质内容尽量都挂到某位伙伴。
2. 禁止按偶发提到的名字把内容打散到多段；后半场话题不要塞给前面的伙伴。
3. 时间戳（00:mm:ss）禁止按绝对时间硬切；可用时长比例 + 换话题口令联合判断。
4. 切段依据优先级：换话题口令 > 讨论时长比例 > 讨论顺序 > 伙伴名。
5. 切点从换话题那句开始归新伙伴（口令句本身归下一段）。
6. 每位议程伙伴都要有一条 segments（未讨论则 text 为空）。
7. 不要编造；开场寒暄可放 unassigned。

只输出 JSON：
{"segments":[{"partnerId":"...","text":"..."}],"unassigned":"开场寒暄（尽量短）"}`,
      `讨论顺序（整段切分的主依据，从前到后）：\n${orderList}\n\n${
        durationHint
          ? `各伙伴讨论时长（来自会中打点间隔，请按比例切段）：\n${durationHint}\n\n`
          : ""
      }议程伙伴：\n${agenda}\n\n请特别扫描 next / 下一个，并结合时长比例对齐切段。\n\n---\n纪要全文：\n${text.slice(0, 28000)}`,
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
      return "已按打点讨论时长比例收窄切点（绝对时间可对不齐），请核对";
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
 * - 打点绝对时间常对不齐，但【打点间隔≈讨论时长】可信，用来收窄切点
 * - 第一位起点允许偏差（忘开录 / 中途开录）
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

  // 2) 打点讨论时长比例收窄切点 + 窗口内对齐 next/名字（优先于纯名称锚点）
  const byDuration = sequentialPartitionByMarkerDurations(text, meeting);
  if (byDuration && countPartnersWithText(byDuration) >= 2) {
    return { segments: byDuration, method: "duration" };
  }

  // 3) 讨论顺序 + 换话题/名称锚点 → 连续整段切分
  const sequential = sequentialPartitionByDiscussOrder(text, orderPartners);
  if (sequential && countPartnersWithText(sequential) >= 2) {
    return { segments: sequential, method: "sequential" };
  }

  // 4) AI：讨论顺序 + 时长比例 + 换话题口令
  const aiSegments = await aiMatchMinutesToPartners(meeting, userId);
  if (aiSegments && countPartnersWithText(aiSegments) > 0) {
    return { segments: aiSegments, method: "ai" };
  }

  // 5) 名称关键词（易打散，仅兜底）
  const heur = heuristicMatchByPartnerName(text, meeting.items);
  if (countPartnersWithText(heur) > 0) {
    return { segments: heur, method: "name" };
  }

  // 6) 时间轴仅最后兜底（绝对对齐常错）
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
