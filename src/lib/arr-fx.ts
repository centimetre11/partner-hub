/**
 * Fixed reporting rates for ARR → USD.
 * Not live FX — keep numbers stable for planning dashboards.
 */
import { normalizeCurrency, type AmountCurrency } from "@/lib/amount";

/** ARR is always reported in USD. */
export const ARR_REPORTING_CURRENCY = "USD" as const;

/**
 * Units of currency per 1 USD (approx.).
 * amount_usd = amount_native / RATE[currency]
 */
export const ARR_USD_RATES: Record<AmountCurrency, number> = {
  USD: 1,
  CNY: 7.2,
  EUR: 0.92,
  SGD: 1.35,
  HKD: 7.8,
};

/** Null/unknown currency on ARR contracts → treat as USD (MEA reporting default). */
export function arrCurrencyOrUsd(raw: string | null | undefined): AmountCurrency {
  return normalizeCurrency(raw) ?? "USD";
}

export function toArrUsd(amount: number, currency: string | null | undefined): number {
  if (!Number.isFinite(amount) || amount === 0) return 0;
  const code = arrCurrencyOrUsd(currency);
  const rate = ARR_USD_RATES[code] || 1;
  return amount / rate;
}
