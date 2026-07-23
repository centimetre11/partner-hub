/** 会中讨论标记：<<<ITEM:{itemId}|{label}>>> */
export const ITEM_MARKER_RE = /<<<ITEM:([^|>]+)\|([^>]+)>>>/g;

export function formatItemMarker(itemId: string, label: string): string {
  const safe = label.replace(/[<>|]/g, " ").trim() || itemId;
  return `<<<ITEM:${itemId}|${safe}>>>`;
}

export function formatDiscussStartLine(label: string, at: Date = new Date()): string {
  const time = at.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const safe = label.replace(/\n/g, " ").trim() || "议程项";
  return `[${time}] 开始过 ${safe}`;
}

/** partnerId 字段存 itemId，便于复用段落渲染逻辑 */
export type TranscriptSegment = {
  partnerId: string | null;
  partnerName: string | null;
  text: string;
};

export type ItemTimeBoundary = {
  partnerId: string;
  partnerName: string;
  atMs: number;
};

export function assignSentencesByRelativeMarkerTime(
  sentences: Array<{ atMs: number | null; line: string }>,
  boundaries: ItemTimeBoundary[],
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
    let owner: ItemTimeBoundary | null = null;
    for (const b of sorted) {
      if (b.atMs <= s.atMs) owner = b;
      else break;
    }
    if (!owner) buckets.get(unassignedKey)!.lines.push(s.line);
    else buckets.get(owner.partnerId)!.lines.push(s.line);
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

export function buildLiveNotesFromSegments(segments: TranscriptSegment[]): string {
  const parts: string[] = [];
  for (const seg of segments) {
    const body = seg.text.trim();
    if (seg.partnerName) {
      parts.push(
        body ? `## ${seg.partnerName}\n${body}` : `## ${seg.partnerName}\n（该时段未匹配到纪要内容）`,
      );
    } else if (body) {
      parts.push(`## 未归属\n${body}`);
    }
  }
  return parts.join("\n\n");
}

export function parseItemSectionsFromLiveNotes(
  liveNotes: string | null | undefined,
  items: { itemId: string; label: string }[],
): TranscriptSegment[] {
  const raw = (liveNotes ?? "").trim();
  if (!raw) return [];

  const nameToItem = new Map(items.map((it) => [it.label.trim().toLowerCase(), it]));
  const segments: TranscriptSegment[] = [];
  const re = /^##\s+(.+)\s*$/gm;
  const matches = [...raw.matchAll(re)];

  if (!matches.length) {
    return [{ partnerId: null, partnerName: null, text: raw }];
  }

  const first = matches[0]!;
  const before = raw.slice(0, first.index).trim();
  if (before) segments.push({ partnerId: null, partnerName: null, text: before });

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const heading = m[1]!.trim();
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : raw.length;
    let body = raw.slice(start, end).trim();
    if (body === "（该时段未匹配到纪要内容）" || body === "（该时段未识别到有效语音）") {
      body = "";
    }

    if (heading === "未归属" || heading === "转写全文") {
      if (body) segments.push({ partnerId: null, partnerName: null, text: body });
      continue;
    }

    const hit = nameToItem.get(heading.toLowerCase());
    segments.push({
      partnerId: hit?.itemId ?? null,
      partnerName: hit?.label ?? heading,
      text: body,
    });
  }

  return segments;
}
