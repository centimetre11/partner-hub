"use client";

import { useEffect, useId, useState } from "react";
import {
  AMOUNT_CURRENCIES,
  type AmountCurrency,
  currencyForInput,
  formatAmountTyping,
  normalizeAmountInput,
  parseAmountParts,
} from "@/lib/amount";

type AmountInputProps = {
  className?: string;
  /** Visual class for the number input and currency select. */
  inputClassName: string;
  amountPlaceholder?: string;
  currencyAriaLabel?: string;
  amountAriaLabel?: string;
  locale?: string;
  disabled?: boolean;
  /** Uncontrolled defaults (FormData forms). */
  defaultAmount?: string | null;
  defaultCurrency?: string | null;
  /** Controlled mode (e.g. contract form with live maint estimate). */
  amount?: string;
  currency?: string;
  onAmountChange?: (amount: string) => void;
  onCurrencyChange?: (currency: AmountCurrency) => void;
  nameAmount?: string;
  nameCurrency?: string;
};

export function AmountInput({
  className,
  inputClassName,
  amountPlaceholder,
  currencyAriaLabel = "Currency",
  amountAriaLabel = "Amount",
  locale = "zh",
  disabled,
  defaultAmount,
  defaultCurrency,
  amount: controlledAmount,
  currency: controlledCurrency,
  onAmountChange,
  onCurrencyChange,
  nameAmount = "amount",
  nameCurrency = "currency",
}: AmountInputProps) {
  const isControlled = controlledAmount !== undefined;
  const parts = parseAmountParts(defaultAmount, defaultCurrency);
  const legacyPreserve =
    defaultAmount?.trim() && normalizeAmountInput(defaultAmount) == null ? defaultAmount.trim() : "";
  const [innerAmount, setInnerAmount] = useState(parts.amount);
  const [innerCurrency, setInnerCurrency] = useState<AmountCurrency>(parts.currency);
  const [display, setDisplay] = useState(() => {
    if (parts.amount) return formatAmountTyping(parts.amount, locale);
    if (legacyPreserve) return legacyPreserve;
    return "";
  });
  const [focused, setFocused] = useState(false);
  const [preserve, setPreserve] = useState(legacyPreserve);
  const amountId = useId();

  const amountValue = isControlled ? controlledAmount ?? "" : innerAmount;
  const currencyValue = isControlled
    ? currencyForInput(controlledCurrency)
    : innerCurrency;

  useEffect(() => {
    if (focused) return;
    const raw = isControlled ? controlledAmount ?? "" : innerAmount;
    if (raw) {
      setDisplay(formatAmountTyping(raw, locale));
      return;
    }
    if (preserve && !isControlled) setDisplay(preserve);
    else setDisplay("");
  }, [controlledAmount, innerAmount, isControlled, focused, locale, preserve]);

  function setAmount(next: string) {
    if (isControlled) onAmountChange?.(next);
    else setInnerAmount(next);
  }

  function setCurrency(next: AmountCurrency) {
    if (isControlled) onCurrencyChange?.(next);
    else setInnerCurrency(next);
  }

  function handleFocus() {
    setFocused(true);
    if (amountValue) setDisplay(amountValue);
    else if (preserve) setDisplay(preserve);
    else setDisplay("");
  }

  function handleBlur() {
    setFocused(false);
    const normalized = normalizeAmountInput(display);
    if (normalized != null) {
      setAmount(normalized);
      setPreserve("");
      setDisplay(formatAmountTyping(normalized, locale));
    } else if (!display.trim()) {
      setAmount("");
      setPreserve("");
      setDisplay("");
    } else if (preserve && display.trim() === preserve) {
      setAmount("");
      setDisplay(preserve);
    } else {
      setDisplay(display);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setDisplay(v);
    const normalized = normalizeAmountInput(v);
    if (normalized != null) {
      setAmount(normalized);
      setPreserve("");
    } else if (!v.trim()) {
      setAmount("");
      setPreserve("");
    }
  }

  const submitAmount = normalizeAmountInput(amountValue) ?? "";
  const submitPreserve =
    !submitAmount &&
    (preserve ||
      (isControlled && amountValue.trim() && normalizeAmountInput(amountValue) == null
        ? amountValue.trim()
        : ""));

  return (
    <div className={className ?? "grid grid-cols-[minmax(0,1fr)_4.75rem] gap-1.5 w-full min-w-0"}>
      <input type="hidden" name={nameAmount} value={submitAmount} readOnly />
      {submitPreserve ? (
        <input type="hidden" name="amountPreserve" value={submitPreserve} readOnly />
      ) : null}
      <input
        id={amountId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        aria-label={amountAriaLabel}
        placeholder={amountPlaceholder ?? "0.00"}
        value={display}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        className={`${inputClassName} w-full min-w-0 tabular-nums`}
      />
      <select
        name={nameCurrency}
        disabled={disabled}
        aria-label={currencyAriaLabel}
        value={currencyValue}
        onChange={(e) => setCurrency(currencyForInput(e.target.value))}
        className={`${inputClassName} w-full shrink-0`}
      >
        {AMOUNT_CURRENCIES.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </div>
  );
}
