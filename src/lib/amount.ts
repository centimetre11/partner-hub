/** Shared amount + currency helpers for Opportunity / Project / Contract. */

export const AMOUNT_CURRENCIES = ["CNY", "USD", "EUR", "SGD", "HKD"] as const;
export type AmountCurrency = (typeof AMOUNT_CURRENCIES)[number];

export const DEFAULT_AMOUNT_CURRENCY: AmountCurrency = "CNY";

const CURRENCY_SET = new Set<string>(AMOUNT_CURRENCIES);

/** Normalize ISO currency; unknown → null (caller may fall back to default for UI). */
export function normalizeCurrency(value: unknown): AmountCurrency | null {
  const code = String(value ?? "")
    .trim()
    .toUpperCase();
  if (!code) return null;
  return CURRENCY_SET.has(code) ? (code as AmountCurrency) : null;
}

/** Currency for UI select; empty/invalid → default CNY. */
export function currencyForInput(value: unknown): AmountCurrency {
  return normalizeCurrency(value) ?? DEFAULT_AMOUNT_CURRENCY;
}

/**
 * Normalize free-form amount input to a plain numeric string for storage.
 * Strips commas; rejects negatives and non-numeric text. Empty → null.
 */
export function normalizeAmountInput(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").replace(/\s+/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  // Keep integer look when possible; avoid trailing zeros from Number()
  if (cleaned.includes(".")) {
    const trimmed = cleaned.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
    return trimmed || "0";
  }
  return cleaned.replace(/^0+(?=\d)/, "") || "0";
}

/** Extract a numeric amount from free-text (legacy "50万", "120,000 USD", etc.). */
export function parseAmountNumber(amount: string | null | undefined): number | null {
  if (!amount?.trim()) return null;
  const cleaned = amount.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!cleaned) return null;
  const n = Number(cleaned[0]);
  return Number.isFinite(n) ? n : null;
}

export type AmountParts = {
  /** Value for the number input (plain digits or empty). */
  amount: string;
  currency: AmountCurrency;
};

/** Split stored amount + currency for form defaults. */
export function parseAmountParts(
  amount: string | null | undefined,
  currency: string | null | undefined
): AmountParts {
  const cur = currencyForInput(currency);
  if (!amount?.trim()) return { amount: "", currency: cur };
  const normalized = normalizeAmountInput(amount);
  if (normalized != null) return { amount: normalized, currency: cur };
  const n = parseAmountNumber(amount);
  if (n != null && n >= 0) {
    return {
      amount: Number.isInteger(n) ? String(n) : String(n),
      currency: cur,
    };
  }
  return { amount: "", currency: cur };
}

function formatNumberWithGrouping(n: number, locale: string): string {
  const loc = locale.startsWith("zh") ? "zh-CN" : "en-US";
  return new Intl.NumberFormat(loc, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(n);
}

/**
 * Display amount with currency. Legacy free-text (unparseable) shown as-is.
 * zh: `1,200,000 CNY` · en: `CNY 1,200,000`
 */
export function formatAmountDisplay(
  amount: string | null | undefined,
  currency: string | null | undefined,
  locale: string = "zh"
): string {
  if (!amount?.trim()) return "—";
  const n = parseAmountNumber(amount);
  const cur = normalizeCurrency(currency) ?? DEFAULT_AMOUNT_CURRENCY;
  if (n == null) return amount.trim();
  const num = formatNumberWithGrouping(n, locale);
  if (locale.startsWith("en")) return `${cur} ${num}`;
  return `${num} ${cur}`;
}

/** Format a numeric string with thousand separators for blur display. */
export function formatAmountTyping(value: string, locale: string = "zh"): string {
  const normalized = normalizeAmountInput(value);
  if (normalized == null) return value;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return value;
  return formatNumberWithGrouping(n, locale);
}

/**
 * Read amount + currency from FormData.
 * Supports `amountPreserve` so unparseable legacy free-text is not wiped on edit.
 */
export function amountAndCurrencyFromFormData(formData: FormData): {
  amount: string | null;
  currency: AmountCurrency | null;
} {
  const normalized = normalizeAmountInput(formData.get("amount"));
  if (normalized != null) {
    return {
      amount: normalized,
      currency: normalizeCurrency(formData.get("currency")) ?? DEFAULT_AMOUNT_CURRENCY,
    };
  }
  const preserve = String(formData.get("amountPreserve") ?? "").trim();
  if (preserve) {
    return {
      amount: preserve,
      currency: normalizeCurrency(formData.get("currency")),
    };
  }
  return { amount: null, currency: null };
}
