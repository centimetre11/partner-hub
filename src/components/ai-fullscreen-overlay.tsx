"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Full-screen overlay: portaled to body, fills viewport, locks background scroll, avoids bleed-through/flicker */
export function AiFullscreenOverlay({
  children,
  onClose,
  zIndex = 60,
}: {
  children: ReactNode;
  onClose?: () => void;
  zIndex?: number;
}) {
  const [mounted, setMounted] = useState(false);

  // Portal on client only, and lock body scroll
  useEffect(() => {
    setMounted(true);
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    // Compensate scrollbar width to avoid horizontal jump when locking scroll
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, []);

  // ESC to close
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col bg-black/50 backdrop-blur-[1px]"
      style={{ zIndex }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex-1 min-h-0 m-1 sm:m-1.5 md:m-2 rounded-lg md:rounded-lg overflow-hidden w-full border border-slate-200 bg-white ring-1 ring-white/20 overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
