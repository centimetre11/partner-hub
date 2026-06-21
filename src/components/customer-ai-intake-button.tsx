"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "@/lib/i18n/context";
import { AiIntakePanel } from "@/components/ai-intake-panel";

export function CustomerAiIntakeButton({
  customerId,
  partnerId,
  label,
  variant = "soft",
  onDoneNavigate = "customer",
}: {
  customerId?: string;
  partnerId?: string | null;
  label?: string;
  variant?: "soft" | "primary" | "section";
  /** 新建完成后：跳转客户详情，或仅刷新当前页（伙伴详情用） */
  onDoneNavigate?: "customer" | "refresh";
}) {
  const router = useRouter();
  const messages = useMessages();
  const ai = messages.customers.ai;
  const [open, setOpen] = useState(false);

  const scope = customerId ? "customer_profile" : "new_customer";

  const btnClass =
    variant === "primary"
      ? "rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:opacity-90"
      : variant === "section"
        ? "rounded-lg border border-purple-200 bg-purple-50/60 text-purple-700 px-3 py-1.5 text-xs font-medium hover:bg-purple-50 shrink-0"
        : "rounded-lg border border-purple-200 bg-purple-50/60 text-purple-700 px-3 py-1.5 text-xs hover:bg-purple-50";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnClass}>
        {label ?? ai.aiButton}
      </button>
      {open && (
        <AiIntakePanel
          scope={scope}
          customerId={customerId}
          partnerId={partnerId ?? undefined}
          onClose={() => setOpen(false)}
          onDone={(id) => {
            setOpen(false);
            if (customerId) router.refresh();
            else if (onDoneNavigate === "refresh") router.refresh();
            else if (id) router.push(`/customers/${id}`);
            else router.refresh();
          }}
        />
      )}
    </>
  );
}
