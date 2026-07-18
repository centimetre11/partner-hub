import "server-only";

import { AIError, chatCompletion, type ChatImage, type ChatMessage } from "./ai";
import { resolveFastIntakeMaxTokens } from "./ai-capabilities";
import { normalizeMessagesForAi } from "./ai-images-server";
import type { Locale } from "./i18n/locale";

export type MeetingExtractResult = {
  subject?: string;
  startAt?: string;
  endAt?: string;
  customerEmails?: string[];
  colleagueEmails?: string[];
  contactName?: string;
  customerName?: string;
};

const MEETING_EXTRACT_MAX_TOKENS = Math.min(resolveFastIntakeMaxTokens() + 256, 1024);

function buildPrompt(locale: Locale, today: string, timeZone: string): string {
  if (locale === "zh") {
    return `从会议邀约截图提取 JSON。今天 ${today}，时区 ${timeZone}。只输出 JSON：
{"subject":"","startAt":"YYYY-MM-DDTHH:mm","endAt":"YYYY-MM-DDTHH:mm","customerEmails":[],"colleagueEmails":[],"contactName":"","customerName":""}
规则：仅图片可见内容；邮箱小写；无结束时间则 start+1h。`;
  }
  return `Extract meeting invite JSON from screenshot. Today ${today}, TZ ${timeZone}. JSON only:
{"subject":"","startAt":"YYYY-MM-DDTHH:mm","endAt":"YYYY-MM-DDTHH:mm","customerEmails":[],"colleagueEmails":[],"contactName":"","customerName":""}
Visible text only; lowercase emails; end = start+1h if missing.`;
}

function parseJsonContent(raw: string | null | undefined): MeetingExtractResult | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(jsonStr) as MeetingExtractResult;
  } catch {
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(jsonStr.slice(start, end + 1)) as MeetingExtractResult;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function extractMeetingFromImages(
  images: ChatImage[],
  opts: { locale: Locale; timeZone: string; today: string; userId: string },
): Promise<MeetingExtractResult> {
  if (!images.length) throw new AIError("请上传截图");

  const system = buildPrompt(opts.locale, opts.today, opts.timeZone);
  const userMsg: ChatMessage = {
    role: "user",
    content: opts.locale === "zh" ? "提取 JSON。" : "Extract JSON.",
    images,
  };
  const chat: ChatMessage[] = [
    { role: "system", content: system },
    userMsg,
  ];
  normalizeMessagesForAi(chat);

  const { content } = await chatCompletion(chat, {
    jsonMode: true,
    temperature: 0,
    feature: "Meeting invite: extract",
    userId: opts.userId,
    taskTier: "fast",
    maxTokens: MEETING_EXTRACT_MAX_TOKENS,
    toolChoice: "none",
  });

  return parseJsonContent(content) ?? {};
}
