"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "@/lib/i18n/context";
import { updatePartnerIntegrationsAction } from "@/lib/actions";
import { CrmCustomerPicker, type CrmCustomerOption } from "@/components/crm-customer-picker";

type BoundChat = {
  chatId: string;
  chatType: string;
  label: string | null;
} | null;

export function PartnerIntegrationsPanel({
  partnerId,
  partnerName,
  kmsRootPath,
  crmCustomerId,
  matchedCrmCustomer,
  boundChat,
}: {
  partnerId: string;
  partnerName: string;
  kmsRootPath: string | null;
  crmCustomerId: string | null;
  matchedCrmCustomer?: CrmCustomerOption | null;
  boundChat: BoundChat;
}) {
  const intg = useMessages().integrations;
  const router = useRouter();
  const [chatId, setChatId] = useState(boundChat?.chatId ?? "");
  const [chatLabel, setChatLabel] = useState(boundChat?.label ?? "");
  const [kms, setKms] = useState(kmsRootPath ?? "");
  const [crm, setCrm] = useState(crmCustomerId ?? "");
  const [crmCustomer, setCrmCustomer] = useState<CrmCustomerOption | null>(matchedCrmCustomer ?? null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function bindWecom() {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/wecom/chats/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chatId.trim(),
          partnerId,
          label: chatLabel.trim() || `${partnerName} 群`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "绑定失败");
      setMsg(intg.saved);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "绑定失败");
    } finally {
      setLoading(false);
    }
  }

  async function unbindWecom() {
    if (!boundChat) return;
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/wecom/chats/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: boundChat.chatId, partnerId: null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "解绑失败");
      setChatId("");
      setMsg(intg.saved);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "解绑失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveIntegrations(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      const fd = new FormData();
      fd.set("kmsRootPath", kms);
      fd.set("crmCustomerId", crm);
      await updatePartnerIntegrationsAction(partnerId, fd);
      setMsg(intg.saved);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  function handleCrmChange(id: string, customer?: CrmCustomerOption | null) {
    setCrm(id);
    setCrmCustomer(customer ?? null);
  }

  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <details className="rounded-xl border border-zinc-200 bg-white group">
      <summary className="px-4 py-3 text-sm font-semibold text-zinc-800 cursor-pointer list-none flex items-center justify-between">
        {intg.title}
        <span className="text-zinc-400 text-xs font-normal group-open:rotate-180 transition-transform">▼</span>
      </summary>
      <div className="px-4 pb-4 space-y-4 border-t border-zinc-100 pt-4 text-sm">
        <div className="space-y-2">
          <div className="text-xs font-medium text-zinc-700">{intg.wecomChatId}</div>
          <p className="text-xs text-zinc-500">{intg.wecomChatIdHint}</p>
          {boundChat ? (
            <div className="rounded-lg bg-zinc-50 p-2.5 text-xs font-mono break-all text-zinc-700">
              {boundChat.chatId}
              {boundChat.label && <span className="text-zinc-500 ml-2">({boundChat.label})</span>}
            </div>
          ) : (
            <input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="wrBcKOBgAA…"
              className={`${input} font-mono`}
            />
          )}
          {!boundChat && (
            <input
              value={chatLabel}
              onChange={(e) => setChatLabel(e.target.value)}
              placeholder={partnerName}
              className={input}
            />
          )}
          <div className="flex gap-2">
            {!boundChat ? (
              <button
                type="button"
                disabled={loading || !chatId.trim()}
                onClick={() => void bindWecom()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
              >
                保存绑定
              </button>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={() => void unbindWecom()}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600"
              >
                解绑
              </button>
            )}
          </div>
        </div>

        <form onSubmit={(e) => void saveIntegrations(e)} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-700">{intg.kmsRootPath}</span>
            <p className="text-xs text-zinc-500">{intg.kmsRootPathHint}</p>
            <input
              value={kms}
              onChange={(e) => setKms(e.target.value)}
              placeholder="https://kms.fineres.com/partners/beon-it/"
              className={input}
            />
          </label>
          <div className="space-y-1">
            <span className="text-xs font-medium text-zinc-700">{intg.crmCustomerId}</span>
            <p className="text-xs text-zinc-500">{intg.crmCustomerIdHint}</p>
            <CrmCustomerPicker
              value={crm}
              onChange={handleCrmChange}
              partnerId={partnerId}
              partnerName={partnerName}
              matchedCustomer={crmCustomer}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-white disabled:opacity-50"
          >
            {intg.save}
          </button>
        </form>

        {msg && <p className="text-xs text-indigo-600">{msg}</p>}
      </div>
    </details>
  );
}
