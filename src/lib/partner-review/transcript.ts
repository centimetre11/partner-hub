/** 带时间轴的转写文档（存 PartnerReviewMeeting.transcriptJson） */

export type TranscriptSentence = {
  /** 绝对时间 epoch ms，或相对开会起点的 ms（由 timeBase 解释） */
  startTime: number;
  endTime?: number;
  speaker?: string;
  text: string;
};

export type TimedTranscriptDoc = {
  v: 1;
  /** relative_ms：相对开会/录音起点；absolute_ms：Unix 毫秒 */
  timeBase: "relative_ms" | "absolute_ms" | "unknown";
  recordingStartedAt?: string;
  sentences: TranscriptSentence[];
  plain: string;
};

const ABSOLUTE_MS_FLOOR = Date.parse("2020-01-01T00:00:00.000Z");

export function sentencesToPlain(sentences: TranscriptSentence[]): string {
  return sentences
    .map((s) => {
      const who = s.speaker?.trim();
      return who ? `${who}: ${s.text}` : s.text;
    })
    .filter(Boolean)
    .join("\n");
}

export function buildTimedTranscriptDoc(opts: {
  sentences: TranscriptSentence[];
  timeBase?: TimedTranscriptDoc["timeBase"];
  recordingStartedAt?: Date | string | null;
}): TimedTranscriptDoc {
  const sentences = opts.sentences
    .map((s) => ({
      startTime: Number(s.startTime) || 0,
      endTime: s.endTime != null ? Number(s.endTime) : undefined,
      speaker: s.speaker?.trim() || undefined,
      text: String(s.text ?? "").trim(),
    }))
    .filter((s) => s.text);
  const recordingStartedAt =
    opts.recordingStartedAt instanceof Date
      ? opts.recordingStartedAt.toISOString()
      : opts.recordingStartedAt ?? undefined;
  let timeBase = opts.timeBase ?? "unknown";
  if (timeBase === "unknown" && sentences.length) {
    const sample = sentences.find((s) => s.startTime > 0)?.startTime ?? 0;
    timeBase = sample >= ABSOLUTE_MS_FLOOR ? "absolute_ms" : "relative_ms";
  }
  return {
    v: 1,
    timeBase,
    recordingStartedAt,
    sentences,
    plain: sentencesToPlain(sentences),
  };
}

export function parseTimedTranscriptDoc(raw: string | null | undefined): TimedTranscriptDoc | null {
  if (!raw?.trim()) return null;
  try {
    const data = JSON.parse(raw) as Partial<TimedTranscriptDoc>;
    if (data?.v !== 1 || !Array.isArray(data.sentences)) return null;
    const sentences = data.sentences
      .map((s) => ({
        startTime: Number(s.startTime) || 0,
        endTime: s.endTime != null ? Number(s.endTime) : undefined,
        speaker: s.speaker?.trim() || undefined,
        text: String(s.text ?? "").trim(),
      }))
      .filter((s) => s.text);
    if (!sentences.length) return null;
    return {
      v: 1,
      timeBase: data.timeBase === "absolute_ms" || data.timeBase === "relative_ms" ? data.timeBase : "unknown",
      recordingStartedAt: data.recordingStartedAt,
      sentences,
      plain: typeof data.plain === "string" && data.plain.trim() ? data.plain : sentencesToPlain(sentences),
    };
  } catch {
    return null;
  }
}

export function serializeTimedTranscriptDoc(doc: TimedTranscriptDoc): string {
  return JSON.stringify(doc);
}

