"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMessages } from "@/lib/i18n/context";
import { getCrmActivationPayloadAction } from "@/lib/crm-actions";
import { fillCrmActivationViaBridge, getBridgeStatus } from "@/lib/browser-bridge";

export function CrmCreateViaBridgeButton({
  entityType,
  entityId,
}: {
  entityType: "partner" | "customer";
  entityId: string;
}) {
  const intg = useMessages().integrations;
  const [bridgeReady, setBridgeReady] = useState(false);
  const [bridgeSupportsCrm, setBridgeSupportsCrm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBridgeStatus().then((s) => {
      if (cancelled) return;
      setBridgeReady(s.available);
      setBridgeSupportsCrm(s.supportsCrmActivation);
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
      // 每次点击重新探测扩展（避免页面开久了状态过期）
      const status = await getBridgeStatus();
      setBridgeReady(status.available);
      setBridgeSupportsCrm(status.supportsCrmActivation);

      const payload = await getCrmActivationPayloadAction(entityType, entityId);
      if (!payload.ok) {
        setNotice({ kind: "error", text: payload.message || intg.crmCreateFailed });
        return;
      }

      if (status.supportsCrmActivation) {
        const result = await fillCrmActivationViaBridge({
          url: payload.url,
          fields: payload.fields,
        });
        if (result.ok && result.warning) {
          setNotice({ kind: "warn", text: `${intg.crmCreateDone} ${result.warning}` });
        } else if (result.ok) {
          setNotice({ kind: "ok", text: intg.crmCreateDone });
        } else {
          // 扩展一调用就会 chrome.tabs.create 打开填报表，此处绝不能再 window.open，
          // 否则超时/通信失败时会出现第二个空白「添加客户」页。
          setNotice({
            kind: "warn",
            text: `${intg.crmCreateOpenedManual}（${result.error || intg.crmCreateFailed}）请查看已打开的 CRM 标签页`,
          });
        }
        return;
      }

      // 无扩展或版本过旧：至少打开 CRM 填报表，并提示安装/升级
      window.open(payload.url, "_blank", "noopener,noreferrer");
      if (!status.available) {
        setNotice({ kind: "warn", text: intg.crmCreateOpenedNeedBridge });
      } else {
        setNotice({
          kind: "warn",
          text: intg.crmCreateOpenedNeedUpgrade.replace("{version}", status.version || "?"),
        });
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
        {(!bridgeReady || !bridgeSupportsCrm) && (
          <a
            href="/downloads/browser-bridge.zip"
            download
            className="text-xs text-sky-600 hover:underline"
          >
            {bridgeReady ? intg.crmCreateUpgradeBridge : intg.crmCreateInstallBridge}
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
              ? "rounded-md bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700"
              : notice.kind === "warn"
                ? "rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800"
                : "rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700"
          }
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
