"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/lib/actions";
import { FeedbackFormModal } from "@/components/feedback-form-modal";
import { LocaleSwitcherSegmented } from "@/components/locale-switcher";
import { useAssistant } from "@/lib/assistant-context";
import { useMessages } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/locale";

function userInitial(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.slice(0, 1).toUpperCase();
}

export function SidebarFooter({
  user,
  locale,
  onNavigate,
}: {
  user: { name: string; email: string };
  locale: Locale;
  onNavigate?: () => void;
}) {
  const m = useMessages();
  const { openAssistant } = useAssistant();
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="mt-auto border-t border-slate-100 px-3 py-3 space-y-2">
      <button
        type="button"
        onClick={() => {
          openAssistant();
          onNavigate?.();
        }}
        className="flex w-full items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-white bg-slate-900 hover:bg-slate-800"
      >
        <span className="text-base w-5 text-center">✦</span>
        <span>{m.assistant.fabTitle}</span>
      </button>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label={m.shell.openUserMenu}
          className={`flex w-full items-center gap-2.5 px-2 py-2 rounded-md text-left ${
            menuOpen ? "bg-slate-100" : "hover:bg-slate-50"
          }`}
        >
          <div className="w-8 h-8 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-semibold shrink-0">
            {userInitial(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-900 truncate">{user.name}</div>
            <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`shrink-0 text-slate-400 ${menuOpen ? "rotate-180" : ""}`}
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-slate-200 bg-white py-1 z-10"
          >
            <Link
              href="/account"
              role="menuitem"
              onClick={() => {
                closeMenu();
                onNavigate?.();
              }}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {m.nav.account}
            </Link>

            <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-700 border-t border-slate-100">
              <span className="shrink-0">{m.shell.language}</span>
              <LocaleSwitcherSegmented locale={locale} />
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMenu();
                onNavigate?.();
                setFeedbackOpen(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 border-t border-slate-100"
            >
              {m.feedback.entryLabel}
            </button>

            <form action={logoutAction} className="border-t border-slate-100">
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              >
                {m.shell.signOut}
              </button>
            </form>
          </div>
        )}
      </div>

      <FeedbackFormModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
}
