"use client";

import { useRouter } from "next/navigation";
import { useMessages } from "@/lib/i18n/context";

/**
 * 统一的轻量返回按钮：优先返回浏览器历史上一级（即“进入下一级页面再返回”），
 * 无历史记录时回退到 fallbackHref。图标按钮，紧凑不独占一行。
 */
export function BackButton({
  fallbackHref,
  label,
  className = "",
}: {
  fallbackHref: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const m = useMessages();
  const text = label ?? m.common.back;

  const handleClick = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={text}
      aria-label={text}
      className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-95 ${className}`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="transition-transform group-hover:-translate-x-0.5"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>
  );
}
