/** 自托管 ASR：默认对接 whisper-asr-webservice（faster-whisper） */

export type AsrProvider = "whisper_asr_webservice" | "openai_compatible";

export function getAsrConfig() {
  const baseUrl = (process.env.ASR_BASE_URL || "").trim().replace(/\/$/, "");
  const provider = (process.env.ASR_PROVIDER || "whisper_asr_webservice").trim() as AsrProvider;
  // auto = 不传 language，由 Whisper 自动检测（中英混说）
  const language = (process.env.ASR_LANGUAGE || "auto").trim() || "auto";
  const apiKey = (process.env.ASR_API_KEY || "").trim();
  const model = (process.env.ASR_MODEL || "whisper-1").trim();
  const timeoutMs = Math.max(30_000, Number(process.env.ASR_TIMEOUT_MS || 600_000) || 600_000);
  return {
    enabled: !!baseUrl,
    baseUrl,
    provider: provider === "openai_compatible" ? "openai_compatible" : "whisper_asr_webservice",
    language,
    apiKey,
    model,
    timeoutMs,
  } as const;
}
