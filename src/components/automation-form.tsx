"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CRON_PRESETS, describeCron } from "@/lib/cron";
import { upsertAutomationAction } from "@/lib/automation-actions";
import { useLocale, useMessages } from "@/lib/i18n/context";

const TIMEZONES = ["Asia/Shanghai", "Asia/Dubai", "Asia/Riyadh", "Europe/London", "America/New_York", "UTC"];

export type AutomationFormData = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  cronExpr: string;
  timezone: string;
  partnerId: string;
  wecomPushChatId: string;
  pushEmailTo: string;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  enabled: boolean;
};

type PartnerOption = { id: string; name: string };
type WecomOption = { chatId: string; label: string | null; partnerName: string | null };
type EmailOption = { id: string; name: string; email: string };

export function AutomationForm({
  initial,
  partners,
}: {
  initial: AutomationFormData;
  partners: PartnerOption[];
}) {
  const m = useMessages();
  const locale = useLocale();
  const a = m.automations;
  const bc = m.builderCommon;

  const [slug, setSlug] = useState(initial.slug);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [cronExpr, setCronExpr] = useState(initial.cronExpr);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [partnerId, setPartnerId] = useState(initial.partnerId || "");
  const [wecomPushChatId, setWecomPushChatId] = useState(initial.wecomPushChatId);
  const [pushEmailTo, setPushEmailTo] = useState(initial.pushEmailTo);
  const [notifyOnSuccess, setNotifyOnSuccess] = useState(initial.notifyOnSuccess);
  const [notifyOnFailure, setNotifyOnFailure] = useState(initial.notifyOnFailure);
  const [wecomChats, setWecomChats] = useState<WecomOption[]>([]);
  const [emails, setEmails] = useState<EmailOption[]>([]);

  useEffect(() => {
    void fetch("/api/builder-options")
      .then((r) => r.json())
      .then((data: { wecomChats: WecomOption[]; emails: EmailOption[]; partners?: PartnerOption[] }) => {
        setWecomChats(data.wecomChats ?? []);
        setEmails(data.emails ?? []);
        // 编辑已有自动化：严格保留库里的推送配置，不用默认值覆盖
        if (initial.id) return;
        if (!initial.pushEmailTo && data.emails?.[0]?.email) {
          setPushEmailTo(data.emails[0].email);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cronDesc = useMemo(() => describeCron(cronExpr, locale === "zh" ? "zh" : "en"), [cronExpr, locale]);

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400";
  const labelCls = "block text-xs font-medium text-slate-600 mb-1.5";

  function wecomLabel(c: WecomOption) {
    const parts = [c.partnerName, c.label].filter(Boolean);
    return parts.length ? parts.join(" · ") : c.chatId.slice(0, 16);
  }

  return (
    <form action={upsertAutomationAction} className="min-h-[calc(100vh-8rem)] flex flex-col">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="activate" value="on" />

      <div className="flex items-center justify-between gap-4 px-8 py-4 border-b border-slate-200/80 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/automations" className="text-slate-400 hover:text-slate-700 text-lg">
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900 truncate">
              {initial.id ? a.editTitle : a.createTitle}
            </h1>
            <p className="text-xs text-slate-400 truncate">{a.monitorFormDesc}</p>
          </div>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800 shrink-0"
        >
          {initial.id ? a.saveAndActivate : a.createAndActivate}
        </button>
      </div>

      <div className="flex-1 max-w-2xl px-8 py-6 space-y-6">
        <section className="rounded-xl border border-sky-100 bg-sky-50/40 p-4">
          <div className="text-sm font-semibold text-slate-800">{bc.initTitle}</div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{bc.initDesc}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{a.taskGoalLabel}</h2>
          <div>
            <label className={labelCls}>{a.taskGoalHint}</label>
            <textarea
              name="description"
              className={`${inputCls} min-h-[80px]`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={a.taskGoalPlaceholder}
              required
              rows={3}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{a.monitorPartner}</h2>
          <div>
            <label className={labelCls}>{a.monitorPartnerLabel}</label>
            <select
              name="partnerId"
              className={inputCls}
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
            >
              <option value="">{a.monitorPartnerAll}</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">{a.monitorPartnerAllHint}</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{a.triggerConfig}</h2>
          <div>
            <label className={labelCls}>{a.cronExpr}</label>
            <input name="cronExpr" className={inputCls} value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} />
            <p className="text-xs text-sky-600 mt-1">{cronDesc}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CRON_PRESETS.filter((p) => ["daily9", "daily18", "weekday9", "monday9"].includes(p.id)).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setCronExpr(p.expr)}
                className={`rounded-md px-2 py-1 text-xs border ${
                  cronExpr === p.expr ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {locale === "zh" ? p.labelZh : p.labelEn}
              </button>
            ))}
          </div>
          <div>
            <label className={labelCls}>{a.timezone}</label>
            <select name="timezone" className={inputCls} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{a.pushResults}</h2>
          <div>
            <label className={labelCls}>{bc.wecomLabel}</label>
            <select
              name="wecomPushChatId"
              className={inputCls}
              value={wecomPushChatId}
              onChange={(e) => {
                const chatId = e.target.value;
                setWecomPushChatId(chatId);
                const chat = wecomChats.find((c) => c.chatId === chatId);
                if (chat?.partnerName) {
                  const match = partners.find((p) => p.name === chat.partnerName);
                  if (match) setPartnerId(match.id);
                }
              }}
            >
              <option value="">{bc.wecomNone}</option>
              {wecomChats.map((c) => (
                <option key={c.chatId} value={c.chatId}>
                  {wecomLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{bc.emailLabel}</label>
            <select
              name="pushEmailTo"
              className={inputCls}
              value={pushEmailTo}
              onChange={(e) => setPushEmailTo(e.target.value)}
            >
              <option value="">{bc.emailNone}</option>
              {emails.map((u) => (
                <option key={u.id} value={u.email}>
                  {u.name ? `${u.name} · ${u.email}` : u.email}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{a.basicInfo}</h2>
          <div>
            <label className={labelCls}>{a.slugLabel}</label>
            <input name="slug" className={inputCls} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme-opportunities-daily" />
          </div>
          <div>
            <label className={labelCls}>{a.displayName}</label>
            <input name="name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={a.taskGoalPlaceholder} />
          </div>
        </section>

        <section className="space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" name="notifyOnSuccess" checked={notifyOnSuccess} onChange={(e) => setNotifyOnSuccess(e.target.checked)} className="mt-0.5" />
            <span className="text-sm text-slate-700">{a.notifySuccess}</span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" name="notifyOnFailure" checked={notifyOnFailure} onChange={(e) => setNotifyOnFailure(e.target.checked)} className="mt-0.5" />
            <span className="text-sm text-slate-700">{a.notifyFailure}</span>
          </label>
        </section>
      </div>
    </form>
  );
}
