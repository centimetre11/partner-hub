const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseEmailRecipients(raw: string): string[] {
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function validateEmailList(raw: string): { valid: string[]; invalid: string[] } {
  const list = parseEmailRecipients(raw);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const e of list) {
    if (EMAIL_RE.test(e)) valid.push(e);
    else invalid.push(e);
  }
  return { valid, invalid };
}

export function isValidEmail(raw: string): boolean {
  const trimmed = raw.trim();
  return !!trimmed && EMAIL_RE.test(trimmed);
}
