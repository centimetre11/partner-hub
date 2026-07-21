import "server-only";
import { sendEmail } from "../email";
import { isEmailServiceConfigured, resolveEmailConfig } from "../email-config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmailRecipients(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function runSendEmailTool(
  args: Record<string, unknown>,
  ctx: { actions: string[] },
): Promise<string> {
  if (!(await isEmailServiceConfigured())) {
    return "Email service not configured. Set up Exmail SMTP in Team Settings → Email service.";
  }
  const toRaw = String(args.to ?? "").trim();
  const subject = String(args.subject ?? "").trim();
  const body = String(args.body ?? "").trim();
  const html = args.html ? String(args.html).trim() : undefined;
  if (!toRaw) return "Please provide recipient email (to)";
  if (!subject) return "Please provide subject";
  if (!body && !html) return "Please provide body or html";

  const recipients = parseEmailRecipients(toRaw);
  const invalid = recipients.filter((e) => !EMAIL_RE.test(e));
  if (!recipients.length) return "Please provide at least one valid recipient email";
  if (invalid.length) return `Invalid email address(es): ${invalid.join(", ")}`;

  const ccRaw = args.cc ? String(args.cc).trim() : "";
  const ccRecipients = ccRaw ? parseEmailRecipients(ccRaw) : [];
  const ccInvalid = ccRecipients.filter((e) => !EMAIL_RE.test(e));
  if (ccInvalid.length) return `Invalid CC email address(es): ${ccInvalid.join(", ")}`;

  const config = await resolveEmailConfig();
  await sendEmail(
    {
      to: recipients,
      ...(ccRecipients.length ? { cc: ccRecipients } : {}),
      subject,
      text: body || undefined,
      html: html || undefined,
    },
    config ?? undefined,
  );
  const ccNote = ccRecipients.length ? `, cc: ${ccRecipients.join(", ")}` : "";
  const msg = `Email sent to ${recipients.join(", ")}${ccNote} (subject: ${subject.slice(0, 80)}${subject.length > 80 ? "…" : ""})`;
  ctx.actions.push(msg);
  return msg;
}
