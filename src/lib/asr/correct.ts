import "server-only";

import { chatJson } from "../ai";
import {
  buildTimedTranscriptDoc,
  type TimedTranscriptDoc,
} from "../partner-review/transcript";
import { applyCorrectionRules, buildLexiconPrompt, type AsrLexicon } from "./types";

/** 用本场伙伴名单 + 团队规则做纠偏 */
export async function correctTranscriptWithLexicon(opts: {
  doc: TimedTranscriptDoc;
  partnerNames: string[];
  lexicon: AsrLexicon;
  userId?: string;
}): Promise<TimedTranscriptDoc> {
  // 先跑快规则
  let sentences = opts.doc.sentences.map((s) => ({
    ...s,
    text: applyCorrectionRules(s.text, opts.lexicon.correctionRules),
  }));
  let doc = buildTimedTranscriptDoc({
    sentences,
    timeBase: opts.doc.timeBase === "unknown" ? "relative_ms" : opts.doc.timeBase,
    recordingStartedAt: opts.doc.recordingStartedAt,
  });

  if (!opts.lexicon.llmCorrectEnabled || !opts.doc.sentences.length) return doc;

  const names = [...new Set(opts.partnerNames.map((n) => n.trim()).filter(Boolean))];
  const hot = opts.lexicon.hotwords;
  if (!names.length && !hot.length) return doc;

  const plain = doc.plain.slice(0, 14000);
  const vocab = [...new Set([...names, ...hot])].slice(0, 80);
  try {
    const ai = await chatJson<{ corrected?: string; changed?: boolean }>(
      `你是会议转写校对助手。只修正专有名词（公司/伙伴名/产品名）的明显错写或谐音错误，不要改动其他措辞与事实。
若无需修改，原样返回 corrected，changed=false。
只输出 JSON：{"corrected":"...","changed":boolean}`,
      `标准名称（按此纠偏）：\n${vocab.map((n) => `- ${n}`).join("\n")}\n\n转写原文：\n${plain}`,
      {
        feature: "partner_review_asr_correct",
        userId: opts.userId,
        scene: "default",
        taskTier: "fast",
        temperature: 0.1,
      },
    );

    const corrected = String(ai.corrected ?? "").trim();
    if (!corrected || ai.changed === false || corrected === plain) return doc;

    const oldLines = doc.sentences;
    const newLines = corrected
      .split(/\n+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (newLines.length === oldLines.length) {
      return buildTimedTranscriptDoc({
        sentences: oldLines.map((s, i) => ({
          startTime: s.startTime,
          endTime: s.endTime,
          speaker: s.speaker,
          text: applyCorrectionRules(newLines[i]!, opts.lexicon.correctionRules),
        })),
        timeBase: doc.timeBase === "unknown" ? "relative_ms" : doc.timeBase,
        recordingStartedAt: doc.recordingStartedAt,
      });
    }

    return buildTimedTranscriptDoc({
      sentences: [
        {
          startTime: oldLines[0]?.startTime ?? 0,
          endTime: oldLines[oldLines.length - 1]?.endTime,
          text: applyCorrectionRules(corrected, opts.lexicon.correctionRules),
        },
      ],
      timeBase: doc.timeBase === "unknown" ? "relative_ms" : doc.timeBase,
      recordingStartedAt: doc.recordingStartedAt,
    });
  } catch {
    return doc;
  }
}

/** @deprecated 使用 buildLexiconPrompt */
export function buildAsrInitialPrompt(partnerNames: string[], lexicon?: AsrLexicon): string {
  if (lexicon) return buildLexiconPrompt({ lexicon, partnerNames });
  const names = [...new Set(partnerNames.map((n) => n.trim()).filter(Boolean))].slice(0, 40);
  if (!names.length) {
    return "这是一场中文商务过伙伴会议的录音转写。";
  }
  return `这是一场中文商务过伙伴会议。讨论的伙伴名称包括：${names.join("、")}。请正确书写上述专有名词。`;
}