/** 把句子时间统一成可与 markerInsertedAt 比较的绝对 epoch ms */
export function sentenceAbsoluteMs(
  sentence: TranscriptSentence,
  doc: TimedTranscriptDoc,
  fallbackStartedAt?: Date | null,
): number | null {
  const t = sentence.startTime;
  if (!Number.isFinite(t)) return null;

  if (doc.timeBase === "absolute_ms" || t >= ABSOLUTE_MS_FLOOR) {
    return t;
  }

  const anchorIso = doc.recordingStartedAt;
  const anchor = anchorIso ? Date.parse(anchorIso) : fallbackStartedAt?.getTime();
  if (anchor != null && Number.isFinite(anchor)) {
    // 钉钉常见：秒或毫秒相对时间
    const offset = t > 0 && t < 1e7 ? t * 1000 : t;
    return anchor + offset;
  }

  return null;
}

/**
 * 尝试从钉盘/粘贴文本解析带时间的句子。
 * 支持行首 [HH:MM:SS] / [MM:SS] / [14:32] 以及 JSON paragraphList。
 */
export function parseTranscriptTextToTimedDoc(
  text: string,
  opts?: { recordingStartedAt?: Date | null },
): TimedTranscriptDoc | null {
  const raw = text?.trim();
  if (!raw) return null;

  // JSON blob
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const data = JSON.parse(raw) as
        | TimedTranscriptDoc
        | { paragraphList?: Array<{ nickName?: string; sentence?: string; startTime?: number; endTime?: number }> }
        | Array<{ nickName?: string; sentence?: string; startTime?: number; text?: string }>;
      if (data && typeof data === "object" && !Array.isArray(data) && "v" in data && data.v === 1) {
        return parseTimedTranscriptDoc(JSON.stringify(data));
      }
      const list = Array.isArray(data)
        ? data
        : "paragraphList" in data
          ? data.paragraphList ?? []
          : [];
      const sentences: TranscriptSentence[] = list
        .map((p) => {
          const row = p as {
            nickName?: string;
            sentence?: string;
            text?: string;
            startTime?: number;
            endTime?: number;
          };
          return {
            startTime: Number(row.startTime) || 0,
            endTime: row.endTime != null ? Number(row.endTime) : undefined,
            speaker: row.nickName?.trim() || undefined,
            text: String(row.sentence ?? row.text ?? "").trim(),
          };
        })
        .filter((s) => s.text);
      if (sentences.some((s) => s.startTime > 0)) {
        return buildTimedTranscriptDoc({
          sentences,
          recordingStartedAt: opts?.recordingStartedAt,
        });
      }
    } catch {
      /* fall through to line parse */
    }
  }

  const lineRe =
    /^\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(?:([^:：\n]{1,40})[:：]\s*)?(.+)$/;
  const wallClockRe = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(.+)$/;
  const sentences: TranscriptSentence[] = [];
  const anchor = opts?.recordingStartedAt ?? null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const m = trimmed.match(lineRe);
    if (m) {
      const hours = m[1] != null ? Number(m[1]) : 0;
      const mins = Number(m[2]);
      const secs = Number(m[3]);
      const ms = m[4] != null ? Number(m[4].padEnd(3, "0")) : 0;
      const startTime = ((hours * 60 + mins) * 60 + secs) * 1000 + ms;
      sentences.push({
        startTime,
        speaker: m[5]?.trim() || undefined,
        text: m[6]!.trim(),
      });
      continue;
    }

    const wc = trimmed.match(wallClockRe);
    if (wc && anchor) {
      const h = Number(wc[1]);
      const mins = Number(wc[2]);
      const secs = wc[3] != null ? Number(wc[3]) : 0;
      const body = wc[4]!.trim();
      if (/会议助手|元宝|AI/i.test(body) && body.length < 40) continue;
      const d = new Date(anchor);
      d.setHours(h, mins, secs, 0);
      sentences.push({
        startTime: d.getTime(),
        text: body,
      });
    }
  }

  if (!sentences.length) return null;
  const hasAbsolute = sentences.some((s) => s.startTime >= ABSOLUTE_MS_FLOOR);
  return buildTimedTranscriptDoc({
    sentences,
    timeBase: hasAbsolute ? "absolute_ms" : "relative_ms",
    recordingStartedAt: opts?.recordingStartedAt,
  });
}
