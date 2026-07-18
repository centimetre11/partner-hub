"use client";

import type { Locale } from "./i18n/locale";
import { composeEmailViaBridge, isBridgeAvailable } from "./browser-bridge";
import { buildMeetingInvitationEmail } from "./meeting-invitation-email";
import { parseEmailRecipients } from "./email-recipients";

export type ComposeMeetingInviteInput = {
  to: string;
  cc?: string;
  subject: string;
  meetingTitle: string;
  startLocal: string;
  endLocal: string;
  startAt: Date;
  endAt: Date;
  timeZone: string;
  meetLink: string;
  customerName: string;
  contactName: string | null;
  organizerName: string;
  locale: Locale;
};

export type MeetingInviteEmailPreview = {
  subject: string;
  to: string;
  text: string;
  html: string;
};

export type ComposeMeetingInviteResult = {
  ok: boolean;
  viaBridge: boolean;
  warning?: string;
  error?: string;
};

/** 客户邀约邮件正文固定英文；抄送同事合并进收件人。 */
export function mergeInviteRecipients(to: string, cc?: string): string {
  const merged = [...parseEmailRecipients(to), ...(cc ? parseEmailRecipients(cc) : [])];
  return [...new Set(merged.map((e) => e.toLowerCase()))]
    .map((lower) => merged.find((e) => e.toLowerCase() === lower) ?? lower)
    .join(", ");
}

export function previewMeetingInvitationEmail(
  input: Omit<ComposeMeetingInviteInput, "locale"> & { meetLink: string },
): MeetingInviteEmailPreview {
  const content = buildMeetingInvitationEmail({
    title: input.meetingTitle,
    startAt: input.startAt,
    endAt: input.endAt,
    startLocal: input.startLocal,
    endLocal: input.endLocal,
    timeZone: input.timeZone,
    meetLink: input.meetLink,
    customerName: input.customerName,
    contactName: input.contactName,
    organizerName: input.organizerName,
    locale: "en",
    subjectOverride: input.subject,
  });
  return {
    subject: input.subject,
    to: mergeInviteRecipients(input.to, input.cc),
    text: content.text,
    html: content.html,
  };
}

function buildMailtoLink(to: string, subject: string, body: string): string {
  const parts: string[] = [];
  if (subject.trim()) parts.push(`subject=${encodeURIComponent(subject.trim())}`);
  if (body.trim()) parts.push(`body=${encodeURIComponent(body.trim())}`);
  const qs = parts.join("&");
  return qs ? `mailto:${encodeURIComponent(to)}?${qs}` : `mailto:${encodeURIComponent(to)}`;
}

function openMailtoCompose(to: string, subject: string, body: string): void {
  const a = document.createElement("a");
  a.href = buildMailtoLink(to, subject, body);
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function formatEmailClipboard(to: string, subject: string, body: string): string {
  const lines = [`To: ${to}`];
  if (subject.trim()) lines.push(`Subject: ${subject.trim()}`);
  lines.push("---");
  if (body.trim()) lines.push(body.trim());
  return lines.join("\n");
}

/** 打开企业邮「会议」写信页（或 mailto 降级）预填英文邀请。 */
export async function composeMeetingInviteEmail(
  input: ComposeMeetingInviteInput,
): Promise<ComposeMeetingInviteResult> {
  const preview = previewMeetingInvitationEmail(input);
  const allTo = preview.to;

  const bridgeReady = await isBridgeAvailable();
  if (bridgeReady) {
    const result = await composeEmailViaBridge({
      to: allTo,
      subject: preview.subject,
      body: preview.text,
      bodyHtml: preview.html,
      mode: "meeting",
      startLocal: input.startLocal,
      endLocal: input.endLocal,
      startAt: input.startAt.toISOString(),
      endAt: input.endAt.toISOString(),
      timeZone: input.timeZone,
    });
    return {
      ok: Boolean(result.ok),
      viaBridge: true,
      warning: result.warning,
      error: result.error,
    };
  }

  openMailtoCompose(allTo, preview.subject, preview.text);
  try {
    await navigator.clipboard.writeText(formatEmailClipboard(allTo, preview.subject, preview.text));
  } catch {
    // mailto 已预填；剪贴板失败可忽略
  }
  return { ok: true, viaBridge: false };
}
