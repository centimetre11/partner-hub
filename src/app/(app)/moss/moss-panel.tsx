"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { useMessages } from "@/lib/i18n/context";
import { MossDossierPanel } from "@/components/moss/moss-dossier-panel";
import type { MossDossier } from "@/lib/moss-dossier";

type Props = {
  configured: boolean;
  isAdmin: boolean;
};

export function MossPanel({ configured, isAdmin }: Props) {
  const m = useMessages();
  const L = m.moss;
  const [entityName, setEntityName] = useState("");

  if (!configured) {
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-5 text-sm text-amber-900">
        <p>{isAdmin ? L.notConfiguredAdmin : L.notConfigured}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">{L.query}</span>
          <input
            value={entityName}
            onChange={(e) => setEntityName(e.target.value)}
            placeholder={L.queryPlaceholder}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </label>
        <p className="mt-2 text-xs text-slate-500">{L.dossier.pageHint}</p>
      </div>

      {entityName.trim() ? (
        <Card title={L.dossier.title}>
          <MossDossierPanel
            entityName={entityName.trim()}
            configured={configured}
            showSearch
            showTestConnection
          />
        </Card>
      ) : (
        <p className="text-sm text-slate-400 py-8 text-center">{L.dossier.enterNameHint}</p>
      )}
    </div>
  );
}

export function MossCustomerDrawer({
  entityName,
  creditCode,
  customerId,
  initialDossier,
  mossSyncedAt,
  configured,
  open,
  onClose,
}: {
  entityName: string;
  creditCode?: string | null;
  customerId?: string;
  initialDossier?: MossDossier | null;
  mossSyncedAt?: string | null;
  configured: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const m = useMessages();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/30" aria-label="close" onClick={onClose} />
      <div className="relative h-full w-full max-w-xl overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">{m.moss.dossier.title}</div>
          <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">
            {m.common.back}
          </button>
        </div>
        <div className="p-4">
          <MossDossierPanel
            entityName={entityName}
            creditCode={creditCode}
            customerId={customerId}
            initialDossier={initialDossier}
            mossSyncedAt={mossSyncedAt}
            configured={configured}
            showSearch={!creditCode}
          />
        </div>
      </div>
    </div>
  );
}
