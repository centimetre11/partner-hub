"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** 全屏悬浮层：portal 到 body，占满视口，锁定背景滚动，避免穿透/闪烁 */
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

  // 仅在客户端 portal，并锁定 body 滚动
  useEffect(() => {
    setMounted(true);
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    // 补偿滚动条宽度，避免锁定时页面横向跳动
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, []);

  // ESC 关闭
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
        className="flex-1 min-h-0 m-1 sm:m-1.5 md:m-2 rounded-xl md:rounded-2xl overflow-hidden shadow-2xl bg-white ring-1 ring-white/20 overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
