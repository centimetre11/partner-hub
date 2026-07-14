"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMessages } from "@/lib/i18n/context";
import { getCrmActivationPayloadAction } from "@/lib/crm-actions";
import { fillCrmActivationViaBridge, isBridgeAvailable } from "@/lib/browser-bridge";

export function CrmCreateViaBridgeButton({
  entityType,
  entityId,
}: {
  entityType: "partner" | "customer";
  entityId: string;
}) {
  const intg = useMessages().integrations;
  const [bridgeReady, setBridgeReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    isBridgeAvailable().then((ok) => {
      if (!cancelled) setBridgeReady(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate() {
    if (loading) return;
    setLoading(true);
    setNotice(null);
    try {
      if (!bridgeReady) {
        setNotice({ kind: "error", text: intg.crmCreateNeedBridge });
        return;
      }

      const payload = await getCrmActivationPayloadAction(entityType, entityId);
      if (!payload.ok) {
        setNotice({ kind: "error", text: payload.message || intg.crmCreateFailed });
        return;
      }

      const result = await fillCrmActivationViaBridge({
        url: payload.url,
        fields: payload.fields,
      });

      if (result.ok && result.warning) {
        setNotice({ kind: "warn", text: `${intg.crmCreateDone} ${result.warning}` });
      } else if (result.ok) {
        setNotice({ kind: "ok", text: intg.crmCreateDone });
      } else {
        setNotice({ kind: "error", text: result.error || intg.crmCreateFailed });
      }
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : intg.crmCreateFailed,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleCreate()}
          className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-50"
        >
          {loading ? intg.crmCreateLoading : intg.crmCreateInCrm}
        </button>
        {!bridgeReady && (
          <a
            href="/downloads/browser-bridge.zip"
            download
            className="text-xs text-sky-600 hover:underline"
          >
            {intg.crmCreateInstallBridge}
          </a>
        )}
        <Link href="/account" className="text-xs text-slate-500 hover:underline">
          {intg.crmCreateBindSalesman}
        </Link>
      </div>
      <p className="text-xs text-slate-500">{intg.crmCreateHint}</p>
      {notice && (
        <p
          className={
            notice.kind === "ok"
              ? "text-xs text-emerald-600"
              : notice.kind === "warn"
                ? "text-xs text-amber-600"
                : "text-xs text-red-600"
          }
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
