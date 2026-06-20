"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type SectionNavItem = { id: string; label: string };

function useInnerScrollEnabled() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setEnabled(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return enabled;
}

export function SectionNavShell({
  nav,
  children,
  ariaLabel = "Page sections",
}: {
  nav: SectionNavItem[];
  children: ReactNode;
  ariaLabel?: string;
}) {
  const [activeId, setActiveId] = useState(nav[0]?.id ?? "");
  const contentRef = useRef<HTMLDivElement>(null);
  const ignoreSpy = useRef(false);
  const innerScroll = useInnerScrollEnabled();

  const scrollTo = useCallback((id: string) => {
    const container = contentRef.current;
    const el = document.getElementById(id);
    if (!el) return;

    setActiveId(id);
    ignoreSpy.current = true;

    const isLg = window.matchMedia("(min-width: 1024px)").matches;
    if (isLg && container) {
      const top = container.scrollTop + el.getBoundingClientRect().top - container.getBoundingClientRect().top - 8;
      container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    window.setTimeout(() => {
      ignoreSpy.current = false;
    }, 700);
  }, []);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const sections = nav
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => !!el);

    if (!sections.length) return;

    const root = innerScroll ? container : null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (ignoreSpy.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) setActiveId(visible[0].target.id);
      },
      {
        root,
        rootMargin: innerScroll ? "-4px 0px -58% 0px" : "-10% 0px -55% 0px",
        threshold: [0, 0.1, 0.25, 0.5],
      },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [nav, innerScroll]);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && nav.some((item) => item.id === hash)) {
      window.requestAnimationFrame(() => scrollTo(hash));
    }
  }, [nav, scrollTo]);

  return (
    <div
      className={`flex flex-col lg:flex-row gap-4 sm:gap-6 px-4 sm:px-6 lg:px-8 max-w-7xl ${
        innerScroll ? "lg:max-h-[calc(100dvh-10rem)] lg:min-h-0 lg:overflow-hidden" : ""
      }`}
    >
      <nav
        aria-label={ariaLabel}
        className="shrink-0 z-20 self-start sticky top-14 lg:top-0 lg:w-44 xl:w-48 lg:pt-1"
      >
        <div className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
          <div className="flex lg:flex-col gap-0.5 overflow-x-auto lg:overflow-visible pb-0.5 lg:pb-0 -mx-0.5 px-0.5 lg:mx-0 lg:px-0">
            {nav.map((item) => {
              const active = activeId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollTo(item.id)}
                  aria-current={active ? "true" : undefined}
                  className={`shrink-0 w-full text-left rounded-lg px-3 py-2 text-sm transition-colors whitespace-nowrap lg:whitespace-normal ${
                    active
                      ? "bg-slate-900 text-white font-medium"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
      <div
        ref={contentRef}
        className={`flex-1 min-w-0 space-y-12 pb-4 ${
          innerScroll ? "min-h-0 overflow-y-auto overscroll-y-contain pr-0.5" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function SectionNavGroup({
  id,
  title,
  desc,
  children,
}: {
  id: string;
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {desc ? <p className="text-sm text-slate-500 mt-1">{desc}</p> : null}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">{children}</div>
    </section>
  );
}
