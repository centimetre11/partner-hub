"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "@/lib/i18n/context";
import { updatePartnerIntegrationsAction } from "@/lib/actions";
import { CrmCustomerPicker, type CrmCustomerOption } from "@/components/crm-customer-picker";
import { WecomChatBindSection } from "@/components/wecom-chat-bind-section";

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
  const [kms, setKms] = useState(kmsRootPath ?? "");
  const [crm, setCrm] = useState(crmCustomerId ?? "");
  const [crmCustomer, setCrmCustomer] = useState<CrmCustomerOption | null>(matchedCrmCustomer ?? null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

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

  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-400";

  return (
    <details className="rounded-lg border border-slate-200 bg-white group">
      <summary className="px-4 py-3 text-sm font-semibold text-slate-800 cursor-pointer list-none flex items-center justify-between">
        {intg.title}
        <span className="text-slate-400 text-xs font-normal group-open:rotate-180">▼</span>
      </summary>
      <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-4 text-sm">
        <WecomChatBindSection
          entityType="partner"
          entityId={partnerId}
          entityName={partnerName}
          boundChat={boundChat}
        />

        <form onSubmit={(e) => void saveIntegrations(e)} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">{intg.kmsRootPath}</span>
            <p className="text-xs text-slate-500">{intg.kmsRootPathHint}</p>
            <input
              value={kms}
              onChange={(e) => setKms(e.target.value)}
              placeholder="https://kms.fineres.com/partners/beon-it/"
              className={input}
            />
          </label>
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-700">{intg.crmCustomerId}</span>
            <p className="text-xs text-slate-500">{intg.crmCustomerIdHint}</p>
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
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-white disabled:opacity-50"
          >
            {intg.save}
          </button>
        </form>

        {msg && <p className="text-xs text-sky-600">{msg}</p>}
      </div>
    </details>
  );
}
