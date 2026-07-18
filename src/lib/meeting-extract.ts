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

/**
 * 视觉模型（尤其 Seed 系）常先 reasoning 再输出 JSON，token 过低会截断成空对象。
 * 仍比旧版 4096 小，但足够完整 JSON。
 */
const MEETING_EXTRACT_MAX_TOKENS = 1536;

function buildPrompt(ctx: MeetingExtractContext, source: "image" | "text"): string {
  const { locale, timeZone, nowLocal, weekday } = ctx;
  const datePart = nowLocal.slice(0, 10);
  const sourceHint =
    source === "image"
      ? locale === "zh"
        ? "必须阅读图片中的文字，禁止猜测。"
        : "READ the image text; do not guess."
      : locale === "zh"
        ? "必须阅读用户提供的会议邀约文字，禁止猜测。"
        : "READ the user's meeting invite text; do not guess.";

  if (locale === "zh") {
    return `你是会议邀约 ${source === "image" ? "截图 OCR + " : ""}结构化助手。${sourceHint}

当前时间：${weekday} ${nowLocal}（${timeZone}）
只输出 JSON（startAt/endAt 为用户时区 ${timeZone} 墙钟 YYYY-MM-DDTHH:mm）：
{"subject":"","startAt":"","endAt":"","customerEmails":[],"colleagueEmails":[],"contactName":"","customerName":""}

日期：「周二/Tuesday」= ${datePart} 之后最近的一个周二；其他时区（如 Riyadh 4pm）先换算到 ${timeZone}。
主题：无标题时用「与 {contactName} 的会议」；contactName=外部联系人姓名。
邮箱小写；仅结束时间缺失时 endAt = startAt + 1h。`;
  }

  return `Meeting invite ${source === "image" ? "screenshot OCR + " : ""}extraction. ${sourceHint}

Now: ${weekday} ${nowLocal} (${timeZone})
JSON only (startAt/endAt wall-clock in ${timeZone}, YYYY-MM-DDTHH:mm):
{"subject":"","startAt":"","endAt":"","customerEmails":[],"colleagueEmails":[],"contactName":"","customerName":""}

Dates: "Tuesday" = nearest Tuesday on/after ${datePart}; convert other TZ (e.g. "4pm Riyadh") to ${timeZone}.
Subject: if missing use "Meeting with {contactName}"; contactName = external person.
Lowercase emails; endAt = startAt + 1h only when end missing.`;
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
    return `${slash[1]}-${pad(slash[2])}-${pad(slash[3])}T${pad(slash[4])}:${pad(slash[5])}`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return s.includes("T") ? s.slice(0, 16) : null;
  return null;
}

export function hasUsefulMeetingExtract(r: MeetingExtractResult): boolean {
  return !!(
    r.subject?.trim() ||
    r.startAt?.trim() ||
    r.contactName?.trim() ||
    r.customerName?.trim() ||
    r.customerEmails?.length ||
    r.colleagueEmails?.length
  );
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

  const system = buildPrompt(ctx, "image");
  const userMsg: ChatMessage = {
    role: "user",
    content:
      ctx.locale === "zh"
        ? "请仔细阅读截图中的会议邀约文字并输出 JSON。"
        : "Read the meeting invite text in the screenshot and output JSON.",
    images,
  };
  return runMeetingExtractChat(system, userMsg, ctx, "image");
}

export async function extractMeetingFromText(
  text: string,
  ctx: MeetingExtractContext,
): Promise<MeetingExtractResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new AIError(ctx.locale === "zh" ? "请粘贴或输入会议邀约文字" : "Paste or type meeting invite text");

  const system = buildPrompt(ctx, "text");
  const userMsg: ChatMessage = {
    role: "user",
    content:
      ctx.locale === "zh"
        ? `请从以下会议邀约文字中提取信息并输出 JSON：\n\n${trimmed}`
        : `Extract meeting info from the following text and output JSON:\n\n${trimmed}`,
  };
  return runMeetingExtractChat(system, userMsg, ctx, "text");
}

async function runMeetingExtractChat(
  system: string,
  userMsg: ChatMessage,
  ctx: MeetingExtractContext,
  source: "image" | "text",
): Promise<MeetingExtractResult> {
  const chat: ChatMessage[] = [
    { role: "system", content: system },
    userMsg,
  ];
  normalizeMessagesForAi(chat);

  const { content } = await chatCompletion(chat, {
    jsonMode: true,
    temperature: 0,
    feature: source === "image" ? "Meeting invite: extract" : "Meeting invite: extract text",
    userId: ctx.userId,
    maxTokens: MEETING_EXTRACT_MAX_TOKENS,
    toolChoice: "none",
  });

  const parsed = parseJsonContent(content) ?? {};
  const result = normalizeMeetingExtractResult(parsed, ctx);

  if (!hasUsefulMeetingExtract(result)) {
    throw new AIError(
      ctx.locale === "zh"
        ? source === "image"
          ? "未能从截图识别到会议信息。请确认：① 截图含清晰的时间/联系人文字；② 设置 → 场景模型分配 →「图片识别」已配置视觉模型（名称含 vl/vision/seed/4o 等）。"
          : "未能从文字识别到会议信息。请补充时间、联系人或邮箱后再试。"
        : source === "image"
          ? "Could not extract meeting info from the screenshot. Ensure readable time/contact text, and assign a vision-capable model under Settings → Scene models → Vision."
          : "Could not extract meeting info from the text. Add time, contact, or email and try again.",
    );
  }

  return result;
}
