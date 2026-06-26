"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

function LinkPendingOverlay() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span className="absolute inset-0 rounded-[inherit] bg-white/60 backdrop-blur-[1px] flex items-center justify-center pointer-events-none z-10">
      <span className="h-4 w-4 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
    </span>
  );
}

export function NavLink({ className = "", children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link className={`relative ${className}`} {...props}>
      {children}
      <LinkPendingOverlay />
    </Link>
  );
}
