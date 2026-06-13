"use client";

import { useMemo, useState } from "react";
import type { ExtractionProposal } from "@/lib/proposals";
import { CONTACT_ROLE_LABELS, attitudeLabel } from "@/lib/constants";

type Props = {
  proposal: ExtractionProposal;
  onConfirm: (filtered: ExtractionProposal) => Promise<void> | void;
  onCancel?: () => void;
  confirmLabel?: string;
};

// AI 提案的 diff 预览：人工勾选确认后才入库
export function ProposalView({ proposal, onConfirm, onCancel, confirmLabel = "确认入库" }: Props) {
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
      proposal.fieldUpdates.length +
      proposal.contacts.length +
      proposal.opportunities.length +
      proposal.todos.length,
    [proposal]
  );

  async function confirm() {
    setApplying(true);
    try {
      const filtered: ExtractionProposal = {
        ...proposal,
        fieldUpdates: proposal.fieldUpdates.filter((_, i) => !excluded.has(`f${i}`)),
        contacts: proposal.contacts.filter((_, i) => !excluded.has(`c${i}`)),
        opportunities: proposal.opportunities.filter((_, i) => !excluded.has(`o${i}`)),
        todos: proposal.todos.filter((_, i) => !excluded.has(`t${i}`)),
      };
      await onConfirm(filtered);
    } finally {
      setApplying(false);
    }
  }

  const Row = ({
    k,
    children,
    tone,
  }: {
    k: string;
    children: React.ReactNode;
    tone: "field" | "contact" | "opp" | "todo";
  }) => {
    const colors = {
      field: "border-l-amber-400",
      contact: "border-l-emerald-400",
      opp: "border-l-sky-400",
      todo: "border-l-purple-400",
    };
    const off = excluded.has(k);
    return (
      <label
        className={`flex items-start gap-2.5 rounded-lg border border-zinc-100 border-l-4 ${colors[tone]} px-3.5 py-2.5 cursor-pointer transition-opacity ${off ? "opacity-40" : ""}`}
      >
        <input type="checkbox" checked={!off} onChange={() => toggle(k)} className="mt-1 rounded" />
        <div className="text-sm min-w-0 flex-1">{children}</div>
      </label>
    );
  };

  return (
    <div className="space-y-4">
      {proposal.summary && (
        <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-4">
          <div className="text-xs font-semibold text-indigo-700 mb-1">{proposal.summaryTitle}</div>
          <p className="text-sm text-indigo-900 whitespace-pre-wrap leading-relaxed">{proposal.summary}</p>
          {proposal.signals.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {proposal.signals.map((s, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-white/70 text-indigo-700">⚡ {s}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {total === 0 ? (
        <p className="text-sm text-zinc-400 text-center py-4">AI 没有从文本中发现需要更新的内容（摘要仍会存入时间线）。</p>
      ) : (
        <div className="space-y-2">
          {proposal.fieldUpdates.map((f, i) => (
            <Row key={`f${i}`} k={`f${i}`} tone="field">
              <span className="font-medium text-zinc-800">{f.label}</span>
              <span className="text-zinc-400 mx-1.5 line-through decoration-red-300">{f.oldValue || "（空）"}</span>
              <span className="text-emerald-700 font-medium">→ {f.newValue}</span>
              {f.reason && <div className="text-xs text-zinc-400 mt-0.5">依据：{f.reason}</div>}
            </Row>
          ))}
          {proposal.contacts.map((c, i) => (
            <Row key={`c${i}`} k={`c${i}`} tone="contact">
              <span className="font-medium text-zinc-800">
                {c.action === "add" ? "新增人物" : "更新人物"}：{c.name}
              </span>
              <span className="text-zinc-500 ml-1.5 text-xs">
                {[
                  c.title,
                  c.department,
                  c.role && (CONTACT_ROLE_LABELS[c.role] ?? c.role),
                  typeof c.attitude === "number" && `态度:${c.attitude}(${attitudeLabel(c.attitude)})`,
                  c.reportsToName && `汇报给:${c.reportsToName}`,
                  c.contactInfo,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {c.reason && <div className="text-xs text-zinc-400 mt-0.5">依据：{c.reason}</div>}
            </Row>
          ))}
          {proposal.opportunities.map((o, i) => (
            <Row key={`o${i}`} k={`o${i}`} tone="opp">
              <span className="font-medium text-zinc-800">
                {o.action === "add" ? "新增商机" : "更新商机"}：{o.name}
              </span>
              <span className="text-zinc-500 ml-1.5 text-xs">
                {[o.client && `客户:${o.client}`, o.amount, o.stage, o.nextStep && `下一步:${o.nextStep}`].filter(Boolean).join(" · ")}
              </span>
              {o.reason && <div className="text-xs text-zinc-400 mt-0.5">依据：{o.reason}</div>}
            </Row>
          ))}
          {proposal.todos.map((t, i) => (
            <Row key={`t${i}`} k={`t${i}`} tone="todo">
              <span className="font-medium text-zinc-800">新增待办：{t.title}</span>
              <span className="text-zinc-500 ml-1.5 text-xs">
                {[t.dueDate && `截止 ${t.dueDate}`, t.priority].filter(Boolean).join(" · ")}
              </span>
            </Row>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <div className="text-xs text-zinc-400">
          共 {total} 项变更，已排除 {excluded.size} 项 · 确认后写入档案并记入时间线（含审计）
        </div>
        <div className="flex gap-2">
          {onCancel && (
            <button onClick={onCancel} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
              放弃
            </button>
          )}
          <button
            onClick={confirm}
            disabled={applying}
            className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {applying ? "写入中…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
