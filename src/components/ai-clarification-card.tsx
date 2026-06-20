"use client";

import { useState } from "react";
import { isOpenEndedClarificationOption } from "@/lib/clarification-apply";
import { useLocale, useMessages } from "@/lib/i18n";

export type ClarificationItem = {
  id: string;
  question: string;
  options: string[];
  multi?: boolean;
  allowOther?: boolean;
  control?: "choice" | "select";
  placeholder?: string;
};

type Answer = { id: string; question: string; value: string };

const optionBtn =
  "flex w-full items-start gap-3 rounded-lg border px-4 py-3.5 min-h-[3.25rem] text-left text-sm transition-colors disabled:opacity-50";
const optionIdle = "border-slate-200 bg-slate-50/50 text-slate-700 hover:border-slate-300 hover:bg-white";
const optionActive = "border-slate-800 bg-slate-900 text-white";

/**
 * Cursor-style confirmation card — shared by Agent Builder and AI intake flows.
 * Supports batch submit (Continue) or immediate pick per option.
 */
export function AiClarificationCard({
  clarifications,
  title,
  hint,
  disabled,
  onContinue,
  onSkip,
  onImmediatePick,
  showSkip = true,
  continueLabel,
  variant = "default",
}: {
  clarifications: ClarificationItem[];
  title?: string;
  hint?: string;
  disabled?: boolean;
  onContinue?: (answers: Answer[]) => void;
  onSkip?: () => void;
  onImmediatePick?: (answer: Answer) => void;
  showSkip?: boolean;
  continueLabel?: string;
  variant?: "default" | "identity" | "direct" | "required";
}) {
  const m = useMessages();
  const ag = m.agents;
  const am = m.assistant;
  const cf = m.clarifications;
  const locale = useLocale();
  const immediate = !!onImmediatePick;

  const [picked, setPicked] = useState<Record<string, string>>({});
  const [multiPicked, setMultiPicked] = useState<Record<string, Set<string>>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});

  const cardTitle = title ?? ag.builderQuestionsTitle;
  const continueText = continueLabel ?? ag.builderContinue;

  function answerFor(c: ClarificationItem): string {
    const custom = otherText[c.id]?.trim();
    if (custom) return custom;
    if (c.multi) return [...(multiPicked[c.id] ?? [])].join(", ");
    return picked[c.id] ?? "";
  }

  function selectAnswered(c: ClarificationItem): boolean {
    if (otherText[c.id]?.trim()) return true;
    if (c.multi) return (multiPicked[c.id]?.size ?? 0) > 0;
    return Boolean(picked[c.id]?.trim());
  }

  const allAnswered = clarifications.every((c) =>
    c.control === "select" ? selectAnswered(c) : answerFor(c).length > 0
  );

  function presetOptions(c: ClarificationItem) {
    return c.options.filter((o) => !isOpenEndedClarificationOption(o));
  }

  function showOtherInput(c: ClarificationItem) {
    return c.allowOther !== false;
  }

  function fireImmediate(c: ClarificationItem, value: string) {
    if (!onImmediatePick || disabled || !value.trim()) return;
    onImmediatePick({ id: c.id, question: c.question, value: value.trim() });
    setPicked({});
    setOtherText({});
  }

  function pickOption(c: ClarificationItem, value: string) {
    if (disabled) return;
    setOtherText((prev) => ({ ...prev, [c.id]: "" }));
    if (c.multi) {
      setMultiPicked((prev) => {
        const set = new Set(prev[c.id] ?? []);
        if (set.has(value)) set.delete(value);
        else set.add(value);
        return { ...prev, [c.id]: set };
      });
      return;
    }
    if (immediate) {
      fireImmediate(c, value);
      return;
    }
    setPicked((prev) => ({ ...prev, [c.id]: value }));
  }

  function onOtherChange(c: ClarificationItem, value: string) {
    if (disabled) return;
    setOtherText((prev) => ({ ...prev, [c.id]: value }));
    if (value.trim()) {
      setPicked((prev) => {
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
      if (c.multi) {
        setMultiPicked((prev) => {
          const next = { ...prev };
          delete next[c.id];
          return next;
        });
      }
    }
  }

  function submitOther(c: ClarificationItem) {
    const text = otherText[c.id]?.trim();
    if (!text || disabled) return;
    if (immediate) fireImmediate(c, text);
    else setPicked((prev) => ({ ...prev, [c.id]: text }));
  }

  function submitContinue() {
    if (disabled || !allAnswered || !onContinue) return;
    const answers = clarifications.map((c) => ({
      id: c.id,
      question: c.question,
      value: answerFor(c),
    }));
    onContinue(answers);
    setPicked({});
    setMultiPicked({});
    setOtherText({});
  }

  const borderClass =
    variant === "identity"
      ? "border-amber-300"
      : variant === "direct"
        ? "border-emerald-200"
        : variant === "required"
          ? "border-orange-200"
          : "border-slate-200";
  const headerBg =
    variant === "identity"
      ? "bg-amber-50/80"
      : variant === "direct"
        ? "bg-emerald-50/80"
        : variant === "required"
          ? "bg-orange-50/80"
          : "bg-slate-50/80";

  const selectCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:opacity-50";

  if (!clarifications.length) return null;

  return (
    <div className={`w-full rounded-xl border ${borderClass} bg-white shadow-sm overflow-hidden`}>
      <div className={`flex items-center justify-between px-4 py-2.5 border-b border-slate-100 ${headerBg}`}>
        <div>
          <div className="text-xs font-semibold text-slate-700">{cardTitle}</div>
          {hint && <div className="text-[11px] text-slate-500 mt-0.5 font-normal">{hint}</div>}
        </div>
      </div>
      <div className="p-4 space-y-5">
        {clarifications.map((c) => {
          if (c.control === "select") {
            const value = picked[c.id] ?? "";
            const showManual = c.allowOther !== false;
            const manualOnly = c.options.length === 0;

            if (manualOnly) {
              return (
                <div key={c.id} className="space-y-2">
                  <label htmlFor={`clarify-${c.id}`} className="text-sm font-medium text-slate-800 leading-relaxed">
                    {c.question}
                  </label>
                  <input
                    id={`clarify-${c.id}`}
                    type={/email|邮箱/i.test(`${c.id} ${c.question}`) ? "email" : "text"}
                    disabled={disabled}
                    value={otherText[c.id] ?? ""}
                    onChange={(e) => onOtherChange(c, e.target.value)}
                    placeholder={c.placeholder ?? cf.manualInputHint}
                    className={selectCls}
                  />
                </div>
              );
            }

            return (
              <div key={c.id} className="space-y-2">
                <label htmlFor={`clarify-${c.id}`} className="text-sm font-medium text-slate-800 leading-relaxed">
                  {c.question}
                </label>
                {c.multi ? (
                  <select
                    id={`clarify-${c.id}`}
                    multiple
                    disabled={disabled}
                    value={[...(multiPicked[c.id] ?? [])]}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions, (o) => o.value);
                      setMultiPicked((prev) => ({ ...prev, [c.id]: new Set(selected) }));
                      setOtherText((prev) => ({ ...prev, [c.id]: "" }));
                    }}
                    className={`${selectCls} min-h-[7rem]`}
                  >
                    {c.options.map((opt) => (
                      <option key={`${c.id}-${opt}`} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    id={`clarify-${c.id}`}
                    disabled={disabled}
                    value={value}
                    onChange={(e) => {
                      setPicked((prev) => ({ ...prev, [c.id]: e.target.value }));
                      setOtherText((prev) => ({ ...prev, [c.id]: "" }));
                    }}
                    className={selectCls}
                  >
                    <option value="">{c.placeholder ?? cf.selectPlaceholder}</option>
                    {c.options.map((opt) => (
                      <option key={`${c.id}-${opt}`} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}
                {c.multi && (
                  <p className="text-[11px] text-slate-400">{cf.multiSelectHint}</p>
                )}
                {showManual && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] text-slate-500">
                      {/email|邮箱/i.test(`${c.id} ${c.question}`) ? cf.manualInputEmailHint : cf.manualInputHint}
                    </div>
                    <input
                      type={/email|邮箱/i.test(`${c.id} ${c.question}`) ? "email" : "text"}
                      disabled={disabled}
                      value={otherText[c.id] ?? ""}
                      onChange={(e) => onOtherChange(c, e.target.value)}
                      placeholder={am.clarifyOtherPlaceholder}
                      className={selectCls}
                    />
                  </div>
                )}
              </div>
            );
          }

          const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
          const opts = presetOptions(c);
          const hasOther = showOtherInput(c);
          const otherLetter = letters[opts.length] ?? "?";
          const otherActive = !!otherText[c.id]?.trim();

          return (
            <div key={c.id} className="space-y-2.5">
              <div className="text-sm font-medium text-slate-800 leading-relaxed">{c.question}</div>
              <div className="space-y-2">
                {opts.map((opt, idx) => {
                  const isRecommended = idx === 0 && !immediate;
                  const active = c.multi ? multiPicked[c.id]?.has(opt) : picked[c.id] === opt;
                  return (
                    <button
                      key={`${c.id}-${idx}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => pickOption(c, opt)}
                      className={`${optionBtn} ${active ? optionActive : optionIdle}`}
                    >
                      <span
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-semibold ${
                          active ? "bg-white/15 text-white" : "bg-white border border-slate-200 text-slate-500"
                        }`}
                      >
                        {letters[idx] ?? "?"}
                      </span>
                      <span className="flex-1 leading-relaxed whitespace-normal break-words text-[15px]">
                        {opt}
                        {isRecommended && (
                          <span className={`ml-1.5 text-xs ${active ? "text-white/80" : "text-sky-600"}`}>
                            ({ag.builderRecommended})
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
                {hasOther && (
                  <div
                    className={`${optionBtn} ${otherActive ? optionActive : optionIdle}`}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-semibold ${
                        otherActive ? "bg-white/15 text-white" : "bg-white border border-slate-200 text-slate-500"
                      }`}
                    >
                      {otherLetter}
                    </span>
                    <input
                      type="text"
                      value={otherText[c.id] ?? ""}
                      disabled={disabled}
                      onChange={(e) => onOtherChange(c, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          if (immediate) submitOther(c);
                          else if (allAnswered) submitContinue();
                        }
                      }}
                      placeholder={
                        locale === "zh" ? am.clarifyOtherPlaceholder || "其他，请填写…" : am.clarifyOtherPlaceholder || "Other — type here…"
                      }
                      className={`flex-1 min-w-0 bg-transparent border-0 p-0 text-[15px] leading-relaxed placeholder:opacity-60 focus:outline-none focus:ring-0 ${
                        otherActive ? "text-white placeholder:text-white/60" : "text-slate-800 placeholder:text-slate-400"
                      }`}
                    />
                    {immediate && (
                      <button
                        type="button"
                        disabled={disabled || !otherText[c.id]?.trim()}
                        onClick={() => submitOther(c)}
                        className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
                          otherActive
                            ? "bg-white/15 text-white hover:bg-white/25"
                            : "bg-slate-800 text-white hover:bg-slate-900"
                        }`}
                      >
                        {am.clarifyOtherConfirm}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!immediate && (
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50/50">
          {showSkip && onSkip && (
            <button
              type="button"
              disabled={disabled}
              onClick={onSkip}
              className="rounded-md px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-40"
            >
              {ag.builderSkip}
            </button>
          )}
          <button
            type="button"
            disabled={disabled || !allAnswered}
            onClick={submitContinue}
            className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-40"
          >
            {continueText}
            <span className="text-[10px] opacity-80">↵</span>
          </button>
        </div>
      )}
    </div>
  );
}
