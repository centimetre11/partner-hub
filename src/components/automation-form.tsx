"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { CRON_PRESETS, describeCron } from "@/lib/cron";
import { automationSaveErrorMessage } from "@/lib/automation-save-errors";
import { saveAutomationAction, toggleAutomationAction, deleteAutomationAction } from "@/lib/automation-actions";
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
  type AutomationDealType,
  type AutomationTodoLinkFilter,
  describeAutomationQuery,
} from "@/lib/automation-query";
import { useLocale, useMessages } from "@/lib/i18n/context";
import { AutomationPageHeader } from "@/components/automation-page-header";
import { AutomationRunHistory, type AutomationRunItem } from "@/components/automation-run-history";
import { RunButton } from "@/app/(app)/agents/[id]/run-button";

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

function SectionCard({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200/80 bg-white p-4 ${className}`}>
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{title}</h2>
      {children}
    </section>
  );
}

export function AutomationForm({
  initial,
  partners,
  builderMode,
  runs,
  scheduleHint,
}: {
  initial: AutomationFormData;
  partners: PartnerOption[];
  /** 新建页：手动 / AI 模式切换 */
  builderMode?: "manual" | "auto";
  runs?: AutomationRunItem[];
  scheduleHint?: string;
}) {
  const m = useMessages();
  const locale = useLocale();
  const a = m.automations;
  const aq = a.aq;
  const bc = m.builderCommon;
  const lang = locale === "zh" ? "zh" : "en";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = !!initial.id;

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

  const [source, setSource] = useState<AutomationQuerySource>(initial.query.source);
  const [scope, setScope] = useState<AutomationQueryScope>(initial.query.scope);
  const [partnerId, setPartnerId] = useState(initial.query.partnerId ?? "");
  const [customerId, setCustomerId] = useState(initial.query.customerId ?? "");
  const [assigneeId, setAssigneeId] = useState(initial.query.assigneeId ?? "");
  const [dueFilter, setDueFilter] = useState<AutomationDueFilter>(initial.query.dueFilter ?? "all");
  const [dueWithinDays, setDueWithinDays] = useState(initial.query.dueWithinDays ?? 3);
  const [linkFilter, setLinkFilter] = useState<AutomationTodoLinkFilter>(initial.query.linkFilter ?? "all");
  const [opportunityStatus, setOpportunityStatus] = useState<AutomationOpportunityStatus>(
    initial.query.opportunityStatus ?? "ALL"
  );
  const [dealType, setDealType] = useState<AutomationDealType>(initial.query.dealType ?? "ALL");
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
      linkFilter: source === "todos" ? linkFilter : undefined,
      opportunityStatus: source === "opportunities" ? opportunityStatus : undefined,
      dealType: source === "opportunities" ? dealType : undefined,
      aiGoal: source === "ai" ? aiGoal : undefined,
    }),
    [source, scope, partnerId, customerId, assigneeId, dueFilter, dueWithinDays, linkFilter, opportunityStatus, dealType, aiGoal]
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
  const labelCls = "block text-xs font-medium text-slate-600 mb-1";
  const segBtn = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs border ${
      active ? "border-sky-400 bg-sky-50 text-sky-700 font-medium" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
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
    <form id="automation-edit-form" onSubmit={handleSubmit} className="min-h-[calc(100vh-7rem)] flex flex-col">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="enabled" value={initial.enabled ? "on" : "off"} />
      <input type="hidden" name="notifyOnSuccess" value={initial.notifyOnSuccess ? "on" : "off"} />
      <input type="hidden" name="notifyOnFailure" value={initial.notifyOnFailure ? "on" : "off"} />
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="partnerId" value={scope === "partner" ? partnerId : ""} />
      <input type="hidden" name="customerId" value={scope === "customer" ? customerId : ""} />
      <input type="hidden" name="assigneeId" value={source === "todos" ? assigneeId : ""} />
      <input type="hidden" name="dueFilter" value={source === "todos" ? dueFilter : "all"} />
      <input type="hidden" name="dueWithinDays" value={String(dueWithinDays)} />
      <input type="hidden" name="linkFilter" value={source === "todos" ? linkFilter : "all"} />
      <input type="hidden" name="opportunityStatus" value={source === "opportunities" ? opportunityStatus : "ALL"} />
      <input type="hidden" name="dealType" value={source === "opportunities" ? dealType : "ALL"} />
      <input type="hidden" name="aiGoal" value={source === "ai" ? aiGoal : ""} />
      <input type="hidden" name="pushWecomAppTo" value={pushWecomAppTo} />

      {/* ===== Sticky header ===== */}
      <AutomationPageHeader
        title={isEdit ? name || a.editTitle : a.createTitle}
        subtitle={isEdit ? querySummary : builderMode ? a.manualCreateDesc : undefined}
        builderMode={builderMode}
        actions={
          <>
            {saveOk && <span className="text-xs text-emerald-600 font-medium">{a.saveSuccess}</span>}
            {saveError && (
              <span className="text-xs text-red-600 max-w-[200px] text-right leading-snug" title={saveError}>
                {saveError}
              </span>
            )}
            {isEdit && initial.id && (
              <>
                <RunButton agentId={initial.id} compact formId="automation-edit-form" />
                <form action={toggleAutomationAction.bind(null, initial.id)}>
                  <button
                    type="submit"
                    className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    {initial.enabled ? a.disable : a.enable}
                  </button>
                </form>
                <form action={deleteAutomationAction.bind(null, initial.id)}>
                  <button
                    type="submit"
                    className="rounded-md border border-red-100 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    {a.delete}
                  </button>
                </form>
              </>
            )}
            <button
              type="submit"
              disabled={pending}
              title={a.saveHint}
              className="rounded-lg bg-slate-900 text-white px-4 py-1.5 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {pending ? a.saving : isEdit ? a.saveAndActivate : a.createAndActivate}
            </button>
          </>
        }
      />

      {/* ===== Body: 2-column layout ===== */}
      <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Query + Identity + Runs */}
          <div className="lg:col-span-7 space-y-4">
            <SectionCard title={aq.sectionTitle}>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>{aq.sourceLabel}</label>
                    <div className="flex flex-wrap gap-1">
                      <button type="button" className={segBtn(source === "todos")} onClick={() => setSource("todos")}>
                        {aq.sourceTodos}
                      </button>
                      <button type="button" className={segBtn(source === "opportunities")} onClick={() => setSource("opportunities")}>
                        {aq.sourceOpportunities}
                      </button>
                      <button type="button" className={segBtn(source === "ai")} onClick={() => setSource("ai")}>
                        {aq.sourceAi}
                      </button>
                    </div>
                  </div>

                  {source === "ai" ? (
                    <div className="sm:col-span-2">
                      <label className={labelCls}>{aq.aiGoalLabel}</label>
                      <textarea
                        className={`${inputCls} min-h-[72px]`}
                        value={aiGoal}
                        onChange={(e) => setAiGoal(e.target.value)}
                        placeholder={aq.aiGoalPlaceholder}
                        rows={2}
                      />
                    </div>
                  ) : null}

                  <div>
                    <label className={labelCls}>{aq.scopeLabel}</label>
                    <div className="flex flex-wrap gap-1">
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
                          <option key={p.id} value={p.id}>{p.name}</option>
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
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {source === "todos" && (
                    <>
                      <div>
                        <label className={labelCls}>{aq.assigneeLabel}</label>
                        <select className={inputCls} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                          <option value="">{aq.assigneeAll}</option>
                          {assignees.map((u) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>{aq.dueLabel}</label>
                        <div className="flex flex-wrap items-center gap-1">
                          <button type="button" className={segBtn(dueFilter === "all")} onClick={() => setDueFilter("all")}>
                            {aq.dueAll}
                          </button>
                          <button type="button" className={segBtn(dueFilter === "overdue")} onClick={() => setDueFilter("overdue")}>
                            {aq.dueOverdue}
                          </button>
                          <button type="button" className={segBtn(dueFilter === "within_days")} onClick={() => setDueFilter("within_days")}>
                            {aq.dueWithin}
                          </button>
                          {dueFilter === "within_days" && (
                            <input
                              type="number"
                              min={1}
                              max={90}
                              className="w-16 rounded-md border border-slate-200 px-2 py-1 text-xs"
                              value={dueWithinDays}
                              onChange={(e) => setDueWithinDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
                            />
                          )}
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>{aq.linkLabel}</label>
                        <select
                          className={inputCls}
                          value={linkFilter}
                          onChange={(e) => setLinkFilter(e.target.value as AutomationTodoLinkFilter)}
                        >
                          <option value="all">{aq.linkAll}</option>
                          <option value="project">{aq.linkProject}</option>
                          <option value="opportunity">{aq.linkOpportunity}</option>
                          <option value="unlinked">{aq.linkUnlinked}</option>
                        </select>
                      </div>
                    </>
                  )}

                  {source === "opportunities" && (
                    <>
                      <div>
                        <label className={labelCls}>{aq.statusLabel}</label>
                        <select
                          className={inputCls}
                          value={opportunityStatus}
                          onChange={(e) => setOpportunityStatus(e.target.value as AutomationOpportunityStatus)}
                        >
                          <option value="ALL">{aq.statusAll}</option>
                          <option value="OPEN">OPEN (P20/P50/P80)</option>
                          <option value="P20">P20</option>
                          <option value="P50">P50</option>
                          <option value="P80">P80</option>
                          <option value="WON">WON</option>
                          <option value="LOST">LOST</option>
                          <option value="PAUSED">PAUSED</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>{aq.dealTypeLabel}</label>
                        <select
                          className={inputCls}
                          value={dealType}
                          onChange={(e) => setDealType(e.target.value as AutomationDealType)}
                        >
                          <option value="ALL">{aq.dealTypeAll}</option>
                          <option value="PROJECT">{aq.dealTypeProject}</option>
                          <option value="PRODUCT">{aq.dealTypeProduct}</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard title={a.basicInfo}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{a.displayName}</label>
                  <input
                    name="name"
                    className={inputCls}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={a.taskGoalPlaceholder}
                  />
                </div>
                <div>
                  <label className={labelCls}>{a.slugLabel}</label>
                  <input
                    name="slug"
                    className={inputCls}
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="acme-todos-daily"
                  />
                </div>
              </div>
            </SectionCard>

            {isEdit && runs && (
              <SectionCard title={a.runHistory}>
                {scheduleHint && <p className="text-[11px] text-slate-400 mb-2">{scheduleHint}</p>}
                <AutomationRunHistory runs={runs} />
              </SectionCard>
            )}
          </div>

          {/* Right: Schedule + Delivery */}
          <div className="lg:col-span-5 space-y-4">
            <SectionCard title={a.triggerConfig}>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>{a.cronExpr}</label>
                  <input name="cronExpr" className={inputCls} value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} />
                  <p className="text-[11px] text-sky-600 mt-1">{cronDesc}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {CRON_PRESETS.filter((p) => ["daily9", "daily18", "weekday9", "monday9"].includes(p.id)).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setCronExpr(p.expr)}
                      className={`rounded-md px-2 py-0.5 text-[11px] border ${
                        cronExpr === p.expr ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600"
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
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>
              </div>
            </SectionCard>

            <SectionCard title={a.pushResults}>
              <div className="space-y-3">
                {deliveryMissing && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-2.5 py-1.5">{a.saveErrorDelivery}</p>
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
                      <option key={c.chatId} value={c.chatId}>{wecomLabel(c)}</option>
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
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
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
                      className="rounded"
                    />
                    <span className="text-sm font-medium text-slate-800">{bc.wecomAppLabel}</span>
                  </label>
                  {pushWecomAppEnabled && (
                    <div className="space-y-2 pl-6">
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
                        {source === "todos" && <option value="assignees">{a.wecomAppRecipientAssignees}</option>}
                        <option value="user">{a.wecomAppRecipientUser}</option>
                      </select>
                      {wecomAppMode === "user" && (
                        <select className={inputCls} value={wecomAppUserId} onChange={(e) => setWecomAppUserId(e.target.value)}>
                          <option value="">{a.wecomAppRecipientUserPlaceholder}</option>
                          {assignees.map((u) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </form>
  );
}
