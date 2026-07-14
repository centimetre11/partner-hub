"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IntakeProposal } from "@/lib/ai-intake";
import type { IntakeScope } from "@/lib/ai-locale";
import {
  countProposalItems,
  fieldKey,
  contactKey,
  oppKey,
  todoKey,
  businessRecordKey,
  type ProposalChanges,
} from "@/lib/proposal-merge";
import { filterNormalized, normalizeProposal, type NormalizedProposal } from "@/lib/proposal-normalize";
import { scopeDraftSections } from "@/lib/proposal-scope";
import { CRM_TRACE_ACTIONS, CRM_TRACE_NATURES } from "@/lib/crm-trace-constants";
import { businessRecordCrmFieldsComplete } from "@/lib/crm-trace-payload";
import { type ProposalEditPatch } from "@/lib/clarification-apply";
import { CrmRecorderPicker, useDefaultCrmRecorderSelection, type CrmRecorderOption } from "@/components/crm-recorder-picker";
import { useLabels, useMessages } from "@/lib/i18n/context";
import { attitudeLabelFromLabels } from "@/lib/i18n/labels";

type RowTone = "field" | "contact" | "opp" | "todo" | "training" | "solution" | "business" | "partner";

const ROW_COLORS: Record<RowTone, string> = {
  field: "border-l-amber-400",
  contact: "border-l-emerald-400",
  opp: "border-l-sky-400",
  todo: "border-l-purple-400",
  training: "border-l-orange-400",
  solution: "border-l-violet-400",
  business: "border-l-amber-500",
  partner: "border-l-slate-500",
};

function DraftRow({
  k,
  children,
  tone,
  isNew,
  isUpdated,
  excluded,
  flashKeys,
  onToggle,
  badgeNew,
  badgeUpdated,
}: {
  k: string;
  children: React.ReactNode;
  tone: RowTone;
  isNew?: boolean;
  isUpdated?: boolean;
  excluded: Set<string>;
  flashKeys: Set<string>;
  onToggle: (key: string) => void;
  badgeNew: string;
  badgeUpdated: string;
}) {
  const off = excluded.has(k);
  const flash = flashKeys.has(k);
  return (
    <div
      className={`flex items-start gap-2.5 rounded-md border border-slate-100 border-l-4 ${ROW_COLORS[tone]} px-3 py-2.5 ${off ? "opacity-40" : ""} ${flash && isNew ? "bg-emerald-50/80" : ""} ${flash && isUpdated ? "bg-amber-50/80" : ""}`}
    >
      <input
        type="checkbox"
        checked={!off}
        onChange={() => onToggle(k)}
        className="mt-1 rounded shrink-0"
      />
      <div className="min-w-0 flex-1 text-sm">
        {children}
        {isNew && flash && <span className="ml-2 text-[10px] text-emerald-600 font-medium">{badgeNew}</span>}
        {isUpdated && flash && <span className="ml-2 text-[10px] text-amber-600 font-medium">{badgeUpdated}</span>}
      </div>
    </div>
  );
}

/** Local draft state — commits on blur / Enter only (avoids remount + per-keystroke parent updates) */
function DraftInlineEdit({
  value,
  placeholder,
  onCommit,
  className,
}: {
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);

  function commit() {
    const next = draft.trim();
    if (next !== value.trim()) onCommit(next);
  }

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      placeholder={placeholder}
      className={className}
    />
  );
}

type Props = {
  proposal: IntakeProposal | null;
  changes?: ProposalChanges | null;
  onConfirm: (filtered: NormalizedProposal) => Promise<void> | void;
  confirmLabel?: string;
  questions?: string[];
  onProposalEdit?: (patch: ProposalEditPatch) => void;
  ready?: boolean;
  loading?: boolean;
  scope?: IntakeScope;
  partnerId?: string;
  customerId?: string;
  /** When true, save is blocked until left-chat AI clarifications are answered */
  identityBlocked?: boolean;
};

