"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { IntakeScope } from "@/lib/ai-intake";
import { AiIntakePanel } from "./ai-intake-panel";

export function AiAddButton({
  scope,
  partnerId,
  label = "✦ AI 加",
  variant = "ghost",
  className,
}: {
  scope: IntakeScope;
  partnerId?: string;
  label?: string;
  variant?: "ghost" | "solid" | "soft";
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const base =
    variant === "solid"
      ? "bg-indigo-600 text-white hover:bg-indigo-700"
      : variant === "soft"
        ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
        : "text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? `rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${base}`}
      >
        {label}
      </button>
      {open && (
        <AiIntakePanel
          scope={scope}
          partnerId={partnerId}
          onClose={() => setOpen(false)}
          onDone={
            scope === "new_partner"
              ? (id) => {
                  setOpen(false);
                  router.push(`/partners/${id}`);
                }
              : undefined
          }
        />
      )}
    </>
  );
}
