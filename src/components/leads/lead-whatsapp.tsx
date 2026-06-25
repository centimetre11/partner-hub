"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useMessages } from "@/lib/i18n/context";
import {
  DEFAULT_WHATSAPP_TEMPLATES_EN,
  DEFAULT_WHATSAPP_TEMPLATES_ZH,
  applyWhatsAppTemplate,
  buildWhatsAppLink,
  getGivenName,
  normalizeWhatsAppPhone,
  type WhatsAppTemplateVars,
} from "@/lib/whatsapp";

const STORAGE_KEY = "leads.whatsapp.templates.v1";

const chipClass =
  "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700 transition-all hover:border-emerald-300 hover:bg-emerald-100 active:scale-95";

export function LeadWhatsApp({
  phone,
  contName,
  companyName,
  city,
  country,
}: {
  phone: string | null;
  contName: string | null;
  companyName: string | null;
  city: string | null;
  country: string | null;
}) {
  const m = useMessages();
  const l = m.leads.whatsapp;
  const locale = useLocale();

  const defaults = useMemo(
    () => (locale === "en" ? DEFAULT_WHATSAPP_TEMPLATES_EN : DEFAULT_WHATSAPP_TEMPLATES_ZH),
    [locale],
  );

  const normalizedPhone = useMemo(() => normalizeWhatsAppPhone(phone), [phone]);
  const givenName = useMemo(() => getGivenName(contName), [contName]);

  const vars: WhatsAppTemplateVars = useMemo(
    () => ({
      name: givenName || (contName?.trim() ?? ""),
      company: companyName?.trim() ?? "",
      city: city?.trim() ?? "",
      country: country?.trim() ?? "",
    }),
    [givenName, contName, companyName, city, country],
  );

  const [templates, setTemplates] = useState<string[]>(defaults);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTemplates(parsed);
          return;
        }
      }
    } catch {
      // ignore，使用默认
    }
    setTemplates(defaults);
  }, [defaults]);

  const persist = (next: string[]) => {
    setTemplates(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const pickTemplate = (tpl: string) => {
    setMessage(applyWhatsAppTemplate(tpl, vars));
  };

  const openWhatsApp = () => {
    if (!normalizedPhone) return;
    const url = buildWhatsAppLink(normalizedPhone, message);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const startEdit = () => {
    setDraft(templates.join("\n"));
    setEditing(true);
  };

  const saveEdit = () => {
    const next = draft
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    persist(next.length > 0 ? next : defaults);
    setEditing(false);
  };

  const resetTemplates = () => {
    persist(defaults);
    setDraft(defaults.join("\n"));
  };

  if (!normalizedPhone) {
    return null;
  }

  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="text-sm font-medium text-emerald-800">
          {l.title}
          {givenName ? ` · ${givenName}` : ""}
        </div>
        <button
          type="button"
          onClick={editing ? saveEdit : startEdit}
          className="text-xs text-emerald-700 underline-offset-2 hover:underline"
        >
          {editing ? l.save : l.manage}
        </button>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-slate-500">{l.editHint}</p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder={l.editPlaceholder}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveEdit}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700"
            >
              {l.save}
            </button>
            <button
              type="button"
              onClick={resetTemplates}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              {l.reset}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {templates.map((tpl, i) => (
              <button key={i} type="button" className={chipClass} onClick={() => pickTemplate(tpl)}>
                {applyWhatsAppTemplate(tpl, vars).slice(0, 24)}…
              </button>
            ))}
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder={l.messagePlaceholder}
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={openWhatsApp}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 4.54 0 8.23 3.69 8.23 8.23s-3.69 8.24-8.23 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43-.14-.01-.31-.01-.48-.01-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z" />
              </svg>
              {l.open}
            </button>
            <span className="text-xs text-slate-400">{l.phoneLabel}: {phone}</span>
          </div>
        </>
      )}
    </div>
  );
}
