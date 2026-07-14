/** 会中讨论标记格式：<<<PARTNER:{id}|{name}>>> */
export const PARTNER_MARKER_RE = /<<<PARTNER:([^|>]+)\|([^>]+)>>>/g;

export function formatPartnerMarker(partnerId: string, partnerName: string): string {
  const safeName = partnerName.replace(/[<>|]/g, " ").trim() || partnerId;
  return `<<<PARTNER:${partnerId}|${safeName}>>>`;
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

export function appendMarkerToNotes(liveNotes: string | null | undefined, marker: string): string {
  const base = (liveNotes ?? "").trimEnd();
  if (base.includes(marker)) return base;
  return base ? `${base}\n\n${marker}\n` : `${marker}\n`;
}
