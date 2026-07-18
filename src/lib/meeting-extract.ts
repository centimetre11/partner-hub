import "server-only";

import { AIError, chatCompletion, type ChatImage, type ChatMessage } from "./ai";
import { parseDateTimeLocal, toDateTimeLocalInput } from "./meeting-datetime";
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

export type MeetingExtractContext = {
  locale: Locale;
  timeZone: string;
  /** 用户时区下的当前墙钟 YYYY-MM-DDTHH:mm */
  nowLocal: string;
  /** 用户时区下的星期，如 Saturday */
  weekday: string;
  userId: string;
};

/** 识图只需短 JSON，限制 token 加快响应 */
const MEETING_EXTRACT_MAX_TOKENS = 480;

function buildPrompt(ctx: MeetingExtractContext): string {
  const { locale, timeZone, nowLocal, weekday } = ctx;
  const datePart = nowLocal.slice(0, 10);

  if (locale === "zh") {
    return `从截图提取会议邀约 JSON。当前：${weekday} ${nowLocal}（${timeZone}）。
输出字段（startAt/endAt 必须是用户时区 ${timeZone} 的墙钟 YYYY-MM-DDTHH:mm）：
{"subject":"","startAt":"","endAt":"","customerEmails":[],"colleagueEmails":[],"contactName":"","customerName":""}

日期规则（关键）：
- 「周二/Tuesday」= 今天(${datePart})之后最近的那个周二，不是今天本身除非今天就是周二
- 截图若写其他时区（如 Riyadh time / GMT+3），先换算成 ${timeZone} 再写入 startAt
- 只有开始时间则 endAt = startAt + 1 小时

主题规则：无明确标题时，用「与 {联系人} 的会议」或 "Meeting with {name}"
其他：仅图片可见信息；邮箱小写；contactName=外部联系人姓名。只输出 JSON。`;
  }

  return `Extract meeting invite JSON from screenshot. Now: ${weekday} ${nowLocal} (${timeZone}).
startAt/endAt = wall-clock in USER timezone ${timeZone}, format YYYY-MM-DDTHH:mm:
{"subject":"","startAt":"","endAt":"","customerEmails":[],"colleagueEmails":[],"contactName":"","customerName":""}

Date rules (critical):
- "Tuesday" = the nearest Tuesday ON OR AFTER today (${datePart}), not today unless today is Tuesday
- If another TZ is mentioned (e.g. "4pm Riyadh"), convert to ${timeZone} before writing startAt
- If only start time, endAt = startAt + 1 hour

Subject: if no explicit title, use "Meeting with {contactName}"
Other: visible text only; lowercase emails; contactName = external person. JSON only.`;
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

/** 兼容 AI 返回的 2026/07/19, 21:00 等格式 */
export function normalizeLocalDateTime(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  const slash = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[,\sT]+(\d{1,2}):(\d{2})/);
  if (slash) {
    const pad = (n: string) => n.padStart(2, "0");
    return `${slash[1]}-${pad(slash[2])}-${pad(slash[3])}T${pad(slash[4])}:${slash[5]}`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return s.includes("T") ? s.slice(0, 16) : null;
  return null;
}

export function normalizeMeetingExtractResult(
  raw: MeetingExtractResult,
  ctx: Pick<MeetingExtractContext, "timeZone" | "locale">,
): MeetingExtractResult {
  const result: MeetingExtractResult = { ...raw };

  if (result.customerEmails?.length) {
    result.customerEmails = [...new Set(result.customerEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  }
  if (result.colleagueEmails?.length) {
    result.colleagueEmails = [...new Set(result.colleagueEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  }

  const startNorm = normalizeLocalDateTime(result.startAt);
  if (startNorm) result.startAt = startNorm;
  const endNorm = normalizeLocalDateTime(result.endAt);
  if (endNorm) result.endAt = endNorm;

  const tz = ctx.timeZone.trim() || "UTC";
  if (result.startAt && !result.endAt) {
    const start = parseDateTimeLocal(result.startAt, tz);
    if (start) {
      result.endAt = toDateTimeLocalInput(new Date(start.getTime() + 60 * 60 * 1000), tz);
    }
  }

  if (!result.subject?.trim()) {
    const name = result.contactName?.trim() || result.customerName?.trim();
    if (name) {
      result.subject = ctx.locale === "zh" ? `与 ${name} 的会议` : `Meeting with ${name}`;
    }
  }

  return result;
}

export async function extractMeetingFromImages(
  images: ChatImage[],
  ctx: MeetingExtractContext,
): Promise<MeetingExtractResult> {
  if (!images.length) throw new AIError("请上传截图");

  const system = buildPrompt(ctx);
  const userMsg: ChatMessage = {
    role: "user",
    content: ctx.locale === "zh" ? "提取 JSON。" : "Extract JSON.",
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
    userId: ctx.userId,
    taskTier: "fast",
    maxTokens: MEETING_EXTRACT_MAX_TOKENS,
    toolChoice: "none",
    apiFallback: false,
  });

  const parsed = parseJsonContent(content) ?? {};
  return normalizeMeetingExtractResult(parsed, ctx);
}
