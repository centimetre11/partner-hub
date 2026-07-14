"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

function shouldIgnore(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("a, button, input, select, textarea, label, [data-no-nav]"));
}

/** Table row: click empty area navigates; nested links/buttons still work. */
export function ClickableRow({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();

  const go = () => router.push(href);

  return (
    <tr
      role="link"
      tabIndex={0}
      className={`cursor-pointer ${className}`}
      onClick={(e: MouseEvent) => {
        if (shouldIgnore(e.target)) return;
        go();
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      }}
    >
      {children}
    </tr>
  );
}

/** Block card: click empty area navigates; nested links/buttons still work. */
export function ClickableCard({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();

  const go = () => router.push(href);

  return (
    <div
      role="link"
      tabIndex={0}
      className={`cursor-pointer ${className}`}
      onClick={(e: MouseEvent) => {
        if (shouldIgnore(e.target)) return;
        go();
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      }}
    >
      {children}
    </div>
  );
}
