"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Lightweight modal portaled to document.body — avoids z-index / overflow traps in nested layouts. */
export function ModalPortal({
  children,
  onClose,
  zIndex = 70,
}: {
  children: ReactNode;
  onClose?: () => void;
  zIndex?: number;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
      className="fixed inset-0 flex items-center justify-center bg-black/30 p-4"
      style={{ zIndex }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>,
    document.body,
  );
}
