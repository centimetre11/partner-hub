"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importKnownClientsAction } from "@/lib/customer-actions";
import { useMessages } from "@/lib/i18n/context";

export function ImportKnownClientsButton({
  partnerId,
  knownClients,
}: {
  partnerId: string;
  knownClients: string | null;
}) {
  const m = useMessages();
  const s = m.segments;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  if (!knownClients?.trim()) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            try {
              const r = await importKnownClientsAction(partnerId);
              setResult(
                s.importResult
                  .replace("{created}", String(r.created))
                  .replace("{linked}", String(r.linked))
                  .replace("{skipped}", String(r.skipped)),
              );
              router.refresh();
            } catch {
              setResult(s.importFailed);
            }
          });
        }}
        className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-3 py-1.5 text-xs font-medium hover:bg-emerald-100 disabled:opacity-60"
      >
        {pending ? m.common.loading : s.importKnownClients}
      </button>
      {result && <span className="text-xs text-slate-500">{result}</span>}
    </div>
  );
}
