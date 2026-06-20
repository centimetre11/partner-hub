"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CRON_PRESETS, describeCron } from "@/lib/cron";
import { upsertAutomationAction } from "@/lib/automation-actions";
import type { AutomationVariable } from "@/lib/automation-builder-types";
import { useMessages, useLocale } from "@/lib/i18n/context";

const TIMEZONES = [
  "Asia/Shanghai",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Europe/London",
  "America/New_York",
  "UTC",
];

const VALIDITY_OPTIONS = [1, 3, 7, 14, 30, 90];

export type AutomationFormData = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  taskMd: string;
  triggerType: "SCHEDULE" | "WEBHOOK" | "EVENT";
  cronExpr: string;
  timezone: string;
  validityDays: number;
  variables: AutomationVariable[];
  maxIterations: number;
  timeoutMinutes: number;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  wecomPushChatId: string;
  webhookUrl: string;
  enabled: boolean;
};

type Tab = "design" | "exec";

export function AutomationForm({ initial }: { initial: AutomationFormData }) {
  const m = useMessages();
  const locale = useLocale();
  const a = m.automations;

  const [tab, setTab] = useState<Tab>("design");
  const [slug, setSlug] = useState(initial.slug);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [taskMd, setTaskMd] = useState(initial.taskMd);
  const [triggerType, setTriggerType] = useState(initial.triggerType);
  const [cronExpr, setCronExpr] = useState(initial.cronExpr);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [validityDays, setValidityDays] = useState(initial.validityDays);
  const [variables, setVariables] = useState<AutomationVariable[]>(initial.variables);
  const [maxIterations, setMaxIterations] = useState(initial.maxIterations);
  const [timeoutMinutes, setTimeoutMinutes] = useState(initial.timeoutMinutes);
  const [notifyOnSuccess, setNotifyOnSuccess] = useState(initial.notifyOnSuccess);
  const [notifyOnFailure, setNotifyOnFailure] = useState(initial.notifyOnFailure);
  const [wecomPushChatId, setWecomPushChatId] = useState(initial.wecomPushChatId);
  const [webhookUrl, setWebhookUrl] = useState(initial.webhookUrl);

  const cronDesc = useMemo(() => {
    const isZh = typeof document !== "undefined" && document.documentElement.lang.startsWith("zh");
    return describeCron(cronExpr, isZh ? "zh" : "en");
  }, [cronExpr]);

  function addVariable() {
    setVariables((v) => [...v, { key: "", value: "", label: "" }]);
  }

  function updateVariable(i: number, patch: Partial<AutomationVariable>) {
    setVariables((v) => v.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }

  function removeVariable(i: number) {
    setVariables((v) => v.filter((_, idx) => idx !== i));
  }

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400";
  const labelCls = "block text-xs font-medium text-slate-600 mb-1.5";

  return (
    <form action={upsertAutomationAction} className="min-h-[calc(100vh-8rem)] flex flex-col">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="variables" value={JSON.stringify(variables)} />
      <input type="hidden" name="activate" value="on" />

      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-8 py-4 border-b border-slate-200/80 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/automations" className="text-slate-400 hover:text-slate-700 text-lg">
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900 truncate">
              {initial.id ? a.editTitle : a.createTitle}
            </h1>
            {slug && <p className="text-xs text-slate-400 truncate">{slug}</p>}
          </div>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800 shrink-0"
        >
          {initial.id ? a.saveAndActivate : a.createAndActivate}
        </button>
      </div>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Left sidebar */}
        <aside className="w-full lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200/80 bg-slate-50/50 p-6 space-y-6">
          <section>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{a.basicInfo}</h2>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{a.slugLabel}</label>
                <input
                  name="slug"
                  className={inputCls}
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/gi, "-").toLowerCase())}
                  placeholder="gold-price-monitor"
                  required
                />
              </div>
              <div>
                <label className={labelCls}>{a.displayName}</label>
                <input name="name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>{a.descriptionLabel}</label>
                <textarea
                  name="description"
                  className={`${inputCls} min-h-[72px] resize-y`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{a.triggerConfig}</h2>
            <input type="hidden" name="triggerType" value={triggerType} />
            <div className="space-y-2">
              {(
                [
                  { id: "SCHEDULE" as const, icon: "🕐", title: a.triggerSchedule, desc: a.triggerScheduleDesc },
                  { id: "WEBHOOK" as const, icon: "🔌", title: a.triggerWebhook, desc: a.triggerWebhookDesc },
                  { id: "EVENT" as const, icon: "⚡", title: a.triggerEvent, desc: a.triggerEventDesc },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTriggerType(opt.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    triggerType === opt.id
                      ? "border-sky-300 bg-sky-50/80 ring-1 ring-sky-200"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-base">{opt.icon}</span>
                    <div>
                      <div className="text-sm font-medium text-slate-800">{opt.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {triggerType === "SCHEDULE" && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className={labelCls}>{a.cronExpr}</label>
                  <input name="cronExpr" className={inputCls} value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} />
                  <p className="text-xs text-sky-600 mt-1">{cronDesc}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CRON_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setCronExpr(p.expr)}
                      className={`rounded-md px-2 py-1 text-xs border ${
                        cronExpr === p.expr
                          ? "border-sky-400 bg-sky-50 text-sky-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
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
                <div>
                  <label className={labelCls}>{a.validityDays}</label>
                  <select
                    name="validityDays"
                    className={inputCls}
                    value={validityDays}
                    onChange={(e) => setValidityDays(parseInt(e.target.value, 10))}
                  >
                    {VALIDITY_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {a.validityDaysOption.replace("{n}", String(d))}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {triggerType === "WEBHOOK" && (
              <div className="mt-4">
                <label className={labelCls}>{a.inboundWebhook}</label>
                <input
                  name="webhookUrl"
                  className={inputCls}
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder={a.webhookPlaceholder}
                />
                {initial.id && slug && (
                  <p className="text-xs text-slate-500 mt-2">
                    {a.webhookEndpointHint.replace("{slug}", slug)}
                  </p>
                )}
              </div>
            )}

            {triggerType === "EVENT" && (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                {a.eventComingSoon}
              </p>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{a.variables}</h2>
              <button type="button" onClick={addVariable} className="text-xs text-sky-600 hover:underline">
                + {a.addVariable}
              </button>
            </div>
            {variables.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-400 text-center">
                {a.noVariables}
              </div>
            ) : (
              <div className="space-y-2">
                {variables.map((v, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <input
                      className={`${inputCls} flex-1`}
                      placeholder={a.varKey}
                      value={v.key}
                      onChange={(e) => updateVariable(i, { key: e.target.value })}
                    />
                    <input
                      className={`${inputCls} flex-1`}
                      placeholder={a.varValue}
                      value={v.value}
                      onChange={(e) => updateVariable(i, { value: e.target.value })}
                    />
                    <button type="button" onClick={() => removeVariable(i)} className="text-slate-400 hover:text-red-500 px-1">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>

        {/* Main area */}
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex border-b border-slate-200/80 px-6 pt-4 gap-1">
            <button
              type="button"
              onClick={() => setTab("design")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px ${
                tab === "design" ? "border-sky-600 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {a.tabDesign}
            </button>
            <button
              type="button"
              onClick={() => setTab("exec")}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px ${
                tab === "exec" ? "border-sky-600 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {a.tabExec}
            </button>
          </div>

          <div className="flex-1 p-6">
            {tab === "design" && (
              <div className="h-full flex flex-col">
                <p className="text-xs text-slate-500 mb-2">{a.taskMdHint}</p>
                <textarea
                  name="taskMd"
                  className="flex-1 min-h-[420px] w-full rounded-lg border border-slate-200 bg-slate-950 text-slate-100 font-mono text-sm p-4 leading-relaxed focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
                  value={taskMd}
                  onChange={(e) => setTaskMd(e.target.value)}
                  spellCheck={false}
                />
              </div>
            )}

            {tab === "exec" && (
              <div className="max-w-xl space-y-6">
                <section>
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">{a.execParams}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>{a.maxIterations}</label>
                      <input
                        name="maxIterations"
                        type="number"
                        min={1}
                        max={100}
                        className={inputCls}
                        value={maxIterations}
                        onChange={(e) => setMaxIterations(parseInt(e.target.value, 10) || 30)}
                      />
                      <p className="text-xs text-slate-400 mt-1">{a.maxIterationsDesc}</p>
                    </div>
                    <div>
                      <label className={labelCls}>{a.timeoutMinutes}</label>
                      <input
                        name="timeoutMinutes"
                        type="number"
                        min={1}
                        max={480}
                        className={inputCls}
                        value={timeoutMinutes}
                        onChange={(e) => setTimeoutMinutes(parseInt(e.target.value, 10) || 60)}
                      />
                      <p className="text-xs text-slate-400 mt-1">{a.timeoutMinutesDesc}</p>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">{a.notifications}</h3>
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="notifyOnSuccess"
                        checked={notifyOnSuccess}
                        onChange={(e) => setNotifyOnSuccess(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300"
                      />
                      <div>
                        <div className="text-sm text-slate-800">{a.notifySuccess}</div>
                        <div className="text-xs text-slate-500">{a.notifySuccessDesc}</div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="notifyOnFailure"
                        checked={notifyOnFailure}
                        onChange={(e) => setNotifyOnFailure(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300"
                      />
                      <div>
                        <div className="text-sm text-slate-800">{a.notifyFailure}</div>
                        <div className="text-xs text-slate-500">{a.notifyFailureDesc}</div>
                      </div>
                    </label>
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">{a.pushResults}</h3>
                  <p className="text-xs text-slate-500 mb-3 leading-relaxed">{a.pushResultsDesc}</p>
                  <input
                    name="wecomPushChatId"
                    className={inputCls}
                    value={wecomPushChatId}
                    onChange={(e) => setWecomPushChatId(e.target.value)}
                    placeholder={a.pushChatIdPlaceholder}
                  />
                  {triggerType !== "WEBHOOK" && (
                    <input type="hidden" name="webhookUrl" value={webhookUrl} />
                  )}
                </section>
              </div>
            )}
          </div>
        </main>
      </div>
    </form>
  );
}
