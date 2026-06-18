"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IntakeProposal, IntakeClarification } from "@/lib/ai-intake";
import { CONTACT_ROLE_LABELS, attitudeLabel } from "@/lib/constants";
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
import {
  isOpenEndedClarificationOption,
  partitionClarifications,
  type ClarificationAnswer,
} from "@/lib/clarification-apply";
import { useMessages } from "@/lib/i18n/context";

type RowTone = "field" | "contact" | "opp" | "todo" | "training" | "solution" | "business" | "partner";

type Props = {
  proposal: IntakeProposal | null;
  changes?: ProposalChanges | null;
  onConfirm: (filtered: NormalizedProposal) => Promise<void> | void;
  confirmLabel?: string;
  questions?: string[];
  clarifications?: IntakeClarification[];
  /** Write known field picks straight into the draft (no LLM) */
  onDirectClarify?: (id: string, value: string) => void;
  /** Submit all AI-mode picks in one message */
  onAiClarify?: (answers: ClarificationAnswer[]) => void;
  ready?: boolean;
  loading?: boolean;
};

export function LiveProposalDraft({
  proposal,
  changes,
  onConfirm,
  confirmLabel = "Confirm & save",
  questions = [],
  clarifications = [],
  onDirectClarify,
  onAiClarify,
  ready = false,
  loading = false,
}: Props) {
  const normalized = useMemo(
    () => (proposal ? normalizeProposal(proposal) : null),
    [proposal]
  );
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [flashKeys, setFlashKeys] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const count = proposal ? countProposalItems(proposal) : 0;

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

  const Row = ({
    k,
    children,
    tone,
    isNew,
    isUpdated,
  }: {
    k: string;
    children: React.ReactNode;
    tone: RowTone;
    isNew?: boolean;
    isUpdated?: boolean;
  }) => {
    const colors: Record<RowTone, string> = {
      field: "border-l-amber-400",
      contact: "border-l-emerald-400",
      opp: "border-l-sky-400",
      todo: "border-l-purple-400",
      training: "border-l-orange-400",
      solution: "border-l-violet-400",
      business: "border-l-amber-500",
      partner: "border-l-indigo-400",
    };
    const off = excluded.has(k);
    const flash = flashKeys.has(k);
    return (
      <label
        className={`flex items-start gap-2.5 rounded-lg border border-zinc-100 border-l-4 ${colors[tone]} px-3 py-2.5 cursor-pointer transition-all duration-300 ${off ? "opacity-40" : ""} ${flash && isNew ? "bg-emerald-50/80 animate-in slide-in-from-right-2" : ""} ${flash && isUpdated ? "bg-amber-50/80" : ""}`}
      >
        <input type="checkbox" checked={!off} onChange={() => toggle(k)} className="mt-1 rounded" />
        <div className="min-w-0 flex-1 text-sm">
          {children}
          {isNew && flash && <span className="ml-2 text-[10px] text-emerald-600 font-medium">New</span>}
          {isUpdated && flash && <span className="ml-2 text-[10px] text-amber-600 font-medium">Updated</span>}
        </div>
      </label>
    );
  };

  if (!proposal || !normalized) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex-1 flex items-center justify-center text-base text-zinc-400 text-center px-8">
          {loading ? "AI is researching — findings will appear here live…" : "AI findings will appear here live"}
        </div>
      </div>
    );
  }

  const total =
    normalized.fieldUpdates.length +
    normalized.contacts.length +
    normalized.opportunities.length +
    normalized.todos.length +
    normalized.trainings.length +
    normalized.solutions.length +
    normalized.businessRecords.length +
    (normalized.partnerName ? 1 : 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex items-center justify-between mb-3">
        <div className="text-base font-semibold text-zinc-700">Live draft · pending confirmation</div>
        <div className="text-sm text-zinc-400">
          Found {count} item{count === 1 ? "" : "s"}
          {changes && (changes.added.length > 0 || changes.updated.length > 0) && (
            <span className="text-emerald-600 ml-1">
              · just now +{changes.added.length}
              {changes.updated.length > 0 ? ` / updated ${changes.updated.length}` : ""}
            </span>
          )}
        </div>
      </div>

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
          <p className="text-sm text-zinc-400 text-center py-8">Nothing to save yet…</p>
        ) : (
          <>
            {normalized.partnerName && (
              <Row
                k="partner"
                tone="partner"
                isNew={changes?.added.includes("partner")}
                isUpdated={changes?.updated.includes("partner")}
              >
                <span className="font-medium text-zinc-800">New partner</span>
                <span className="text-emerald-700 font-medium ml-1.5">{normalized.partnerName}</span>
              </Row>
            )}
            {normalized.fieldUpdates.map((f, i) => {
              const k = fieldKey(f.field) || `f${i}`;
              return (
                <Row
                  key={k}
                  k={k}
                  tone="field"
                  isNew={changes?.added.includes(k)}
                  isUpdated={changes?.updated.includes(k)}
                >
                  <span className="font-medium text-zinc-800">{f.label}</span>
                  {f.oldValue ? (
                    <span className="text-zinc-400 mx-1.5 line-through decoration-red-300">{f.oldValue}</span>
                  ) : null}
                  <span className="text-emerald-700 font-medium">→ {f.newValue}</span>
                </Row>
              );
            })}
            {normalized.contacts.map((c, i) => {
              const k = contactKey(c.name) || `c${i}`;
              return (
                <Row key={k} k={k} tone="contact" isNew={changes?.added.includes(k)} isUpdated={changes?.updated.includes(k)}>
                  <span className="font-medium text-zinc-800">
                    {c.action === "update" ? "Update contact" : "Contact"}: {c.name}
                  </span>
                  <span className="text-zinc-500 ml-1.5 text-xs">
                    {[c.title, c.role && (CONTACT_ROLE_LABELS[c.role] ?? c.role), typeof c.attitude === "number" && `Attitude: ${attitudeLabel(c.attitude)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Row>
              );
            })}
            {normalized.opportunities.map((o, i) => {
              const k = oppKey(o.name) || `o${i}`;
              return (
                <Row key={k} k={k} tone="opp" isNew={changes?.added.includes(k)} isUpdated={changes?.updated.includes(k)}>
                  <span className="font-medium text-zinc-800">
                    {o.action === "update" ? "Update opportunity" : "Opportunity"}: {o.name}
                  </span>
                  <span className="text-zinc-500 ml-1.5 text-xs">
                    {[o.client, o.amount, o.stage].filter(Boolean).join(" · ")}
                  </span>
                </Row>
              );
            })}
            {normalized.todos.map((t, i) => {
              const k = todoKey(t.title) || `t${i}`;
              return (
                <Row key={k} k={k} tone="todo" isNew={changes?.added.includes(k)} isUpdated={changes?.updated.includes(k)}>
                  <span className="font-medium text-zinc-800">Todo: {t.title}</span>
                </Row>
              );
            })}
            {normalized.businessRecords.map((r, i) => {
              const k = businessRecordKey(r.title) || `br${i}`;
              return (
                <Row key={k} k={k} tone="business" isNew={changes?.added.includes(k)} isUpdated={changes?.updated.includes(k)}>
                  <span className="font-medium text-zinc-800">Milestone: {r.title}</span>
                  <span className="text-zinc-500 ml-1.5 text-xs">
                    {[r.category, r.occurredAt, r.contactName].filter(Boolean).join(" · ")}
                  </span>
                </Row>
              );
            })}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {(clarifications.length > 0 && (onDirectClarify || onAiClarify)) && (
        <ClarifyPanels
          clarifications={clarifications}
          onDirectClarify={onDirectClarify}
          onAiClarify={onAiClarify}
          disabled={loading}
        />
      )}

      {questions.length > 0 && !ready && clarifications.length === 0 && (
        <div className="shrink-0 mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
          Adding these would make the profile more complete: {questions.join("; ")}
        </div>
      )}

      {applyError && (
        <div className="shrink-0 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {applyError}
        </div>
      )}

      <div className="shrink-0 sticky bottom-0 pt-3 mt-2 border-t border-zinc-100 bg-white/95 backdrop-blur-sm flex items-center justify-between gap-3">
        <div className="text-xs text-zinc-400">
          {total} item{total === 1 ? "" : "s"} · {excluded.size} excluded
        </div>
        <button
          onClick={confirm}
          disabled={applying || total - excluded.size <= 0}
          className="rounded-lg bg-emerald-600 text-white font-medium px-5 py-2.5 text-sm hover:bg-emerald-700 disabled:opacity-50 shrink-0"
        >
          {applying ? "Saving…" : ready ? `✓ ${confirmLabel}` : confirmLabel}
        </button>
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
  const { direct, ai } = partitionClarifications(clarifications);
  const [aiPicked, setAiPicked] = useState<Record<string, string | Set<string>>>({});
  const [directDone, setDirectDone] = useState<Set<string>>(new Set());

  const aiAnsweredCount = ai.filter((c) => {
    const v = aiPicked[c.id];
    if (c.multi) return v instanceof Set && v.size > 0;
    return typeof v === "string" && v.length > 0;
  }).length;
  const aiAllAnswered = ai.length > 0 && aiAnsweredCount === ai.length;

  function pickDirect(c: IntakeClarification, opt: string) {
    if (disabled) return;
    if (isOpenEndedClarificationOption(opt)) {
      onAiClarify?.([{ id: c.id, question: c.question, value: opt }]);
      return;
    }
    if (!onDirectClarify) return;
    onDirectClarify(c.id, opt);
    setDirectDone((prev) => new Set(prev).add(c.id));
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

  return (
    <div className="shrink-0 mt-2 space-y-3">
      {direct.length > 0 && onDirectClarify && (
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
              <div className="flex flex-wrap gap-1.5">
                {c.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={disabled || directDone.has(c.id)}
                    onClick={() => pickDirect(c, opt)}
                    className="rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs text-emerald-900 hover:border-emerald-500 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {ai.length > 0 && onAiClarify && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 space-y-2.5">
          <div>
            <div className="text-xs font-semibold text-indigo-900">{am.clarifyAiTitle}</div>
            <div className="text-[10px] text-indigo-700/90 mt-0.5">{am.clarifyAiHint}</div>
          </div>
          {ai.map((c) => {
            const v = aiPicked[c.id];
            return (
              <div key={c.id} className="space-y-1.5">
                <div className="text-xs text-zinc-700">{c.question}</div>
                <div className="flex flex-wrap gap-1.5">
                  {c.options.map((opt) => {
                    const active =
                      c.multi && v instanceof Set
                        ? v.has(opt)
                        : v === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          c.multi ? toggleAiMulti(c.id, opt) : pickAiSingle(c, opt)
                        }
                        className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 ${
                          active
                            ? "border-indigo-500 bg-indigo-500 text-white"
                            : "border-indigo-300 bg-white text-indigo-900 hover:border-indigo-500 hover:bg-indigo-100"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                  {c.allowOther && (
                    <span className="text-[10px] text-indigo-500 self-center">Other → type on the left</span>
                  )}
                </div>
              </div>
            );
          })}
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
      )}
    </div>
  );
}
