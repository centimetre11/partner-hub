"use client";

import { useMemo, useState } from "react";
import type { ExtractionProposal } from "@/lib/proposals";
import type { IntakeProposal } from "@/lib/ai-intake";
import { CONTACT_ROLE_LABELS, attitudeLabel } from "@/lib/constants";
import {
  filterNormalized,
  normalizeProposal,
  type NormalizedProposal,
} from "@/lib/proposal-normalize";

type Props = {
  proposal: IntakeProposal | ExtractionProposal;
  onConfirm: (filtered: NormalizedProposal) => Promise<void> | void;
  onCancel?: () => void;
  confirmLabel?: string;
  compact?: boolean;
  spacious?: boolean;
};

type RowTone = "field" | "contact" | "opp" | "todo" | "training" | "solution";

// AI proposal diff preview: save only after manual checkbox confirmation
export function ProposalView({ proposal, onConfirm, onCancel, confirmLabel = "Confirm & save", compact, spacious }: Props) {
  const normalized = useMemo(() => normalizeProposal(proposal), [proposal]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const toggle = (key: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const total = useMemo(
    () =>
      normalized.fieldUpdates.length +
      normalized.contacts.length +
      normalized.opportunities.length +
      normalized.todos.length +
      normalized.trainings.length +
      normalized.solutions.length +
      (normalized.partnerName ? 1 : 0),
    [normalized]
  );

  async function confirm() {
    setApplying(true);
    try {
      await onConfirm(filterNormalized(normalized, excluded));
    } finally {
      setApplying(false);
    }
  }

  const Row = ({ k, children, tone }: { k: string; children: React.ReactNode; tone: RowTone }) => {
    const colors: Record<RowTone, string> = {
      field: "border-l-amber-400",
      contact: "border-l-emerald-400",
      opp: "border-l-sky-400",
      todo: "border-l-purple-400",
      training: "border-l-orange-400",
      solution: "border-l-violet-400",
    };
    const off = excluded.has(k);
    return (
      <label
        className={`flex items-start gap-2.5 rounded-lg border border-zinc-100 border-l-4 ${colors[tone]} px-3 py-2.5 cursor-pointer transition-opacity ${off ? "opacity-40" : ""} ${compact ? "px-2.5 py-2" : ""}`}
      >
        <input type="checkbox" checked={!off} onChange={() => toggle(k)} className="mt-1 rounded" />
        <div className={`min-w-0 flex-1 ${compact ? "text-xs" : "text-sm"}`}>{children}</div>
      </label>
    );
  };

  return (
    <div className={`space-y-3 ${compact ? "text-xs" : ""}`}>
      {(normalized.summary || normalized.partnerName) && (
        <div className={`rounded-lg bg-indigo-50 border border-indigo-100 ${compact ? "p-2.5" : "p-4"}`}>
          {normalized.summaryTitle && (
            <div className="text-xs font-semibold text-indigo-700 mb-1">{normalized.summaryTitle}</div>
          )}
          {normalized.summary && (
            <p className={`text-indigo-900 whitespace-pre-wrap leading-relaxed ${compact ? "text-xs" : "text-sm"}`}>
              {normalized.summary}
            </p>
          )}
          {normalized.signals.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {normalized.signals.map((s, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-white/70 text-indigo-700">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {total === 0 ? (
        <p className={`text-zinc-400 text-center py-3 ${compact ? "text-xs" : "text-sm"}`}>
          Nothing to save yet — keep adding information.
        </p>
      ) : (
        <div className={`space-y-1.5 overflow-y-auto ${spacious ? "max-h-[min(480px,50vh)]" : compact ? "max-h-48" : "max-h-72"}`}>
          {normalized.partnerName && (
            <Row k="partner" tone="field">
              <span className="font-medium text-zinc-800">New partner</span>
              <span className="text-emerald-700 font-medium ml-1.5">{normalized.partnerName}</span>
            </Row>
          )}
          {normalized.fieldUpdates.map((f, i) => (
            <Row key={`f${i}`} k={`f${i}`} tone="field">
              <span className="font-medium text-zinc-800">{f.label}</span>
              {f.oldValue ? (
                <span className="text-zinc-400 mx-1.5 line-through decoration-red-300">{f.oldValue}</span>
              ) : null}
              <span className="text-emerald-700 font-medium">→ {f.newValue}</span>
              {f.reason && <div className="text-xs text-zinc-400 mt-0.5">Source: {f.reason}</div>}
            </Row>
          ))}
          {normalized.contacts.map((c, i) => (
            <Row key={`c${i}`} k={`c${i}`} tone="contact">
              <span className="font-medium text-zinc-800">
                {c.action === "update" ? "Update contact" : "Contact"}: {c.name}
              </span>
              <span className="text-zinc-500 ml-1.5 text-xs">
                {[
                  c.title,
                  c.department,
                  c.role && (CONTACT_ROLE_LABELS[c.role] ?? c.role),
                  typeof c.attitude === "number" && `Attitude: ${attitudeLabel(c.attitude)}`,
                  c.reportsToName && `Reports to: ${c.reportsToName}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {c.reason && <div className="text-xs text-zinc-400 mt-0.5">Source: {c.reason}</div>}
            </Row>
          ))}
          {normalized.opportunities.map((o, i) => (
            <Row key={`o${i}`} k={`o${i}`} tone="opp">
              <span className="font-medium text-zinc-800">
                {o.action === "update" ? "Update opportunity" : "Opportunity"}: {o.name}
              </span>
              <span className="text-zinc-500 ml-1.5 text-xs">
                {[o.client && `Client: ${o.client}`, o.amount, o.stage, o.nextStep && `Next: ${o.nextStep}`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {o.reason && <div className="text-xs text-zinc-400 mt-0.5">Source: {o.reason}</div>}
            </Row>
          ))}
          {normalized.trainings.map((t, i) => (
            <Row key={`tr${i}`} k={`tr${i}`} tone="training">
              <span className="font-medium text-zinc-800">Training: {t.person}</span>
              <span className="text-zinc-500 ml-1.5 text-xs">
                {[t.targetCert, t.deadline].filter(Boolean).join(" · ")}
              </span>
              {t.reason && <div className="text-xs text-zinc-400 mt-0.5">Source: {t.reason}</div>}
            </Row>
          ))}
          {normalized.solutions.map((s, i) => (
            <Row key={`s${i}`} k={`s${i}`} tone="solution">
              <span className="font-medium text-zinc-800">Joint solution: {s.name}</span>
              <span className="text-zinc-500 ml-1.5 text-xs">{s.targetCustomer}</span>
              {s.reason && <div className="text-xs text-zinc-400 mt-0.5">Source: {s.reason}</div>}
            </Row>
          ))}
          {normalized.todos.map((t, i) => (
            <Row key={`t${i}`} k={`t${i}`} tone="todo">
              <span className="font-medium text-zinc-800">Todo: {t.title}</span>
              <span className="text-zinc-500 ml-1.5 text-xs">
                {[t.dueDate && `Due ${t.dueDate}`, t.priority].filter(Boolean).join(" · ")}
              </span>
            </Row>
          ))}
        </div>
      )}

      <div className={`flex items-center justify-between gap-2 ${compact ? "flex-col items-stretch" : ""}`}>
        <div className="text-xs text-zinc-400">
          {total} item{total === 1 ? "" : "s"} · {excluded.size} excluded
        </div>
        <div className={`flex gap-2 ${compact ? "flex-col" : ""}`}>
          {onCancel && (
            <button
              onClick={onCancel}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              Discard
            </button>
          )}
          <button
            onClick={confirm}
            disabled={applying || total - excluded.size <= 0}
            className={`rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50 ${compact ? "px-3 py-2 text-sm" : "px-4 py-2 text-sm"}`}
          >
            {applying ? "Saving…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
