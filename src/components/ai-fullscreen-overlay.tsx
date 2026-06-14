"use client";

import type { ReactNode } from "react";

/** 全屏悬浮层：占满视口，仅留极小边距 */
export function AiFullscreenOverlay({
  children,
  onClose,
  zIndex = 60,
}: {
  children: ReactNode;
  onClose?: () => void;
  zIndex?: number;
}) {
  return (
    <div
      className="fixed inset-0 flex flex-col bg-black/50 backdrop-blur-[1px]"
      style={{ zIndex }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex-1 min-h-0 m-1 sm:m-1.5 md:m-2 rounded-xl md:rounded-2xl overflow-hidden shadow-2xl bg-white ring-1 ring-white/20"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
