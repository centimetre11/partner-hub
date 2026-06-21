"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "@/lib/i18n/context";
import { AiIntakePanel } from "@/components/ai-intake-panel";

export function CustomerAiIntakeButton({
  customerId,
  partnerId,
  variant = "soft",
}: {
  customerId?: string;
  partnerId?: string | null;
  variant?: "soft" | "primary";
}) {
  const router = useRouter();
  const messages = useMessages();
  const ai = messages.customers.ai;
  const [open, setOpen] = useState(false);

  const scope = customerId ? "customer_profile" : "new_customer";

  const btnClass =
    variant === "primary"
      ? "rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:opacity-90"
      : "rounded-lg border border-purple-200 bg-purple-50/60 text-purple-700 px-3 py-1.5 text-xs hover:bg-purple-50";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnClass}>
        {ai.aiButton}
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
            else if (id) router.push(`/customers/${id}`);
            else router.refresh();
          }}
        />
      )}
    </>
  );
}
