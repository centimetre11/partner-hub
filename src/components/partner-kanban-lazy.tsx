"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const PartnerKanbanBoard = dynamic(
  () => import("@/components/partner-kanban").then((m) => m.PartnerKanbanBoard),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-16 text-center text-sm text-slate-400">
        Loading board…
      </div>
    ),
  },
);

export function PartnerKanbanBoardLazy(props: ComponentProps<typeof PartnerKanbanBoard>) {
  return <PartnerKanbanBoard {...props} />;
}
