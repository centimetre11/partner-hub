"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/actions";
import { NavLinks } from "@/components/nav-links";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { isSuperAdmin } from "@/lib/user-roles";
import { useAssistant } from "@/lib/assistant-context";
import { FeedbackButton } from "@/components/feedback-form-modal";
import { useMessages } from "@/lib/i18n/context";
import { INBOX_NAV_ENABLED } from "@/lib/feature-flags";
import type { Locale } from "@/lib/i18n/locale";

export function AppShell({
  children,
  user,
  unread,
  locale,
}: {
  children: React.ReactNode;
  user: { name: string; email: string; role?: string | null };
  unread: number;
  locale: Locale;
}) {
  const m = useMessages();
  const { openAssistant } = useAssistant();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  return (
    <div className="flex min-h-screen min-h-dvh">
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 bg-white border-b border-slate-200 flex items-center gap-3 px-4 safe-top">
        <button
          type="button"
          onClick={() => setNavOpen((v) => !v)}
          className="flex items-center justify-center w-10 h-10 -ml-2 rounded-md text-slate-700 hover:bg-slate-100"
          aria-label={navOpen ? m.shell.closeMenu : m.shell.openMenu}
          aria-expanded={navOpen}
        >
          {navOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-md bg-slate-900 text-white flex items-center justify-center text-xs font-semibold shrink-0">
            F
          </div>
          <span className="text-sm font-medium text-slate-900 truncate">{m.app.title}</span>
        </div>
        {INBOX_NAV_ENABLED && unread > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-medium flex items-center justify-center shrink-0">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </header>

      {navOpen && (
        <button
          type="button"
          className="lg:hidden fixed inset-0 z-40 bg-slate-900/40"
          onClick={() => setNavOpen(false)}
          aria-label={m.shell.closeMenu}
        />
      )}

      <aside
        className={`w-[min(18rem,85vw)] lg:w-56 shrink-0 bg-white border-r border-slate-200 text-slate-600 flex flex-col fixed inset-y-0 z-50 safe-top safe-bottom ${
          navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="px-4 py-4 flex items-center gap-2.5 border-b border-slate-100">
          <div className="w-8 h-8 rounded-md bg-slate-900 text-white flex items-center justify-center text-sm font-semibold">
            F
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900 leading-tight">{m.app.title}</div>
            <div className="text-[10px] text-slate-400 truncate">{m.app.subtitle}</div>
          </div>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="lg:hidden ml-auto flex items-center justify-center w-8 h-8 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label={m.shell.closeMenu}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <NavLinks unread={unread} onNavigate={() => setNavOpen(false)} showTeamSettings={isSuperAdmin(user)} />
        <div className="mt-auto border-t border-slate-100 px-3 py-4 space-y-2">
          <FeedbackButton onOpen={() => setNavOpen(false)} />
          <button
            type="button"
            onClick={() => {
              openAssistant();
              setNavOpen(false);
            }}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-white bg-slate-900 hover:bg-slate-800"
          >
            <span className="text-base w-5 text-center">✦</span>
            <span>{m.assistant.fabTitle}</span>
          </button>
          <LocaleSwitcher locale={locale} />
          <Link
            href="/account"
            className="block text-xs text-slate-500 mb-2 truncate hover:text-slate-900"
          >
            {user.name} · {user.email}
          </Link>
          <form action={logoutAction}>
            <button className="text-xs text-slate-400 hover:text-slate-700">{m.shell.signOut}</button>
          </form>
        </div>
      </aside>

      <main className="app-main flex-1 lg:ml-56 min-w-0 max-w-full overflow-x-hidden pt-14 lg:pt-0 pb-safe">
        {children}
      </main>
    </div>
  );
}