export function LiveProposalDraft({
  proposal,
  changes,
  onConfirm,
  confirmLabel,
  questions = [],
  onProposalEdit,
  ready = false,
  loading = false,
  scope,
  partnerId,
  customerId,
  identityBlocked: identityBlockedProp,
}: Props) {
  const { assistant: am, intakePanel: ip } = useMessages();
  const labels = useLabels();
  const sections = scopeDraftSections(scope);
  const confirmBtn = confirmLabel ?? ip.confirmReady;
  const normalized = useMemo(
    () => (proposal ? normalizeProposal(proposal, scope) : null),
    [proposal, scope]
  );
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [flashKeys, setFlashKeys] = useState<Set<string>>(new Set());
  const [crmMeta, setCrmMeta] = useState<{ currentUserId: string; crmRecorders: CrmRecorderOption[] } | null>(null);
  const [defaultRecorderIds, setDefaultRecorderIds] = useDefaultCrmRecorderSelection(
    crmMeta?.crmRecorders,
    crmMeta?.currentUserId,
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const count = proposal ? countProposalItems(proposal) : 0;
  const identityBlocked = identityBlockedProp ?? false;
  const websiteField = normalized?.fieldUpdates.find((f) => f.field === "website");
  const selectedRecorderIds = proposal?.crmRecorderUserIds?.length
    ? proposal.crmRecorderUserIds
    : defaultRecorderIds;

  useEffect(() => {
    if (scope !== "business_record") return;
    const qs = customerId
      ? `customerId=${customerId}`
      : partnerId
        ? `partnerId=${partnerId}`
        : "";
    const url = qs ? `/api/business-record/meta?${qs}` : "/api/business-record/recorders";
    void fetch(url)
      .then((r) => r.json())
      .then((data: { currentUserId: string; crmRecorders: CrmRecorderOption[] }) => setCrmMeta(data))
      .catch(() => setCrmMeta(null));
  }, [scope, partnerId, customerId]);

  function handleRecorderChange(ids: string[]) {
    setDefaultRecorderIds(ids);
    onProposalEdit?.({ type: "crmRecorders", ids });
  }

  useEffect(() => {
    if (!changes) return;
    const keys = new Set([...changes.added, ...changes.updated, ...(changes.aiReupdates ?? [])]);
    if (keys.size) {
      setFlashKeys(keys);
      const t = setTimeout(() => setFlashKeys(new Set()), 3000);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      return () => clearTimeout(t);
    }
  }, [changes]);

  const toggle = (key: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function confirm() {
    if (!normalized) return;
    setApplying(true);
    setApplyError(null);
    try {
      const filtered = filterNormalized(normalized, excluded);
      if (scope === "business_record" && selectedRecorderIds.length) {
        filtered.crmRecorderUserIds = selectedRecorderIds;
      }
      await onConfirm(filtered);
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  if (!proposal || !normalized) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-400 flex flex-col h-full min-h-0">
        <div className="flex-1 flex items-center justify-center text-center px-4">
          {loading ? ip.liveLoading : ip.liveEmpty}
        </div>
      </div>
    );
  }

  const total =
    (sections.partnerName && normalized.partnerName ? 1 : 0) +
    (sections.fields ? normalized.fieldUpdates.length : 0) +
    (sections.contacts ? normalized.contacts.length : 0) +
    (sections.opportunities ? normalized.opportunities.length : 0) +
    (sections.todos ? normalized.todos.length : 0) +
    (sections.trainings ? normalized.trainings.length : 0) +
    (sections.solutions ? normalized.solutions.length : 0) +
    (sections.businessRecords ? normalized.businessRecords.length : 0);

  const saveDisabled =
    applying ||
    total - excluded.size <= 0 ||
    identityBlocked ||
    (scope === "business_record" &&
      (!businessRecordCrmFieldsComplete(
        normalized.businessRecords.filter((r, i) => {
          const k = businessRecordKey(r.title) || `br${i}`;
          return !excluded.has(k);
        })
      ) ||
        !selectedRecorderIds.length));

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4 flex flex-col h-full min-h-0 space-y-3">
      <div className="shrink-0 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">{ip.liveTitle}</div>
        <div className="text-xs text-slate-400">
          {ip.foundItems.replace("{count}", String(count))}
          {changes && (changes.added.length > 0 || changes.updated.length > 0) && (
            <span className="text-emerald-600 ml-1">
              {ip.justNowAdded.replace("{added}", String(changes.added.length))}
              {changes.updated.length > 0 ? ip.justNowUpdated.replace("{updated}", String(changes.updated.length)) : ""}
            </span>
          )}
        </div>
      </div>

      {(normalized.summary || normalized.partnerName) && (
        <div className="shrink-0 rounded-lg bg-white border border-slate-200 p-3">
          {normalized.summaryTitle && (
            <div className="text-xs font-semibold text-sky-700 mb-1">{normalized.summaryTitle}</div>
          )}
          {normalized.summary && (
            <p className="text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">{normalized.summary}</p>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
        {total === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">{ip.nothingToSave}</p>
        ) : (
          <>
            {(sections.partnerName && (normalized.partnerName || onProposalEdit)) && (
              <DraftRow
                k="partner"
                tone="partner"
                isNew={changes?.added.includes("partner")}
                isUpdated={changes?.updated.includes("partner")}
                excluded={excluded}
                flashKeys={flashKeys}
                onToggle={toggle}
                badgeNew={ip.badgeNew}
                badgeUpdated={ip.badgeUpdated}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 w-full">
                  <span className="font-medium text-slate-800 shrink-0">{am.editPartnerName}</span>
                  {onProposalEdit ? (
                    <DraftInlineEdit
                      value={normalized.partnerName ?? ""}
                      placeholder={am.editPartnerName}
                      onCommit={(v) => onProposalEdit({ type: "partnerName", value: v })}
                      className="flex-1 min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-emerald-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                  ) : (
                    <span className="text-emerald-700 font-medium">{normalized.partnerName}</span>
                  )}
                </div>
              </DraftRow>
            )}
            {sections.fields &&
              normalized.fieldUpdates.map((f, i) => {
              const k = fieldKey(f.field) || `f${i}`;
              const editableWebsite = f.field === "website" && onProposalEdit;
              return (
                <DraftRow
                  key={k}
                  k={k}
                  tone="field"
                  isNew={changes?.added.includes(k)}
                  isUpdated={changes?.updated.includes(k)}
                  excluded={excluded}
                  flashKeys={flashKeys}
                  onToggle={toggle}
                  badgeNew={ip.badgeNew}
                  badgeUpdated={ip.badgeUpdated}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 w-full">
                    <span className="font-medium text-slate-800 shrink-0">{f.label}</span>
                    {f.oldValue ? (
                      <span className="text-slate-400 line-through decoration-red-300 text-xs">{f.oldValue}</span>
                    ) : null}
                    {editableWebsite ? (
                      <DraftInlineEdit
                        value={f.newValue}
                        placeholder={am.editWebsite}
                        onCommit={(v) => onProposalEdit({ type: "field", field: "website", value: v })}
                        className="flex-1 min-w-0 rounded-md border border-amber-200 bg-white px-2 py-1 text-sm text-emerald-800 focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    ) : (
                      <span className="text-emerald-700 font-medium">→ {f.newValue}</span>
                    )}
                  </div>
                </DraftRow>
              );
            })}
            {sections.websiteHint && !websiteField && onProposalEdit && (
              <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/40 px-3 py-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                  <span className="text-sm font-medium text-slate-700 shrink-0">{am.editWebsite}</span>
                  <DraftInlineEdit
                    value=""
                    placeholder="example.com"
                    onCommit={(v) => onProposalEdit({ type: "field", field: "website", value: v })}
                    className="flex-1 min-w-0 rounded-md border border-amber-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              </div>
            )}
            {sections.contacts &&
              normalized.contacts.map((c, i) => {
              const k = contactKey(c.name) || `c${i}`;
              return (
                <DraftRow
                  key={k}
                  k={k}
                  tone="contact"
                  isNew={changes?.added.includes(k)}
                  isUpdated={changes?.updated.includes(k)}
                  excluded={excluded}
                  flashKeys={flashKeys}
                  onToggle={toggle}
                  badgeNew={ip.badgeNew}
                  badgeUpdated={ip.badgeUpdated}
                >
                  <span className="font-medium text-slate-800">
                    {c.action === "update" ? ip.updateContact : ip.contact}: {c.name}
                  </span>
                  <span className="text-slate-500 ml-1.5 text-xs">
                    {[c.title, c.role && (labels.contactRoleLabels[c.role] ?? c.role), typeof c.attitude === "number" && `${ip.attitude}: ${attitudeLabelFromLabels(labels, c.attitude)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </DraftRow>
              );
            })}
            {sections.opportunities &&
              normalized.opportunities.map((o, i) => {
              const k = oppKey(o.name) || `o${i}`;
              return (
                <DraftRow
                  key={k}
                  k={k}
                  tone="opp"
                  isNew={changes?.added.includes(k)}
                  isUpdated={changes?.updated.includes(k)}
                  excluded={excluded}
                  flashKeys={flashKeys}
                  onToggle={toggle}
                  badgeNew={ip.badgeNew}
                  badgeUpdated={ip.badgeUpdated}
                >
                  <span className="font-medium text-slate-800">
                    {o.action === "update" ? ip.updateOpportunity : ip.opportunity}: {o.name}
                  </span>
                  <span className="text-slate-500 ml-1.5 text-xs">
                    {[o.client, o.amount, o.stage].filter(Boolean).join(" · ")}
                  </span>
                </DraftRow>
              );
            })}
            {sections.todos &&
              normalized.todos.map((t, i) => {
              const k = todoKey(t.title) || `t${i}`;
              return (
                <DraftRow
                  key={k}
                  k={k}
                  tone="todo"
                  isNew={changes?.added.includes(k)}
                  isUpdated={changes?.updated.includes(k)}
                  excluded={excluded}
                  flashKeys={flashKeys}
                  onToggle={toggle}
                  badgeNew={ip.badgeNew}
                  badgeUpdated={ip.badgeUpdated}
                >
                  <span className="font-medium text-slate-800">{ip.todo}: {t.title}</span>
                </DraftRow>
              );
            })}
            {sections.businessRecords &&
              normalized.businessRecords.map((r, i) => {
              const k = businessRecordKey(r.title) || `br${i}`;
              return (
                <DraftRow
                  key={k}
                  k={k}
                  tone="business"
                  isNew={changes?.added.includes(k)}
                  isUpdated={changes?.updated.includes(k)}
                  excluded={excluded}
                  flashKeys={flashKeys}
                  onToggle={toggle}
                  badgeNew={ip.badgeNew}
                  badgeUpdated={ip.badgeUpdated}
                >
                  <span className="font-medium text-slate-800">{ip.milestone}: {r.title}</span>
                  <span className="text-slate-500 ml-1.5 text-xs block mt-0.5">
                    {[r.category, r.occurredAt, r.contactName].filter(Boolean).join(" · ")}
                  </span>
                  {onProposalEdit && (
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      <label className="text-xs text-slate-500 flex items-center gap-1">
                        {ip.traceNatureLabel}
                        <select
                          value={r.traceNature ?? ""}
                          onChange={(e) =>
                            onProposalEdit({ type: "businessRecord", index: i, field: "traceNature", value: e.target.value })
                          }
                          className="text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white"
                        >
                          <option value="">{ip.selectPlaceholder}</option>
                          {CRM_TRACE_NATURES.map((n) => (
                            <option key={n} value={n}>
                              {labels.crmTraceNatureLabels[n] ?? n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-slate-500 flex items-center gap-1">
                        {ip.traceActionLabel}
                        <select
                          value={r.traceAction ?? ""}
                          onChange={(e) =>
                            onProposalEdit({ type: "businessRecord", index: i, field: "traceAction", value: e.target.value })
                          }
                          className="text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white max-w-[10rem]"
                        >
                          <option value="">{ip.selectPlaceholder}</option>
                          {CRM_TRACE_ACTIONS.map((a) => (
                            <option key={a} value={a}>
                              {labels.crmTraceActionLabels[a] ?? a}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </DraftRow>
              );
            })}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {questions.length > 0 && !ready && (
        <div className="shrink-0 mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
          {ip.questionsHint.replace("{questions}", questions.join("; "))}
        </div>
      )}

      {applyError && (
        <div className="shrink-0 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {applyError}
        </div>
      )}

      {scope === "business_record" && crmMeta?.crmRecorders.length && crmMeta.currentUserId && (
        <div className="shrink-0 rounded-lg border border-slate-100 bg-white p-3">
          <CrmRecorderPicker
            recorders={crmMeta.crmRecorders}
            currentUserId={crmMeta.currentUserId}
            selectedIds={selectedRecorderIds}
            onChange={handleRecorderChange}
            compact
          />
        </div>
      )}

      <div className="shrink-0 sticky bottom-0 pt-3 mt-auto border-t border-slate-200/80 flex flex-col gap-2">
        {identityBlocked && (
          <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{am.confirmBlockedIdentity}</div>
        )}
        {scope === "business_record" && !saveDisabled && !applying && (
          <div className="text-xs text-slate-500">{ip.crmSyncHint}</div>
        )}
        {scope === "business_record" && saveDisabled && total - excluded.size > 0 && !identityBlocked && (
          <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            {!selectedRecorderIds.length ? ip.crmRecorderRequired : ip.crmFieldsRequired}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {ip.itemsSummary.replace("{total}", String(total)).replace("{excluded}", String(excluded.size))}
          </div>
          <button
            onClick={confirm}
            disabled={saveDisabled}
            className="rounded-lg bg-slate-900 text-white font-medium px-5 py-2 text-sm hover:bg-slate-800 disabled:opacity-40 shrink-0"
          >
            {applying ? ip.saving : ready ? `✓ ${confirmBtn}` : confirmBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
