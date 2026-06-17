"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/actions";
import { NavLinks } from "@/components/nav-links";

export function AppShell({
  children,
  user,
  unread,
}: {
  children: React.ReactNode;
  user: { name: string; email: string };
  unread: number;
}) {
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
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 bg-white/95 backdrop-blur-md border-b border-zinc-200/80 flex items-center gap-3 px-4 safe-top">
        <button
          type="button"
          onClick={() => setNavOpen((v) => !v)}
          className="flex items-center justify-center w-10 h-10 -ml-2 rounded-lg text-zinc-700 hover:bg-zinc-100 transition-colors"
          aria-label={navOpen ? "Close menu" : "Open menu"}
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
          <div className="w-7 h-7 rounded-lg bg-indigo-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
            F
          </div>
          <span className="text-sm font-semibold text-zinc-900 truncate">MEA Partner Hub</span>
        </div>
        {unread > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </header>

      {navOpen && (
        <button
          type="button"
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setNavOpen(false)}
          aria-label="Close menu"
        />
      )}

      <aside
        className={`w-[min(18rem,85vw)] lg:w-56 shrink-0 bg-zinc-900 text-zinc-300 flex flex-col fixed inset-y-0 z-50 transition-transform duration-200 ease-out safe-top safe-bottom ${
          navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-zinc-800">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 text-white flex items-center justify-center font-bold">
            F
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white leading-tight">MEA Partner Hub</div>
            <div className="text-[10px] text-zinc-500 truncate">Fanruan MEA Partner Hub</div>
          </div>
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            className="lg:hidden ml-auto flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            aria-label="Close menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <NavLinks unread={unread} onNavigate={() => setNavOpen(false)} />
        <div className="mt-auto border-t border-zinc-800 px-5 py-4">
          <div className="text-xs text-zinc-400 mb-2 truncate">
            {user.name} · {user.email}
          </div>
          <form action={logoutAction}>
            <button className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Sign out</button>
          </form>
        </div>
      </aside>

      <main className="app-main flex-1 lg:ml-56 min-w-0 max-w-full overflow-x-hidden pt-14 lg:pt-0 pb-safe">
        {children}
      </main>
    </div>
  );
}
