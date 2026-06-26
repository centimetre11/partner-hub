"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CRON_PRESETS, describeCron } from "@/lib/cron";
import { automationSaveErrorMessage } from "@/lib/automation-save-errors";
import { saveAutomationAction } from "@/lib/automation-actions";
import {
  isWecomAppPushEnabled,
  parseWecomAppRecipient,
  serializeWecomAppRecipient,
  type WecomAppRecipientMode,
} from "@/lib/automation-delivery";
import {
  type AutomationQuery,
  type AutomationQuerySource,
  type AutomationQueryScope,
  type AutomationDueFilter,
  type AutomationOpportunityStatus,
  describeAutomationQuery,
} from "@/lib/automation-query";
import { useLocale, useMessages } from "@/lib/i18n/context";

const TIMEZONES = ["Asia/Shanghai", "Asia/Dubai", "Asia/Riyadh", "Europe/London", "America/New_York", "UTC"];

export type AutomationFormData = {
  id?: string;
  slug: string;
  name: string;
  cronExpr: string;
  timezone: string;
  wecomPushChatId: string;
  pushEmailTo: string;
  pushWecomAppTo: string;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  enabled: boolean;
  query: AutomationQuery;
};

type PartnerOption = { id: string; name: string };
type CustomerOption = { id: string; name: string };
type AssigneeOption = { id: string; name: string };
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
  const aq = a.aq;
  const bc = m.builderCommon;
  const lang = locale === "zh" ? "zh" : "en";
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [slug, setSlug] = useState(initial.slug);
  const [name, setName] = useState(initial.name);
  const [cronExpr, setCronExpr] = useState(initial.cronExpr);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [wecomPushChatId, setWecomPushChatId] = useState(initial.wecomPushChatId);
  const [pushEmailTo, setPushEmailTo] = useState(initial.pushEmailTo);
  const initialWecomApp = parseWecomAppRecipient(initial.pushWecomAppTo);
  const [pushWecomAppEnabled, setPushWecomAppEnabled] = useState(initialWecomApp.enabled);
  const [wecomAppMode, setWecomAppMode] = useState<WecomAppRecipientMode>(initialWecomApp.mode);
  const [wecomAppUserId, setWecomAppUserId] = useState(initialWecomApp.hubUserId);

  // Structured query state
  const [source, setSource] = useState<AutomationQuerySource>(initial.query.source);
  const [scope, setScope] = useState<AutomationQueryScope>(initial.query.scope);
  const [partnerId, setPartnerId] = useState(initial.query.partnerId ?? "");
  const [customerId, setCustomerId] = useState(initial.query.customerId ?? "");
  const [assigneeId, setAssigneeId] = useState(initial.query.assigneeId ?? "");
  const [dueFilter, setDueFilter] = useState<AutomationDueFilter>(initial.query.dueFilter ?? "all");
  const [dueWithinDays, setDueWithinDays] = useState(initial.query.dueWithinDays ?? 3);
  const [opportunityStatus, setOpportunityStatus] = useState<AutomationOpportunityStatus>(
    initial.query.opportunityStatus ?? "ALL"
  );
  const [aiGoal, setAiGoal] = useState(initial.query.aiGoal ?? "");

  const [partnerOpts, setPartnerOpts] = useState<PartnerOption[]>(partners);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [wecomChats, setWecomChats] = useState<WecomOption[]>([]);
  const [emails, setEmails] = useState<EmailOption[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    void fetch("/api/builder-options")
      .then((r) => r.json())
      .then(
        (data: {
          wecomChats: WecomOption[];
          emails: EmailOption[];
          partners?: PartnerOption[];
          customers?: CustomerOption[];
          assignees?: AssigneeOption[];
        }) => {
          setWecomChats(data.wecomChats ?? []);
          setEmails(data.emails ?? []);
          if (data.partners?.length) setPartnerOpts(data.partners);
          setCustomers(data.customers ?? []);
          setAssignees(data.assignees ?? []);
        }
      );
  }, []);

  useEffect(() => {
    if (source !== "todos" && wecomAppMode === "assignees") {
      setWecomAppMode("creator");
    }
  }, [source, wecomAppMode]);

  const pushWecomAppTo = useMemo(
    () =>
      serializeWecomAppRecipient({
        enabled: pushWecomAppEnabled,
        mode: wecomAppMode,
        hubUserId: wecomAppUserId,
      }),
    [pushWecomAppEnabled, wecomAppMode, wecomAppUserId]
  );

  const cronDesc = useMemo(() => describeCron(cronExpr, lang), [cronExpr, lang]);
  const deliveryMissing =
    !wecomPushChatId.trim() && !pushEmailTo.trim() && !isWecomAppPushEnabled(pushWecomAppTo);

  const currentQuery: AutomationQuery = useMemo(
    () => ({
      source,
      scope,
      partnerId: scope === "partner" ? partnerId : undefined,
      customerId: scope === "customer" ? customerId : undefined,
      assigneeId: source === "todos" ? assigneeId || undefined : undefined,
      dueFilter: source === "todos" ? dueFilter : undefined,
      dueWithinDays: source === "todos" && dueFilter === "within_days" ? dueWithinDays : undefined,
      opportunityStatus: source === "opportunities" ? opportunityStatus : undefined,
      aiGoal: source === "ai" ? aiGoal : undefined,
    }),
    [source, scope, partnerId, customerId, assigneeId, dueFilter, dueWithinDays, opportunityStatus, aiGoal]
  );

  const querySummary = useMemo(() => {
    const names = {
      partnerName: partnerOpts.find((p) => p.id === partnerId)?.name,
      customerName: customers.find((c) => c.id === customerId)?.name,
      assigneeName: assignees.find((u) => u.id === assigneeId)?.name,
    };
    return describeAutomationQuery(currentQuery, names, lang);
  }, [currentQuery, partnerOpts, customers, assignees, partnerId, customerId, assigneeId, lang]);

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400";
  const labelCls = "block text-xs font-medium text-slate-600 mb-1.5";
  const segBtn = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm border ${
      active ? "border-sky-400 bg-sky-50 text-sky-700 font-medium" : "border-slate-200 bg-white text-slate-600"
    }`;

  function wecomLabel(c: WecomOption) {
    const parts = [c.partnerName, c.label].filter(Boolean);
    return parts.length ? parts.join(" · ") : c.chatId.slice(0, 16);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setSaveOk(false);
    if (deliveryMissing) {
      setSaveError(a.saveErrorDelivery);
      return;
    }
    if (pushWecomAppEnabled && wecomAppMode === "user" && !wecomAppUserId.trim()) {
      setSaveError(a.saveErrorWecomAppUser);
      return;
    }
    if (pushWecomAppEnabled && wecomAppMode === "assignees" && source !== "todos") {
      setSaveError(a.saveErrorWecomAppAssignees);
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveAutomationAction(fd);
      if (!result.ok) {
        setSaveError(automationSaveErrorMessage(result.error, a));
        return;
      }
      setSaveOk(true);
      if (!initial.id) {
        router.push(`/automations/${result.agentId}`);
        return;
      }
      router.refresh();
      window.setTimeout(() => setSaveOk(false), 4000);
    });
  }

  return (
    <form id="automation-edit-form" onSubmit={handleSubmit} className="min-h-[calc(100vh-8rem)] flex flex-col">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="enabled" value={initial.enabled ? "on" : "off"} />
      <input type="hidden" name="notifyOnSuccess" value={initial.notifyOnSuccess ? "on" : "off"} />
      <input type="hidden" name="notifyOnFailure" value={initial.notifyOnFailure ? "on" : "off"} />
      {/* structured query hidden fields (always submitted; server ignores irrelevant) */}
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="partnerId" value={scope === "partner" ? partnerId : ""} />
      <input type="hidden" name="customerId" value={scope === "customer" ? customerId : ""} />
      <input type="hidden" name="assigneeId" value={source === "todos" ? assigneeId : ""} />
      <input type="hidden" name="dueFilter" value={source === "todos" ? dueFilter : "all"} />
      <input type="hidden" name="dueWithinDays" value={String(dueWithinDays)} />
      <input type="hidden" name="opportunityStatus" value={source === "opportunities" ? opportunityStatus : "ALL"} />
      <input type="hidden" name="aiGoal" value={source === "ai" ? aiGoal : ""} />

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
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-2">
            {saveOk && <span className="text-xs text-emerald-600 font-medium">{a.saveSuccess}</span>}
            {saveError && (
              <span className="text-xs text-red-600 max-w-[220px] text-right leading-snug" title={saveError}>
                {saveError}
              </span>
            )}
            <button
              type="submit"
              disabled={pending}
              title={a.saveHint}
              className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {pending ? a.saving : initial.id ? a.saveAndActivate : a.createAndActivate}
            </button>
          </div>
          {initial.id && <p className="text-[11px] text-slate-400">{a.saveOptionalRunHint}</p>}
        </div>
      </div>

      <div className="flex-1 max-w-2xl px-8 py-6 space-y-6">
        <section className="rounded-xl border border-sky-100 bg-sky-50/40 p-4">
          <div className="text-sm font-semibold text-slate-800">{bc.initTitle}</div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{bc.initDesc}</p>
        </section>

        {/* ===== Query rule ===== */}
        <section className="space-y-3">
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{aq.sectionTitle}</h2>
            <p className="text-xs text-slate-400 mt-1">{aq.sectionDesc}</p>
          </div>

          <div>
            <label className={labelCls}>{aq.sourceLabel}</label>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={segBtn(source === "todos")} onClick={() => setSource("todos")}>
                {aq.sourceTodos}
              </button>
              <button
                type="button"
                className={segBtn(source === "opportunities")}
                onClick={() => setSource("opportunities")}
              >
                {aq.sourceOpportunities}
              </button>
              <button type="button" className={segBtn(source === "ai")} onClick={() => setSource("ai")}>
                {aq.sourceAi}
              </button>
            </div>
            {source === "ai" && <p className="text-xs text-slate-400 mt-1.5">{aq.sourceAiHint}</p>}
          </div>

          {source === "ai" ? (
            <div>
              <label className={labelCls}>{aq.aiGoalLabel}</label>
              <textarea
                className={`${inputCls} min-h-[80px]`}
                value={aiGoal}
                onChange={(e) => setAiGoal(e.target.value)}
                placeholder={aq.aiGoalPlaceholder}
                rows={3}
              />
            </div>
          ) : null}

          {/* scope applies to all sources */}
          <div>
            <label className={labelCls}>{aq.scopeLabel}</label>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={segBtn(scope === "all")} onClick={() => setScope("all")}>
                {aq.scopeAll}
              </button>
              <button type="button" className={segBtn(scope === "partner")} onClick={() => setScope("partner")}>
                {aq.scopePartner}
              </button>
              <button type="button" className={segBtn(scope === "customer")} onClick={() => setScope("customer")}>
                {aq.scopeCustomer}
              </button>
            </div>
          </div>

          {scope === "partner" && (
            <div>
              <label className={labelCls}>{aq.partnerLabel}</label>
              <select className={inputCls} value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">{aq.partnerPlaceholder}</option>
                {partnerOpts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {scope === "customer" && (
            <div>
              <label className={labelCls}>{aq.customerLabel}</label>
              <select className={inputCls} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">{aq.customerPlaceholder}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* todos-only filters */}
          {source === "todos" && (
            <>
              <div>
                <label className={labelCls}>{aq.assigneeLabel}</label>
                <select className={inputCls} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">{aq.assigneeAll}</option>
                  {assignees.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{aq.dueLabel}</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" className={segBtn(dueFilter === "all")} onClick={() => setDueFilter("all")}>
                    {aq.dueAll}
                  </button>
                  <button
                    type="button"
                    className={segBtn(dueFilter === "overdue")}
                    onClick={() => setDueFilter("overdue")}
                  >
                    {aq.dueOverdue}
                  </button>
                  <button
                    type="button"
                    className={segBtn(dueFilter === "within_days")}
                    onClick={() => setDueFilter("within_days")}
                  >
                    {aq.dueWithin}
                  </button>
                  {dueFilter === "within_days" && (
                    <input
                      type="number"
                      min={1}
                      max={90}
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      value={dueWithinDays}
                      onChange={(e) => setDueWithinDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
                      title={aq.dueWithinDays}
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {/* opportunities-only filter */}
          {source === "opportunities" && (
            <div>
              <label className={labelCls}>{aq.statusLabel}</label>
              <select
                className={inputCls}
                value={opportunityStatus}
                onChange={(e) => setOpportunityStatus(e.target.value as AutomationOpportunityStatus)}
              >
                <option value="ALL">{aq.statusAll}</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="WON">WON</option>
                <option value="LOST">LOST</option>
                <option value="PAUSED">PAUSED</option>
              </select>
            </div>
          )}

          <div className="rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2 text-xs text-violet-900">
            {querySummary}
          </div>
        </section>

        {/* ===== Trigger ===== */}
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

        {/* ===== Delivery ===== */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{a.pushResults}</h2>
          {deliveryMissing && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{a.saveErrorDelivery}</p>
          )}
          <div>
            <label className={labelCls}>{bc.wecomLabel}</label>
            <select
              name="wecomPushChatId"
              className={inputCls}
              value={wecomPushChatId}
              onChange={(e) => setWecomPushChatId(e.target.value)}
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
            <input
              name="pushEmailTo"
              list="automation-email-options"
              className={inputCls}
              value={pushEmailTo}
              onChange={(e) => setPushEmailTo(e.target.value)}
              placeholder={a.emailInputPlaceholder}
            />
            <datalist id="automation-email-options">
              {emails.map((u) => (
                <option key={u.id} value={u.email}>
                  {u.name ? `${u.name} · ${u.email}` : u.email}
                </option>
              ))}
            </datalist>
            <p className="text-xs text-slate-400 mt-1">{a.emailInputHint}</p>
          </div>
          <div className="space-y-2">
            <label className="flex items-start gap-2.5 rounded-lg border border-slate-100 px-3.5 py-2.5 cursor-pointer hover:border-slate-200">
              <input
                type="checkbox"
                checked={pushWecomAppEnabled}
                onChange={(e) => {
                  setPushWecomAppEnabled(e.target.checked);
                  if (!e.target.checked) {
                    setWecomAppMode("creator");
                    setWecomAppUserId("");
                  }
                }}
                className="mt-0.5 rounded"
              />
              <span className="min-w-0">
                <span className="text-sm font-medium text-slate-800 block">{bc.wecomAppLabel}</span>
                <span className="text-xs text-slate-400 font-mono">send_wecom_app</span>
              </span>
            </label>
            {pushWecomAppEnabled && (
              <div className="ml-7 space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                <div>
                  <label className={labelCls}>{a.wecomAppRecipientLabel}</label>
                  <select
                    className={inputCls}
                    value={wecomAppMode}
                    onChange={(e) => {
                      const mode = e.target.value as WecomAppRecipientMode;
                      setWecomAppMode(mode);
                      if (mode !== "user") setWecomAppUserId("");
                    }}
                  >
                    <option value="creator">{a.wecomAppRecipientCreator}</option>
                    {source === "todos" && (
                      <option value="assignees">{a.wecomAppRecipientAssignees}</option>
                    )}
                    <option value="user">{a.wecomAppRecipientUser}</option>
                  </select>
                </div>
                {wecomAppMode === "user" && (
                  <div>
                    <label className={labelCls}>{a.wecomAppRecipientUserPick}</label>
                    <select
                      className={inputCls}
                      value={wecomAppUserId}
                      onChange={(e) => setWecomAppUserId(e.target.value)}
                    >
                      <option value="">{a.wecomAppRecipientUserPlaceholder}</option>
                      {assignees.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <p className="text-xs text-slate-400 leading-relaxed">
                  {wecomAppMode === "creator" && a.wecomAppRecipientCreatorHint}
                  {wecomAppMode === "assignees" && a.wecomAppRecipientAssigneesHint}
                  {wecomAppMode === "user" && a.wecomAppRecipientUserHint}
                </p>
              </div>
            )}
            <input type="hidden" name="pushWecomAppTo" value={pushWecomAppTo} />
          </div>
        </section>

        {/* ===== Basic ===== */}
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
      </div>
    </form>
  );
}
