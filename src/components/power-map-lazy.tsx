"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const PowerMapSection = dynamic(
  () => import("@/components/power-map-flow").then((m) => m.PowerMapSection),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center text-sm text-slate-400">
        Loading map…
      </div>
    ),
  },
);

export function PowerMapLazy(props: ComponentProps<typeof PowerMapSection>) {
  return <PowerMapSection {...props} />;
}
