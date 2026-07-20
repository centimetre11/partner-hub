"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useMessages } from "@/lib/i18n/context";
import { AiIntakePanel } from "@/components/ai-intake-panel";
import { profileEnrichSeedMessage } from "@/lib/intake-profile-enrich";

export function CustomerAiIntakeButton({
  customerId,
  partnerId,
  label,
  suffix,
  variant = "soft",
  className,
  onDoneNavigate = "customer",
  /** When enriching an existing customer, auto-run research from archive context */
  autoEnrich = false,
}: {
  customerId?: string;
  partnerId?: string | null;
  label?: string;
  suffix?: React.ReactNode;
  variant?: "soft" | "primary" | "section";
  className?: string;
  /** 新建完成后：跳转客户详情，或仅刷新当前页（伙伴详情用） */
  onDoneNavigate?: "customer" | "refresh";
  autoEnrich?: boolean;
}) {
  const router = useRouter();
  const locale = useLocale();
  const messages = useMessages();
  const ai = messages.customers.ai;
  const [open, setOpen] = useState(false);

  const scope = customerId ? "customer_profile" : "new_customer";
  const enrich = !!customerId && autoEnrich;

  const btnClass =
    variant === "primary"
      ? "rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:opacity-90"
      : variant === "section"
        ? "rounded-lg border border-purple-200 bg-purple-50/60 text-purple-700 px-3 py-1.5 text-xs font-medium hover:bg-purple-50 shrink-0"
        : "rounded-lg border border-purple-200 bg-purple-50/60 text-purple-700 px-3 py-1.5 text-xs hover:bg-purple-50";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? btnClass}>
        {label ?? (enrich ? ai.aiComplete : ai.aiButton)}
        {suffix}
      </button>
      {open && (
        <AiIntakePanel
          scope={scope}
          customerId={customerId}
          partnerId={partnerId ?? undefined}
          seedMessage={enrich ? profileEnrichSeedMessage(locale, "customer") : undefined}
          autoStart={enrich}
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
