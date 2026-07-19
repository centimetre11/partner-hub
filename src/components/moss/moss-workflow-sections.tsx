"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { useMessages } from "@/lib/i18n/context";
import { MossDossierPanel } from "@/components/moss/moss-dossier-panel";
import { MossCustomerDrawer } from "@/app/(app)/moss/moss-panel";
import type { MossDossier } from "@/lib/moss-dossier";

export function MossCustomerSection({
  customerId,
  entityName,
  creditCode,
  mossSyncedAt,
  initialDossier,
  configured,
}: {
  customerId: string;
  entityName: string;
  creditCode?: string | null;
  mossSyncedAt?: string | null;
  initialDossier?: MossDossier | null;
  configured: boolean;
}) {
  const m = useMessages();
  return (
    <Card title={m.moss.dossier.title}>
      <p className="text-xs text-slate-500 mb-4">{m.moss.dossier.customerDesc}</p>
      <MossDossierPanel
        entityName={entityName}
        creditCode={creditCode}
        customerId={customerId}
        initialDossier={initialDossier}
        mossSyncedAt={mossSyncedAt}
        configured={configured}
        showSearch={!creditCode}
      />
    </Card>
  );
}

export function MossLeadSection({
  entityName,
  configured,
}: {
  entityName?: string | null;
  configured: boolean;
}) {
  const m = useMessages();
  const name = entityName?.trim();
  if (!name) return null;

  return (
    <Card title={m.moss.dossier.leadTitle}>
      <p className="text-xs text-slate-500 mb-4">{m.moss.dossier.leadDesc}</p>
      <MossDossierPanel entityName={name} configured={configured} showSearch />
    </Card>
  );
}

export function MossPrepCustomerBadge({
  customerId,
  customerName,
  creditCode,
  mossFitLevel,
  mossSyncedAt,
  initialDossier,
  configured,
}: {
  customerId: string;
  customerName: string;
  creditCode?: string | null;
  mossFitLevel?: "hot" | "warm" | "neutral" | "unknown" | null;
  mossSyncedAt?: string | null;
  initialDossier?: MossDossier | null;
  configured: boolean;
}) {
  const m = useMessages();
  const [open, setOpen] = useState(false);

  if (!configured) return null;

  const label = mossFitLevel ? m.moss.dossier.fitLevel[mossFitLevel] : "Moss";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 hover:border-violet-300"
        title={m.moss.dossier.openDrawer}
      >
        {label}
        {mossSyncedAt ? ` · ${new Date(mossSyncedAt).toLocaleDateString()}` : ""}
      </button>
      <MossCustomerDrawer
        entityName={customerName}
        creditCode={creditCode}
        customerId={customerId}
        initialDossier={initialDossier}
        mossSyncedAt={mossSyncedAt}
        configured={configured}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
