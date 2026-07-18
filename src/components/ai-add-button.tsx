"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { IntakeScope } from "@/lib/ai-intake";
import { AiIntakePanel } from "./ai-intake-panel";

export function AiAddButton({
  scope,
  partnerId,
  customerId,
  label = "✦ AI Add",
  suffix,
  variant = "ghost",
  className,
}: {
  scope: IntakeScope;
  partnerId?: string;
  customerId?: string;
  label?: string;
  suffix?: React.ReactNode;
  variant?: "ghost" | "solid" | "soft";
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const base =
    variant === "solid"
      ? "bg-slate-900 text-white hover:bg-slate-800"
      : variant === "soft"
        ? "bg-slate-50 text-sky-700 hover:bg-slate-100"
        : "text-sky-600 hover:text-sky-700 hover:bg-slate-50";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? `rounded-lg px-3 py-1.5 text-xs font-medium ${base}`}
      >
        {label}
        {suffix}
      </button>
      {open && (
        <AiIntakePanel
          scope={scope}
          partnerId={partnerId}
          customerId={customerId}
          onClose={() => setOpen(false)}
          onDone={
            scope === "new_partner"
              ? (id) => {
                  setOpen(false);
                  router.push(`/partners/${id}`);
                }
              : customerId
                ? () => {
                    setOpen(false);
                    router.refresh();
                  }
                : undefined
          }
        />
      )}
    </>
  );
}
