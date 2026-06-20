"use client";

import { useEffect, useState } from "react";
import { CRON_PRESETS } from "@/lib/cron";
import type { BuilderDeliveryPrefs } from "@/lib/builder-context-prompt";
import { useLocale, useMessages } from "@/lib/i18n";

type WecomOption = { chatId: string; label: string | null; partnerName: string | null };
type EmailOption = { id: string; name: string; email: string };
type PartnerOption = { id: string; name: string };

export function useBuilderDeliveryPrefs(defaultCron = "0 9 * * *") {
  const [prefs, setPrefs] = useState<BuilderDeliveryPrefs>({
    cronExpr: defaultCron,
    wecomChatId: "",
    wecomChatLabel: "",
    email: "",
    partnerId: "",
    partnerName: "",
  });
  const [wecomChats, setWecomChats] = useState<WecomOption[]>([]);
  const [emails, setEmails] = useState<EmailOption[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/builder-options");
        if (!res.ok) return;
        const data = (await res.json()) as {
          wecomChats: WecomOption[];
          emails: EmailOption[];
          partners: PartnerOption[];
        };
        if (cancelled) return;
        setWecomChats(data.wecomChats ?? []);
        setEmails(data.emails ?? []);
        setPartners(data.partners ?? []);
        setPrefs((p) => ({
          ...p,
          email: p.email || data.emails?.[0]?.email || "",
        }));
      } finally {
        /* loaded */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    prefs,
    setCronExpr: (cronExpr: string) => setPrefs((p) => ({ ...p, cronExpr })),
    setWecomChatId: (chatId: string) => {
      const chat = wecomChats.find((c) => c.chatId === chatId);
      setPrefs((p) => {
        const next: BuilderDeliveryPrefs = {
          ...p,
          wecomChatId: chatId,
          wecomChatLabel: chat ? formatWecomLabel(chat) : "",
        };
        if (chatId && chat?.partnerName && !p.partnerId) {
          const match = partners.find((x) => x.name === chat.partnerName);
          if (match) return { ...next, partnerId: match.id, partnerName: match.name };
        }
        return next;
      });
    },
    setEmail: (email: string) => setPrefs((p) => ({ ...p, email })),
    setPartnerId: (partnerId: string) => {
      const partner = partners.find((x) => x.id === partnerId);
      setPrefs((p) => ({
        ...p,
        partnerId,
        partnerName: partnerId ? partner?.name ?? "" : "",
      }));
    },
    wecomChats,
    emails,
    partners,
  };
}

function formatWecomLabel(c: WecomOption) {
  const parts = [c.partnerName, c.label].filter(Boolean);
  return parts.length ? parts.join(" · ") : c.chatId.slice(0, 12);
}

export function BuilderDeliveryBar({
  prefs,
  onCronChange,
  onWecomChange,
  onEmailChange,
  onPartnerChange,
  wecomChats,
  emails,
  partners,
  disabled,
}: {
  prefs: BuilderDeliveryPrefs;
  onCronChange: (cron: string) => void;
  onWecomChange: (chatId: string) => void;
  onEmailChange: (email: string) => void;
  onPartnerChange?: (partnerId: string) => void;
  wecomChats: WecomOption[];
  emails: EmailOption[];
  partners?: PartnerOption[];
  disabled?: boolean;
}) {
  const b = useMessages().builderCommon;
  const a = useMessages().automations;
  const locale = useLocale();
  const isZh = locale === "zh";
  const showPartner = !!onPartnerChange;

  const selectCls =
    "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:opacity-50";

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${showPartner ? "xl:grid-cols-4" : "xl:grid-cols-3"} gap-2`}>
      <div>
        <label className="block text-[10px] font-medium text-slate-500 mb-1">{b.scheduleLabel}</label>
        <select className={selectCls} value={prefs.cronExpr} disabled={disabled} onChange={(e) => onCronChange(e.target.value)}>
          {CRON_PRESETS.filter((p) => ["daily9", "daily18", "weekday9", "monday9"].includes(p.id)).map((p) => (
            <option key={p.id} value={p.expr}>
              {isZh ? p.labelZh : p.labelEn}
            </option>
          ))}
        </select>
      </div>
      {showPartner && (
        <div>
          <label className="block text-[10px] font-medium text-slate-500 mb-1">{a.monitorPartnerLabel}</label>
          <select
            className={selectCls}
            value={prefs.partnerId}
            disabled={disabled}
            onChange={(e) => onPartnerChange!(e.target.value)}
          >
            <option value="">{a.monitorPartnerAll}</option>
            {(partners ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-[10px] font-medium text-slate-500 mb-1">{b.wecomLabel}</label>
        <select className={selectCls} value={prefs.wecomChatId} disabled={disabled} onChange={(e) => onWecomChange(e.target.value)}>
          <option value="">{b.wecomNone}</option>
          {wecomChats.map((c) => (
            <option key={c.chatId} value={c.chatId}>
              {formatWecomLabel(c)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-[10px] font-medium text-slate-500 mb-1">{b.emailLabel}</label>
        <select className={selectCls} value={prefs.email} disabled={disabled} onChange={(e) => onEmailChange(e.target.value)}>
          <option value="">{b.emailNone}</option>
          {emails.map((u) => (
            <option key={u.id} value={u.email}>
              {u.name ? `${u.name} · ${u.email}` : u.email}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
