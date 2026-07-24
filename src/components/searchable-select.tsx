"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMessages } from "@/lib/i18n/context";

export type SearchableOption = {
  value: string;
  label: string;
  /** Secondary text shown next to the label and included in the search. */
  hint?: string;
  /** Optional group heading (works like <optgroup>). */
  group?: string;
};

type SearchableSelectProps = {
  options: SearchableOption[];
  /** Controlled selected value. Omit to use uncontrolled mode with `defaultValue`. */
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;
  /** When set, a hidden input is rendered so native <form> submission keeps working. */
  name?: string;
  /** Label for the empty ("") option, always shown on top and never filtered out. Omit to disallow clearing. */
  emptyLabel?: string;
  /** Text on the trigger when nothing is selected. Falls back to `emptyLabel`. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Applied to the outer wrapper — use for layout classes like grid col-span. */
  containerClassName?: string;
  /** Whether the control fills its container width. Set false inside horizontal filter bars. */
  fullWidth?: boolean;
  id?: string;
  "aria-label"?: string;
};

function normalize(text: string): string {
  return text.normalize("NFKD").toLowerCase().trim();
}

export function SearchableSelect({
  options,
  value,
  onChange,
  defaultValue = "",
  name,
  emptyLabel,
  placeholder,
  disabled,
  className,
  containerClassName,
  fullWidth = true,
  id,
  "aria-label": ariaLabel,
}: SearchableSelectProps) {
  const m = useMessages();
  const generatedId = useId();
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = controlled ? value : internalValue;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === selectedValue) ?? null,
    [options, selectedValue],
  );

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    return options.filter((o) => {
      const haystack = normalize(`${o.label} ${o.hint ?? ""} ${o.group ?? ""}`);
      return haystack.includes(q);
    });
  }, [options, query]);

  // Flat list of selectable entries (includes the empty option when allowed).
  const entries = useMemo(() => {
    const list: SearchableOption[] = [];
    if (emptyLabel !== undefined && !normalize(query)) {
      list.push({ value: "", label: emptyLabel });
    }
    list.push(...filtered);
    return list;
  }, [emptyLabel, filtered, query]);

  const commit = useCallback(
    (next: string) => {
      if (!controlled) setInternalValue(next);
      onChange?.(next);
      setOpen(false);
      setQuery("");
    },
    [controlled, onChange],
  );

  const openMenu = useCallback(() => {
    const idx = entries.findIndex((e) => e.value === selectedValue);
    setHighlight(idx >= 0 ? idx : 0);
    setOpen(true);
  }, [entries, selectedValue]);

  // Keep the highlight within the currently visible entries.
  const activeIndex = entries.length ? Math.min(highlight, entries.length - 1) : 0;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight(Math.min(activeIndex + 1, entries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = entries[activeIndex];
      if (entry) commit(entry.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  const triggerLabel = selectedOption
    ? selectedOption.label
    : selectedValue === "" && emptyLabel !== undefined
      ? emptyLabel
      : (placeholder ?? emptyLabel ?? "");
  const isPlaceholder = !selectedOption && !(selectedValue === "" && emptyLabel);

  const baseClass =
    className ??
    "box-border w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";

  let lastGroup: string | undefined;

  return (
    <div ref={rootRef} className={`relative min-w-0 ${fullWidth ? "w-full" : "inline-block"} ${containerClassName ?? ""}`}>
      {name && <input type="hidden" name={name} value={selectedValue} />}
      <button
        type="button"
        id={id ?? generatedId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          if (open) {
            setOpen(false);
            setQuery("");
          } else {
            openMenu();
          }
        }}
        onKeyDown={onKeyDown}
        className={`${baseClass} flex items-center justify-between gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed ${open ? "ring-2 ring-slate-400 outline-none" : ""}`}
      >
        <span className={`truncate ${isPlaceholder ? "text-slate-400" : "text-slate-800"}`}>
          {triggerLabel || "\u00a0"}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden
        >
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[12rem] rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="p-2">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={m.common.pickerSearch}
              className="box-border w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              autoComplete="off"
            />
          </div>
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-60 overflow-y-auto px-1 pb-1"
          >
            {entries.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-400">{m.common.pickerNoMatch}</li>
            ) : (
              entries.map((entry, idx) => {
                const showGroup = entry.group && entry.group !== lastGroup;
                lastGroup = entry.group;
                const active = idx === activeIndex;
                const selected = entry.value === selectedValue;
                return (
                  <div key={`${entry.value}-${idx}`}>
                    {showGroup && (
                      <li
                        aria-hidden
                        className="px-2.5 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400"
                      >
                        {entry.group}
                      </li>
                    )}
                    <li
                      role="option"
                      aria-selected={selected}
                      data-index={idx}
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => commit(entry.value)}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
                        active ? "bg-slate-100" : ""
                      } ${selected ? "font-medium text-slate-900" : "text-slate-700"}`}
                    >
                      <span className="truncate">
                        {entry.label}
                        {entry.hint ? (
                          <span className="ml-1 text-slate-400">· {entry.hint}</span>
                        ) : null}
                      </span>
                      {selected && (
                        <svg className="h-4 w-4 shrink-0 text-sky-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path
                            fillRule="evenodd"
                            d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.3 3.3 6.8-6.8a1 1 0 011.4 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </li>
                  </div>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
