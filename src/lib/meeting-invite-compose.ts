"use client";

import type { Locale } from "./i18n/locale";
import { composeEmailViaBridge, isBridgeAvailable } from "./browser-bridge";
import { buildMeetingInvitationEmail } from "./meeting-invitation-email";

export type ComposeMeetingInviteInput = {
  to: string;
  cc?: string;
  subject: string;
  meetingTitle: string;
  startAt: Date;
  endAt: Date;
  timeZone: string;
  meetLink: string;
  customerName: string;
  contactName: string | null;
  organizerName: string;
  locale: Locale;
};

export type ComposeMeetingInviteResult = {
  ok: boolean;
  viaBridge: boolean;
  warning?: string;
  error?: string;
};

function buildMailtoLink(to: string, subject: string, body: string, cc?: string): string {
  const parts: string[] = [];
  if (subject.trim()) parts.push(`subject=${encodeURIComponent(subject.trim())}`);
  if (cc?.trim()) parts.push(`cc=${encodeURIComponent(cc.trim())}`);
  if (body.trim()) parts.push(`body=${encodeURIComponent(body.trim())}`);
  const qs = parts.join("&");
  return qs ? `mailto:${encodeURIComponent(to)}?${qs}` : `mailto:${encodeURIComponent(to)}`;
}

function openMailtoCompose(to: string, subject: string, body: string, cc?: string): void {
  const a = document.createElement("a");
  a.href = buildMailtoLink(to, subject, body, cc);
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function formatEmailClipboard(to: string, subject: string, body: string, cc?: string): string {
  const lines = [`收件人: ${to}`];
  if (cc?.trim()) lines.push(`抄送: ${cc.trim()}`);
  if (subject.trim()) lines.push(`主题: ${subject.trim()}`);
  lines.push("---");
  if (body.trim()) lines.push(body.trim());
  return lines.join("\n");
}

/** 会议创建成功后，打开企业邮（或 mailto）预填客户邀请邮件。 */
export async function composeMeetingInviteEmail(
  input: ComposeMeetingInviteInput,
): Promise<ComposeMeetingInviteResult> {
  const content = buildMeetingInvitationEmail({
    title: input.meetingTitle,
    startAt: input.startAt,
    endAt: input.endAt,
    timeZone: input.timeZone,
    meetLink: input.meetLink,
    customerName: input.customerName,
    contactName: input.contactName,
    organizerName: input.organizerName,
    locale: input.locale,
    subjectOverride: input.subject,
  });

  const bridgeReady = await isBridgeAvailable();
  if (bridgeReady) {
    const result = await composeEmailViaBridge({
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      body: content.text,
      bodyHtml: content.html,
    });
    return {
      ok: Boolean(result.ok),
      viaBridge: true,
      warning: result.warning,
      error: result.error,
    };
  }

  openMailtoCompose(input.to, input.subject, content.text, input.cc);
  try {
    await navigator.clipboard.writeText(
      formatEmailClipboard(input.to, input.subject, content.text, input.cc),
    );
  } catch {
    // mailto 已预填；剪贴板失败可忽略
  }
  return { ok: true, viaBridge: false };
}
