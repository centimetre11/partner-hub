import type { Locale } from "./i18n/locale";
import { formatMeetingWindow as formatMeetingWindowInZone, formatMeetingWindowFromLocal } from "./meeting-datetime";

export type MeetingInviteEmailInput = {
  title: string;
  startAt: Date;
  endAt: Date;
  /** datetime-local 墙钟；有值时邮件时间以此为准（与表单一致） */
  startLocal?: string;
  endLocal?: string;
  timeZone: string;
  meetLink: string;
  customerName: string;
  contactName: string | null;
  organizerName: string;
  locale: Locale;
  /** 邮件主题（与企微日程标题一致）；有值时覆盖默认「会议邀请：…」 */
  subjectOverride?: string;
};

function formatMeetingWindow(input: MeetingInviteEmailInput): string {
  if (input.startLocal && input.endLocal) {
    const fromLocal = formatMeetingWindowFromLocal(
      input.startLocal,
      input.endLocal,
      input.timeZone,
      input.locale,
    );
    if (fromLocal) return fromLocal;
  }
  return formatMeetingWindowInZone(input.startAt, input.endAt, input.timeZone, input.locale);
}

function greeting(input: MeetingInviteEmailInput): string {
  const name = input.contactName?.trim();
  if (input.locale === "zh") {
    return name ? `${name} 您好，` : "您好，";
  }
  return name ? `Hi ${name},` : "Hello,";
}

export function buildMeetingInvitationEmail(input: MeetingInviteEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const when = formatMeetingWindow(input);
  const greet = greeting(input);
  const subjectFromOverride = input.subjectOverride?.trim();

  if (input.locale === "zh") {
    const subject = subjectFromOverride || `会议邀请：${input.title}`;
    const text = [
      greet,
      "",
      `诚邀您参加「${input.title}」在线会议。`,
      "",
      `时间：${when}`,
      `Google Meet：${input.meetLink}`,
      "",
      "请点击上方链接加入会议。如有时间冲突，请直接回复本邮件告知。",
      "",
      `此致`,
      input.organizerName,
    ].join("\n");

    const html = `
<p>${greet.replace(/,/g, "")}</p>
<p>诚邀您参加「<strong>${escapeHtml(input.title)}</strong>」在线会议。</p>
<table cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px;line-height:1.6">
  <tr><td style="color:#64748b;padding-right:12px;vertical-align:top">时间</td><td>${escapeHtml(when)}</td></tr>
  <tr><td style="color:#64748b;padding-right:12px;vertical-align:top">会议</td><td><a href="${escapeHtml(input.meetLink)}">${escapeHtml(input.meetLink)}</a></td></tr>
</table>
<p>请点击链接加入会议。如有时间冲突，请直接回复本邮件告知。</p>
<p style="margin-top:24px">此致<br>${escapeHtml(input.organizerName)}</p>
`.trim();

    return { subject, text, html };
  }

  const subject = subjectFromOverride || `Meeting invitation: ${input.title}`;
  const text = [
    greet,
    "",
    `You are invited to an online meeting: ${input.title}.`,
    "",
    `When: ${when}`,
    `Google Meet: ${input.meetLink}`,
    "",
    "Please use the link above to join. If the time does not work, reply to this email and we can reschedule.",
    "",
    "Best regards,",
    input.organizerName,
  ].join("\n");

  const html = `
<p>${escapeHtml(greet)}</p>
<p>You are invited to an online meeting: <strong>${escapeHtml(input.title)}</strong>.</p>
<table cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px;line-height:1.6">
  <tr><td style="color:#64748b;padding-right:12px;vertical-align:top">When</td><td>${escapeHtml(when)}</td></tr>
  <tr><td style="color:#64748b;padding-right:12px;vertical-align:top">Join</td><td><a href="${escapeHtml(input.meetLink)}">${escapeHtml(input.meetLink)}</a></td></tr>
</table>
<p>Please use the link above to join. If the time does not work, reply to this email and we can reschedule.</p>
<p style="margin-top:24px">Best regards,<br>${escapeHtml(input.organizerName)}</p>
`.trim();

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
