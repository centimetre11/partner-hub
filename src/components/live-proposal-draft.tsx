"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IntakeProposal, IntakeClarification } from "@/lib/ai-intake";
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
import {
  getClarificationMode,
  hasBlockingClarifications,
  isOpenEndedClarificationOption,
  partitionClarifications,
  type ClarificationAnswer,
  type ProposalEditPatch,
} from "@/lib/clarification-apply";
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
  partner: "border-l-indigo-400",
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
      className={`flex items-start gap-2.5 rounded-lg border border-zinc-100 border-l-4 ${ROW_COLORS[tone]} px-3 py-2.5 transition-all duration-300 ${off ? "opacity-40" : ""} ${flash && isNew ? "bg-emerald-50/80 animate-in slide-in-from-right-2" : ""} ${flash && isUpdated ? "bg-amber-50/80" : ""}`}
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
  clarifications?: IntakeClarification[];
  onDirectClarify?: (id: string, value: string) => void;
  onAiClarify?: (answers: ClarificationAnswer[]) => void;
  onProposalEdit?: (patch: ProposalEditPatch) => void;
  ready?: boolean;
  loading?: boolean;
  scope?: IntakeScope;
};

export function LiveProposalDraft({
  proposal,
  changes,
  onConfirm,
  confirmLabel,
  questions = [],
  clarifications = [],
  onDirectClarify,
  onAiClarify,
  onProposalEdit,
  ready = false,
  loading = false,
  scope,
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const count = proposal ? countProposalItems(proposal) : 0;
  const identityBlocked = hasBlockingClarifications(clarifications);
  const websiteField = normalized?.fieldUpdates.find((f) => f.field === "website");
  const partnerNameClarifyPending = clarifications.some(
    (c) => c.blocking && (c.id === "partnerName" || c.id === "name")
  );

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
      await onConfirm(filterNormalized(normalized, excluded));
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  if (!proposal || !normalized) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex-1 flex items-center justify-center text-base text-zinc-400 text-center px-8">
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

  const saveDisabled = applying || total - excluded.size <= 0 || identityBlocked;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex items-center justify-between mb-3">
        <div className="text-base font-semibold text-zinc-700">{ip.liveTitle}</div>
        <div className="text-sm text-zinc-400">
          {ip.foundItems.replace("{count}", String(count))}
          {changes && (changes.added.length > 0 || changes.updated.length > 0) && (
            <span className="text-emerald-600 ml-1">
              {ip.justNowAdded.replace("{added}", String(changes.added.length))}
              {changes.updated.length > 0 ? ip.justNowUpdated.replace("{updated}", String(changes.updated.length)) : ""}
            </span>
          )}
        </div>
      </div>

      {(clarifications.length > 0 && (onDirectClarify || onAiClarify)) && (
        <ClarifyPanels
          clarifications={clarifications}
          onDirectClarify={onDirectClarify}
          onAiClarify={onAiClarify}
          disabled={loading}
        />
      )}

      {(normalized.summary || normalized.partnerName) && (
        <div className="shrink-0 rounded-lg bg-indigo-50 border border-indigo-100 p-3 mb-3">
          {normalized.summaryTitle && (
            <div className="text-xs font-semibold text-indigo-700 mb-1">{normalized.summaryTitle}</div>
          )}
          {normalized.summary && (
            <p className="text-sm text-indigo-900 whitespace-pre-wrap leading-relaxed">{normalized.summary}</p>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
        {total === 0 ? (
          <p className="text-sm text-zinc-400 text-center py-8">{ip.nothingToSave}</p>
        ) : (
          <>
            {(sections.partnerName && (normalized.partnerName || (onProposalEdit && !partnerNameClarifyPending))) && (
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
                  <span className="font-medium text-zinc-800 shrink-0">{am.editPartnerName}</span>
                  {onProposalEdit ? (
                    <DraftInlineEdit
                      value={normalized.partnerName ?? ""}
                      placeholder={am.editPartnerName}
                      onCommit={(v) => onProposalEdit({ type: "partnerName", value: v })}
                      className="flex-1 min-w-0 rounded-md border border-indigo-200 bg-white px-2 py-1 text-sm text-emerald-800 focus:outline-none focus:ring-1 focus:ring-indigo-400"
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
                    <span className="font-medium text-zinc-800 shrink-0">{f.label}</span>
                    {f.oldValue ? (
                      <span className="text-zinc-400 line-through decoration-red-300 text-xs">{f.oldValue}</span>
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
                  <span className="text-sm font-medium text-zinc-700 shrink-0">{am.editWebsite}</span>
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
                  <span className="font-medium text-zinc-800">
                    {c.action === "update" ? ip.updateContact : ip.contact}: {c.name}
                  </span>
                  <span className="text-zinc-500 ml-1.5 text-xs">
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
                  <span className="font-medium text-zinc-800">
                    {o.action === "update" ? ip.updateOpportunity : ip.opportunity}: {o.name}
                  </span>
                  <span className="text-zinc-500 ml-1.5 text-xs">
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
                  <span className="font-medium text-zinc-800">{ip.todo}: {t.title}</span>
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
                  <span className="font-medium text-zinc-800">{ip.milestone}: {r.title}</span>
                  <span className="text-zinc-500 ml-1.5 text-xs">
                    {[r.category, r.occurredAt, r.contactName].filter(Boolean).join(" · ")}
                  </span>
                </DraftRow>
              );
            })}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {questions.length > 0 && !ready && clarifications.length === 0 && (
        <div className="shrink-0 mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
          {ip.questionsHint.replace("{questions}", questions.join("; "))}
        </div>
      )}

      {applyError && (
        <div className="shrink-0 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {applyError}
        </div>
      )}

      <div className="shrink-0 sticky bottom-0 pt-3 mt-2 border-t border-zinc-100 bg-white/95 backdrop-blur-sm flex flex-col gap-2">
        {identityBlocked && (
          <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{am.confirmBlockedIdentity}</div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-400">
            {ip.itemsSummary.replace("{total}", String(total)).replace("{excluded}", String(excluded.size))}
          </div>
          <button
            onClick={confirm}
            disabled={saveDisabled}
            className="rounded-lg bg-emerald-600 text-white font-medium px-5 py-2.5 text-sm hover:bg-emerald-700 disabled:opacity-50 shrink-0"
          >
            {applying ? ip.saving : ready ? `✓ ${confirmBtn}` : confirmBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClarifyPanels({
  clarifications,
  onDirectClarify,
  onAiClarify,
  disabled,
}: {
  clarifications: IntakeClarification[];
  onDirectClarify?: (id: string, value: string) => void;
  onAiClarify?: (answers: ClarificationAnswer[]) => void;
  disabled?: boolean;
}) {
  const am = useMessages().assistant;
  const { identity, direct, ai } = partitionClarifications(clarifications);
  const [aiPicked, setAiPicked] = useState<Record<string, string | Set<string>>>({});
  const [directDone, setDirectDone] = useState<Set<string>>(new Set());
  const [otherOpen, setOtherOpen] = useState<Record<string, boolean>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});

  const aiAnsweredCount = ai.filter((c) => {
    const v = aiPicked[c.id];
    if (c.multi) return v instanceof Set && v.size > 0;
    return typeof v === "string" && v.length > 0;
  }).length;
  const aiAllAnswered = ai.length > 0 && aiAnsweredCount === ai.length;

  const identityAi = identity.filter((c) => getClarificationMode(c) === "ai");
  const identityDirect = identity.filter((c) => getClarificationMode(c) === "direct");

  function applyDirect(c: IntakeClarification, value: string) {
    if (!onDirectClarify || disabled) return;
    onDirectClarify(c.id, value);
    setDirectDone((prev) => new Set(prev).add(c.id));
    setOtherOpen((prev) => ({ ...prev, [c.id]: false }));
    setOtherText((prev) => ({ ...prev, [c.id]: "" }));
  }

  function applyAi(c: IntakeClarification, value: string) {
    if (!onAiClarify || disabled) return;
    onAiClarify([{ id: c.id, question: c.question, value }]);
    setOtherOpen((prev) => ({ ...prev, [c.id]: false }));
    setOtherText((prev) => ({ ...prev, [c.id]: "" }));
    setAiPicked((prev) => {
      const next = { ...prev };
      delete next[c.id];
      return next;
    });
  }

  function pickOption(c: IntakeClarification, opt: string, mode: "direct" | "ai") {
    if (disabled) return;
    if (isOpenEndedClarificationOption(opt)) {
      setOtherOpen((prev) => ({ ...prev, [c.id]: true }));
      return;
    }
    if (mode === "direct") applyDirect(c, opt);
    else pickAiSingle(c, opt);
  }

  function pickAiSingle(c: IntakeClarification, opt: string) {
    if (disabled) return;
    setAiPicked((prev) => ({ ...prev, [c.id]: opt }));
  }

  function toggleAiMulti(id: string, opt: string) {
    if (disabled) return;
    setAiPicked((prev) => {
      const next = { ...prev };
      const set = new Set(prev[id] instanceof Set ? (prev[id] as Set<string>) : []);
      if (set.has(opt)) set.delete(opt);
      else set.add(opt);
      next[id] = set;
      return next;
    });
  }

  function submitOther(c: IntakeClarification) {
    const text = otherText[c.id]?.trim();
    if (!text || disabled) return;
    if (getClarificationMode(c) === "direct") applyDirect(c, text);
    else applyAi(c, text);
  }

  function submitAiSingle(c: IntakeClarification) {
    const v = aiPicked[c.id];
    const value = typeof v === "string" ? v : "";
    if (!value.trim()) return;
    applyAi(c, value);
  }

  function submitAiBatch() {
    if (disabled || !onAiClarify || !aiAllAnswered) return;
    const answers: ClarificationAnswer[] = ai.map((c) => {
      const v = aiPicked[c.id];
      const value =
        c.multi && v instanceof Set ? [...v].join(", ") : typeof v === "string" ? v : "";
      return { id: c.id, question: c.question, value };
    });
    onAiClarify(answers);
    setAiPicked({});
  }

  function renderOptions(
    c: IntakeClarification,
    mode: "direct" | "ai",
    done: boolean,
    activeStyle: string,
    idleStyle: string
  ) {
    const v = aiPicked[c.id];
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {c.options.map((opt) => {
            if (isOpenEndedClarificationOption(opt)) return null;
            const active =
              mode === "ai" && (c.multi && v instanceof Set ? v.has(opt) : v === opt);
            return (
              <button
                key={opt}
                type="button"
                disabled={disabled || (mode === "direct" && done)}
                onClick={() => pickOption(c, opt, mode)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 ${
                  active ? activeStyle : idleStyle
                }`}
              >
                {opt}
              </button>
            );
          })}
          {c.allowOther && !otherOpen[c.id] && (
            <button
              type="button"
              disabled={disabled || (mode === "direct" && done)}
              onClick={() => setOtherOpen((prev) => ({ ...prev, [c.id]: true }))}
              className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 ${idleStyle}`}
            >
              {am.clarifyOther}
            </button>
          )}
        </div>
        {otherOpen[c.id] && (
          <div className="flex gap-1.5 items-center" onMouseDown={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={otherText[c.id] ?? ""}
              onChange={(e) => setOtherText((prev) => ({ ...prev, [c.id]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submitOther(c);
                }
              }}
              placeholder={am.clarifyOtherPlaceholder}
              className="flex-1 min-w-0 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <button
              type="button"
              disabled={disabled || !otherText[c.id]?.trim()}
              onClick={() => submitOther(c)}
              className="rounded-md bg-zinc-800 text-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-900 disabled:opacity-40 shrink-0"
            >
              {am.clarifyOtherConfirm}
            </button>
          </div>
        )}
        {mode === "ai" && !c.multi && !otherOpen[c.id] && typeof v === "string" && v.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => submitAiSingle(c)}
            className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-indigo-700 disabled:opacity-40"
          >
            {am.clarifyOtherConfirm}
          </button>
        )}
      </div>
    );
  }

  const identityPanel =
    identity.length > 0 && (onDirectClarify || onAiClarify) ? (
      <div className="rounded-xl border-2 border-amber-300 bg-amber-50/90 p-3 space-y-2.5 mb-3">
        <div>
          <div className="text-xs font-semibold text-amber-900">{am.clarifyIdentityTitle}</div>
          <div className="text-[10px] text-amber-800/90 mt-0.5">{am.clarifyIdentityHint}</div>
        </div>
        {[...identityDirect, ...identityAi].map((c) => {
          const mode = getClarificationMode(c);
          const done = directDone.has(c.id);
          return (
            <div key={c.id} className="space-y-1.5">
              <div className="text-xs text-zinc-800 flex items-center gap-2 font-medium">
                <span>{c.question}</span>
                {mode === "direct" && done && (
                  <span className="text-[10px] text-emerald-600 font-medium">{am.clarifyApplied}</span>
                )}
              </div>
              {renderOptions(
                c,
                mode,
                done,
                "border-amber-600 bg-amber-600 text-white",
                "border-amber-400 bg-white text-amber-950 hover:border-amber-600 hover:bg-amber-100"
              )}
            </div>
          );
        })}
      </div>
    ) : null;

  const directPanel =
    direct.length > 0 && onDirectClarify ? (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 space-y-2.5">
        <div>
          <div className="text-xs font-semibold text-emerald-900">{am.clarifyDirectTitle}</div>
          <div className="text-[10px] text-emerald-700/90 mt-0.5">{am.clarifyDirectHint}</div>
        </div>
        {direct.map((c) => (
          <div key={c.id} className="space-y-1.5">
            <div className="text-xs text-zinc-700 flex items-center gap-2">
              <span>{c.question}</span>
              {directDone.has(c.id) && (
                <span className="text-[10px] text-emerald-600 font-medium">{am.clarifyApplied}</span>
              )}
            </div>
            {renderOptions(
              c,
              "direct",
              directDone.has(c.id),
              "border-emerald-600 bg-emerald-600 text-white",
              "border-emerald-300 bg-white text-emerald-900 hover:border-emerald-500 hover:bg-emerald-100"
            )}
          </div>
        ))}
      </div>
    ) : null;

  const aiPanel =
    ai.length > 0 && onAiClarify ? (
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 space-y-2.5">
        <div>
          <div className="text-xs font-semibold text-indigo-900">{am.clarifyAiTitle}</div>
          <div className="text-[10px] text-indigo-700/90 mt-0.5">{am.clarifyAiHint}</div>
        </div>
        {ai.map((c) => (
          <div key={c.id} className="space-y-1.5">
            <div className="text-xs text-zinc-700">{c.question}</div>
            {renderOptions(
              c,
              "ai",
              false,
              "border-indigo-500 bg-indigo-500 text-white",
              "border-indigo-300 bg-white text-indigo-900 hover:border-indigo-500 hover:bg-indigo-100"
            )}
          </div>
        ))}
        <div className="flex items-center justify-between gap-2 pt-1">
          {!aiAllAnswered && (
            <span className="text-[10px] text-indigo-600">
              {am.clarifyAiPending.replace("{n}", String(ai.length - aiAnsweredCount))}
            </span>
          )}
          <button
            type="button"
            disabled={disabled || !aiAllAnswered}
            onClick={submitAiBatch}
            className="ml-auto rounded-lg bg-indigo-600 text-white px-4 py-2 text-xs font-medium hover:bg-indigo-700 disabled:opacity-40"
          >
            {am.clarifyAiSubmit}
          </button>
        </div>
      </div>
    ) : null;

  if (!identityPanel && !directPanel && !aiPanel) return null;

  return (
    <div className="shrink-0 mt-2 space-y-3">
      {identityPanel}
      {directPanel}
      {aiPanel}
    </div>
  );
}
