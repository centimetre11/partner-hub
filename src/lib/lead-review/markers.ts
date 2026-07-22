/** 线索段落（会后归属） */
export type LeadTranscriptSegment = {
  itemId: string | null;
  displayName: string | null;
  text: string;
};

/** 将拆分后的线索段落渲染为 ## 名称 格式记录本 */
export function buildLeadLiveNotesFromSegments(segments: LeadTranscriptSegment[]): string {
  const parts: string[] = [];
  for (const seg of segments) {
    const body = seg.text.trim();
    if (seg.displayName) {
      parts.push(
        body
          ? `## ${seg.displayName}\n${body}`
          : `## ${seg.displayName}\n（该时段未匹配到纪要内容）`,
      );
    } else if (body) {
      parts.push(`## 未归属\n${body}`);
    }
  }
  return parts.join("\n\n");
}

/** 从 ## 名称 格式的记录本解析回段落 */
export function parseLeadSectionsFromLiveNotes(
  liveNotes: string | null | undefined,
  items: { id: string; displayName: string | null }[],
): LeadTranscriptSegment[] {
  const raw = (liveNotes ?? "").trim();
  if (!raw) return [];

  const nameToItem = new Map(
    items
      .filter((it) => it.displayName?.trim())
      .map((it) => [it.displayName!.trim().toLowerCase(), it]),
  );
  const segments: LeadTranscriptSegment[] = [];
  const re = /^##\s+(.+)\s*$/gm;
  const matches = [...raw.matchAll(re)];

  if (!matches.length) {
    // 兼容旧版 === Name ===
    const eq = [...raw.matchAll(/^===\s*(.+?)\s*===\s*$/gm)];
    if (eq.length) {
      for (let i = 0; i < eq.length; i++) {
        const m = eq[i]!;
        const heading = m[1]!.trim();
        const start = (m.index ?? 0) + m[0].length;
        const end = i + 1 < eq.length ? eq[i + 1]!.index! : raw.length;
        const body = raw.slice(start, end).trim();
        if (heading === "开场" || heading === "未归属") {
          if (body) segments.push({ itemId: null, displayName: null, text: body });
          continue;
        }
        const item = nameToItem.get(heading.toLowerCase());
        segments.push({
          itemId: item?.id ?? null,
          displayName: item?.displayName ?? heading,
          text: body === "（本段暂无转写）" ? "" : body,
        });
      }
      return segments;
    }
    return [{ itemId: null, displayName: null, text: raw }];
  }

  const first = matches[0]!;
  const before = raw.slice(0, first.index).trim();
  if (before) {
    segments.push({ itemId: null, displayName: null, text: before });
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const heading = m[1]!.trim();
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : raw.length;
    let body = raw.slice(start, end).trim();
    if (
      body === "（该时段未匹配到纪要内容）" ||
      body === "（该时段未识别到有效语音）" ||
      body === "（本段暂无转写）"
    ) {
      body = "";
    }

    if (heading === "未归属" || heading === "开场" || heading === "转写全文") {
      if (body) segments.push({ itemId: null, displayName: null, text: body });
      continue;
    }

    const item = nameToItem.get(heading.toLowerCase());
    segments.push({
      itemId: item?.id ?? null,
      displayName: item?.displayName ?? heading,
      text: body,
    });
  }

  return segments;
}
