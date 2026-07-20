/** Parse / serialize ContractLineItem rows from form JSON. */

import { normalizeAmountInput, normalizeCurrency, type AmountCurrency } from "@/lib/amount";

export type ContractLineItemInput = {
  product: string;
  version: string | null;
  amount: string | null;
  currency: AmountCurrency | null;
  cycleYears: number | null;
};

export function emptyLineItem(currency?: string | null): ContractLineItemInput {
  return {
    product: "",
    version: null,
    amount: null,
    currency: normalizeCurrency(currency),
    cycleYears: 1,
  };
}

function parseCycleYears(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 99) return null;
  return rounded;
}

export function normalizeLineItem(raw: unknown): ContractLineItemInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const product = String(o.product ?? "").trim();
  if (!product) return null;
  return {
    product,
    version: String(o.version ?? "").trim() || null,
    amount: normalizeAmountInput(o.amount),
    currency: normalizeCurrency(o.currency),
    cycleYears: parseCycleYears(o.cycleYears),
  };
}

/** Read `lineItems` JSON from FormData; invalid → []. */
export function lineItemsFromFormData(formData: FormData): ContractLineItemInput[] {
  const raw = String(formData.get("lineItems") ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeLineItem).filter((x): x is ContractLineItemInput => !!x);
  } catch {
    return [];
  }
}

export function lineItemsToFormJson(
  items: Array<{
    product: string;
    version?: string | null;
    amount?: string | null;
    currency?: string | null;
    cycleYears?: number | null;
  }>
): string {
  return JSON.stringify(
    items.map((it) => ({
      product: it.product,
      version: it.version ?? "",
      amount: it.amount ?? "",
      currency: it.currency ?? "",
      cycleYears: it.cycleYears ?? "",
    }))
  );
}
