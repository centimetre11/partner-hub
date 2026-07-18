import "server-only";

import { AIError, chatCompletion, type ChatImage, type ChatMessage } from "./ai";
import { maxTokensForVisionIntake } from "./ai-capabilities";
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

function buildPrompt(locale: Locale, today: string, timeZone: string): string {
  if (locale === "zh") {
    return `你是会议邀约信息提取助手。从用户上传的截图（日历邀请、邮件、聊天截图等）中提取结构化信息。
今天日期：${today}，用户时区：${timeZone}。
只输出 JSON，不要 markdown。字段：
{
  "subject": "邮件/日程标题（字符串，若无则根据内容推断）",
  "startAt": "开始时间 ISO8601 或 YYYY-MM-DDTHH:mm（24h，按截图时区或 ${timeZone}）",
  "endAt": "结束时间，同上",
  "customerEmails": ["外部客户/参会方邮箱"],
  "colleagueEmails": ["内部同事邮箱（同公司域名或明显内部地址）"],
  "contactName": "客户联系人姓名",
  "customerName": "客户公司或组织名"
}
规则：只提取图片中可见信息，不要编造；邮箱 lowercase；若只有一个外部邮箱放入 customerEmails；时间若只有开始无结束，结束=start+1h。`;
  }
  return `Extract meeting invitation details from the screenshot (calendar invite, email, chat).
Today: ${today}, user timezone: ${timeZone}.
Output JSON only:
{
  "subject": "email/calendar title",
  "startAt": "ISO8601 or YYYY-MM-DDTHH:mm",
  "endAt": "end time",
  "customerEmails": ["external participant emails"],
  "colleagueEmails": ["internal colleague emails"],
  "contactName": "contact person name",
  "customerName": "company or organization"
}
Only visible text; do not invent. Lowercase emails. If only start time, end = start + 1 hour.`;
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

async function visionOcr(images: ChatImage[], locale: Locale, userId: string): Promise<string | null> {
  const prompt =
    locale === "zh"
      ? "逐字列出图片中与会议邀约相关的文字：标题、时间、邮箱、人名、公司名。不要编造。"
      : "List all meeting-invitation text from the image: title, times, emails, names, company. Do not invent.";
  try {
    const { content } = await chatCompletion([{ role: "user", content: prompt, images }], {
      jsonMode: false,
      temperature: 0.1,
      feature: "Meeting invite: vision OCR",
      userId,
      scene: "vision",
      maxTokens: maxTokensForVisionIntake(),
      toolChoice: "none",
    });
    return content?.trim() || null;
  } catch {
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
    content:
      opts.locale === "zh"
        ? "请从这张会议邀约截图中提取 JSON 字段。"
        : "Extract meeting invite fields from this screenshot as JSON.",
    images,
  };
  const chat: ChatMessage[] = [
    { role: "system", content: system },
    userMsg,
  ];
  normalizeMessagesForAi(chat);

  let parsed: MeetingExtractResult | null = null;
  try {
    const { content } = await chatCompletion(chat, {
      jsonMode: true,
      temperature: 0.1,
      feature: "Meeting invite: extract",
      userId: opts.userId,
      scene: "vision",
      maxTokens: maxTokensForVisionIntake(),
      toolChoice: "none",
    });
    parsed = parseJsonContent(content);
  } catch {
    // fall through to OCR
  }

  if (!parsed?.subject && !parsed?.startAt && !parsed?.customerEmails?.length) {
    const ocr = await visionOcr(images, opts.locale, opts.userId);
    if (ocr) {
      const ocrChat: ChatMessage[] = [
        { role: "system", content: system },
        {
          role: "user",
          content: `[Image OCR]\n${ocr}`,
        },
      ];
      const { content } = await chatCompletion(ocrChat, {
        jsonMode: true,
        temperature: 0.1,
        feature: "Meeting invite: extract from OCR",
        userId: opts.userId,
        maxTokens: maxTokensForVisionIntake(),
      });
      parsed = parseJsonContent(content);
    }
  }

  return parsed ?? {};
}
