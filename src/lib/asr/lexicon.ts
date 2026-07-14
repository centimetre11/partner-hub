import "server-only";

import { db } from "../db";
import {
  parseCorrectionRules,
  parseHotwords,
  type AsrConfigForClient,
  type AsrLexicon,
} from "./types";

export type { AsrConfigForClient, AsrLexicon } from "./types";
export {
  applyCorrectionRules,
  buildLexiconPrompt,
  isLikelyAsrPromptLeak,
  parseCorrectionRules,
  parseHotwords,
  resolveAsrLanguage,
  stripAsrPromptArtifacts,
} from "./types";

const DEFAULTS: AsrLexicon = {
  realtimeEnabled: true,
  chunkSeconds: 12,
  language: "auto",
  // 勿写「请正确书写」类指令；Whisper 会把指令念进转写
  basePrompt: "",
  hotwords: [],
  correctionRules: [],
  llmCorrectEnabled: true,
  includePartnerNames: true,
};

export async function resolveAsrLexicon(): Promise<AsrLexicon> {
  const row = await db.systemAsrConfig.findUnique({ where: { id: "singleton" } });
  if (!row) return { ...DEFAULTS };
  const chunk = Math.min(30, Math.max(8, row.chunkSeconds || 12));
  return {
    realtimeEnabled: row.realtimeEnabled,
    chunkSeconds: chunk,
    language: row.language?.trim() || "auto",
    basePrompt: row.basePrompt?.trim() || DEFAULTS.basePrompt,
    hotwords: parseHotwords(row.hotwords),
    correctionRules: parseCorrectionRules(row.correctionRules),
    llmCorrectEnabled: row.llmCorrectEnabled,
    includePartnerNames: row.includePartnerNames,
  };
}

export async function getAsrConfigForClient(): Promise<AsrConfigForClient> {
  const row = await db.systemAsrConfig.findUnique({ where: { id: "singleton" } });
  const baseUrl = !!(process.env.ASR_BASE_URL || "").trim();
  return {
    configured: !!row,
    realtimeEnabled: row?.realtimeEnabled ?? true,
    chunkSeconds: row?.chunkSeconds ?? 12,
    language: row?.language ?? "auto",
    basePrompt: row?.basePrompt ?? DEFAULTS.basePrompt,
    hotwords: row?.hotwords ?? "",
    correctionRules: row?.correctionRules ?? "",
    llmCorrectEnabled: row?.llmCorrectEnabled ?? true,
    includePartnerNames: row?.includePartnerNames ?? true,
    asrBaseUrlConfigured: baseUrl,
    updatedAt: row?.updatedAt?.toISOString(),
  };
}
