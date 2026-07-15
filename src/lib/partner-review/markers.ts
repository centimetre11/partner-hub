/** 会中讨论标记格式：<<<PARTNER:{id}|{name}>>> */
export const PARTNER_MARKER_RE = /<<<PARTNER:([^|>]+)\|([^>]+)>>>/g;

export function formatPartnerMarker(partnerId: string, partnerName: string): string {
  const safeName = partnerName.replace(/[<>|]/g, " ").trim() || partnerId;
  return `<<<PARTNER:${partnerId}|${safeName}>>>`;
}

export function formatDiscussStartLine(partnerName: string, at: Date = new Date()): string {
  const time = at.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const safeName = partnerName.replace(/\n/g, " ").trim() || "伙伴";
  return `[${time}] 开始过 ${safeName}`;
}

export type TranscriptSegment = {
  partnerId: string | null;
  partnerName: string | null;
  text: string;
};

/** 按标记把转写/侧栏文本拆成伙伴段落；无标记前缀归 unassigned */
export function splitTranscriptByMarkers(text: string): TranscriptSegment[] {
  const raw = text ?? "";
  if (!raw.trim()) return [];

  const matches = [...raw.matchAll(new RegExp(PARTNER_MARKER_RE.source, "g"))];
  if (!matches.length) {
    return [{ partnerId: null, partnerName: null, text: raw.trim() }];
  }

  const segments: TranscriptSegment[] = [];
  // 第一个标记之前
  const first = matches[0]!;
  const before = raw.slice(0, first.index).trim();
  if (before) {
    segments.push({ partnerId: null, partnerName: null, text: before });
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : raw.length;
    const body = raw.slice(start, end).trim();
    segments.push({
      partnerId: m[1]!.trim(),
      partnerName: m[2]!.trim(),
      text: body,
    });
  }

  return segments;
}

export function appendMarkerToNotes(
  liveNotes: string | null | undefined,
  marker: string,
  opts?: { partnerName?: string; at?: Date },
): string {
  const base = (liveNotes ?? "").trimEnd();
  if (base.includes(marker)) return base;
  const header =
    opts?.partnerName != null
      ? `${formatDiscussStartLine(opts.partnerName, opts.at ?? new Date())}\n${marker}`
      : marker;
  return base ? `${base}\n\n${header}\n` : `${header}\n`;
}

/** 将近实时识别的一段文字追加到记录本末尾（落在当前伙伴标记下方） */
export function appendLiveChunkToNotes(
  liveNotes: string | null | undefined,
  chunkText: string,
): string {
  const text = chunkText.trim();
  if (!text) return liveNotes ?? "";
  const base = (liveNotes ?? "").trimEnd();
  return base ? `${base}\n${text}` : text;
}

export type PartnerTimeBoundary = {
  partnerId: string;
  partnerName: string;
  atMs: number;
};

/** 按相对录音时间（毫秒，起点=A1/录音开始）把句子归到伙伴 */
export function assignSentencesByRelativeMarkerTime(
  sentences: Array<{ atMs: number | null; line: string }>,
  boundaries: PartnerTimeBoundary[],
): TranscriptSegment[] {
  const sorted = [...boundaries]
    .filter((b) => Number.isFinite(b.atMs))
    .sort((a, b) => a.atMs - b.atMs);

  const buckets = new Map<string, { partnerId: string | null; partnerName: string | null; lines: string[] }>();
  const unassignedKey = "__unassigned__";
  buckets.set(unassignedKey, { partnerId: null, partnerName: null, lines: [] });
  for (const b of sorted) {
    if (!buckets.has(b.partnerId)) {
      buckets.set(b.partnerId, { partnerId: b.partnerId, partnerName: b.partnerName, lines: [] });
    }
  }

  for (const s of sentences) {
    if (!s.line.trim()) continue;
    if (s.atMs == null || !sorted.length) {
      buckets.get(unassignedKey)!.lines.push(s.line);
      continue;
    }
    let owner: PartnerTimeBoundary | null = null;
    for (const b of sorted) {
      if (b.atMs <= s.atMs) owner = b;
      else break;
    }
    if (!owner) {
      buckets.get(unassignedKey)!.lines.push(s.line);
    } else {
      buckets.get(owner.partnerId)!.lines.push(s.line);
    }
  }

  const segments: TranscriptSegment[] = [];
  const un = buckets.get(unassignedKey)!;
  if (un.lines.length) {
    segments.push({ partnerId: null, partnerName: null, text: un.lines.join("\n") });
  }
  for (const b of sorted) {
    const bucket = buckets.get(b.partnerId);
    if (!bucket?.lines.length) continue;
    segments.push({
      partnerId: b.partnerId,
      partnerName: b.partnerName,
      text: bucket.lines.join("\n"),
    });
  }
  return segments;
}

/**
 * 按标记时刻把转写句子归到「当前正在过的伙伴」。
 * boundaries 应按时间升序；句子时间用绝对 epoch ms。
 */
export function assignSentencesByMarkerTime(
  sentences: Array<{ absoluteMs: number | null; line: string }>,
  boundaries: PartnerTimeBoundary[],
): TranscriptSegment[] {
  const sorted = [...boundaries]
    .filter((b) => Number.isFinite(b.atMs))
    .sort((a, b) => a.atMs - b.atMs);

  const buckets = new Map<string, { partnerId: string | null; partnerName: string | null; lines: string[] }>();
  const unassignedKey = "__unassigned__";
  buckets.set(unassignedKey, { partnerId: null, partnerName: null, lines: [] });
  for (const b of sorted) {
    if (!buckets.has(b.partnerId)) {
      buckets.set(b.partnerId, { partnerId: b.partnerId, partnerName: b.partnerName, lines: [] });
    }
  }

  for (const s of sentences) {
    if (!s.line.trim()) continue;
    if (s.absoluteMs == null || !sorted.length) {
      buckets.get(unassignedKey)!.lines.push(s.line);
      continue;
    }
    let owner: PartnerTimeBoundary | null = null;
    for (const b of sorted) {
      if (b.atMs <= s.absoluteMs) owner = b;
      else break;
    }
    if (!owner) {
      buckets.get(unassignedKey)!.lines.push(s.line);
    } else {
      buckets.get(owner.partnerId)!.lines.push(s.line);
    }
  }

  const segments: TranscriptSegment[] = [];
  const un = buckets.get(unassignedKey)!;
  if (un.lines.length) {
    segments.push({ partnerId: null, partnerName: null, text: un.lines.join("\n") });
  }
  for (const b of sorted) {
    const bucket = buckets.get(b.partnerId);
    if (!bucket?.lines.length) continue;
    segments.push({
      partnerId: b.partnerId,
      partnerName: b.partnerName,
      text: bucket.lines.join("\n"),
    });
  }
  return segments;
}
