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
  type ProposalChanges,
} from "@/lib/proposal-merge";
import { filterNormalized, normalizeProposal, type NormalizedProposal } from "@/lib/proposal-normalize";

type RowTone = "field" | "contact" | "opp" | "todo" | "training" | "solution" | "partner";

type Props = {
  proposal: IntakeProposal | null;
  changes?: ProposalChanges | null;
  onConfirm: (filtered: NormalizedProposal) => Promise<void> | void;
  confirmLabel?: string;
  questions?: string[];
  clarifications?: IntakeClarification[];
  onClarify?: (text: string) => void;
  ready?: boolean;
  loading?: boolean;
};

export function LiveProposalDraft({
  proposal,
  changes,
  onConfirm,
  confirmLabel = "确认入库",
  questions = [],
  clarifications = [],
  onClarify,
  ready = false,
  loading = false,
}: Props) {
  const normalized = useMemo(
    () => (proposal ? normalizeProposal(proposal) : null),
    [proposal]
  );
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
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
    try {
      await onConfirm(filterNormalized(normalized, excluded));
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
          {isNew && flash && <span className="ml-2 text-[10px] text-emerald-600 font-medium">新</span>}
          {isUpdated && flash && <span className="ml-2 text-[10px] text-amber-600 font-medium">已更新</span>}
        </div>
      </label>
    );
  };

  if (!proposal || !normalized) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex-1 flex items-center justify-center text-base text-zinc-400 text-center px-8">
          {loading ? "AI 正在调研，找到的信息会实时出现在这里…" : "AI 找到的信息会实时出现在这里"}
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
    (normalized.partnerName ? 1 : 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex items-center justify-between mb-3">
        <div className="text-base font-semibold text-zinc-700">活草稿 · 待确认入库</div>
        <div className="text-sm text-zinc-400">
          已发现 {count} 项
          {changes && (changes.added.length > 0 || changes.updated.length > 0) && (
            <span className="text-emerald-600 ml-1">
              · 刚刚 +{changes.added.length}
              {changes.updated.length > 0 ? ` / 更新 ${changes.updated.length}` : ""}
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
          <p className="text-sm text-zinc-400 text-center py-8">还没有可入库的内容…</p>
        ) : (
          <>
            {normalized.partnerName && (
              <Row
                k="partner"
                tone="partner"
                isNew={changes?.added.includes("partner")}
                isUpdated={changes?.updated.includes("partner")}
              >
                <span className="font-medium text-zinc-800">新建伙伴</span>
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
                    {c.action === "update" ? "更新人物" : "人物"}：{c.name}
                  </span>
                  <span className="text-zinc-500 ml-1.5 text-xs">
                    {[c.title, c.role && (CONTACT_ROLE_LABELS[c.role] ?? c.role), typeof c.attitude === "number" && `态度:${attitudeLabel(c.attitude)}`]
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
                    {o.action === "update" ? "更新商机" : "商机"}：{o.name}
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
                  <span className="font-medium text-zinc-800">待办：{t.title}</span>
                </Row>
              );
            })}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {clarifications.length > 0 && onClarify && (
        <ClarifyBlock clarifications={clarifications} onClarify={onClarify} disabled={loading} />
      )}

      {questions.length > 0 && !ready && clarifications.length === 0 && (
        <div className="shrink-0 mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
          补充这些会更完整：{questions.join("；")}
        </div>
      )}

      <div className="shrink-0 sticky bottom-0 pt-3 mt-2 border-t border-zinc-100 bg-white/95 backdrop-blur-sm flex items-center justify-between gap-3">
        <div className="text-xs text-zinc-400">
          共 {total} 项 · 已排除 {excluded.size} 项
        </div>
        <button
          onClick={confirm}
          disabled={applying || total - excluded.size <= 0}
          className="rounded-lg bg-emerald-600 text-white font-medium px-5 py-2.5 text-sm hover:bg-emerald-700 disabled:opacity-50 shrink-0"
        >
          {applying ? "写入中…" : ready ? `✓ ${confirmLabel}` : confirmLabel}
        </button>
      </div>
    </div>
  );
}

function ClarifyBlock({
  clarifications,
  onClarify,
  disabled,
}: {
  clarifications: IntakeClarification[];
  onClarify: (text: string) => void;
  disabled?: boolean;
}) {
  // 多选题的本地勾选状态：{ [clarifyId]: Set<option> }
  const [picked, setPicked] = useState<Record<string, Set<string>>>({});

  const togglePick = (id: string, opt: string) =>
    setPicked((prev) => {
      const next = { ...prev };
      const set = new Set(next[id] ?? []);
      if (set.has(opt)) set.delete(opt);
      else set.add(opt);
      next[id] = set;
      return next;
    });

  const submitSingle = (q: string, opt: string) => {
    if (disabled) return;
    onClarify(`${q} ${opt}`);
  };

  const submitMulti = (c: IntakeClarification) => {
    if (disabled) return;
    const chosen = [...(picked[c.id] ?? [])];
    if (!chosen.length) return;
    onClarify(`${c.question} ${chosen.join("、")}`);
    setPicked((prev) => ({ ...prev, [c.id]: new Set() }));
  };

  return (
    <div className="shrink-0 mt-2 space-y-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
        <span>需要你帮忙澄清几点</span>
        <span className="text-[10px] text-amber-500">（点选即可，也可在左侧直接补充）</span>
      </div>
      {clarifications.map((c) => {
        const sel = picked[c.id] ?? new Set<string>();
        return (
          <div key={c.id} className="space-y-1.5">
            <div className="text-xs text-zinc-700">{c.question}</div>
            <div className="flex flex-wrap gap-1.5">
              {c.options.map((opt) => {
                const active = c.multi && sel.has(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={disabled}
                    onClick={() => (c.multi ? togglePick(c.id, opt) : submitSingle(c.question, opt))}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 ${
                      active
                        ? "border-amber-500 bg-amber-500 text-white"
                        : "border-amber-300 bg-white text-amber-800 hover:border-amber-500 hover:bg-amber-100"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
              {c.allowOther && !c.multi && (
                <span className="text-[10px] text-amber-500 self-center">其他情况可在左侧输入</span>
              )}
            </div>
            {c.multi && (
              <button
                type="button"
                disabled={disabled || sel.size === 0}
                onClick={() => submitMulti(c)}
                className="rounded-lg bg-amber-600 text-white px-3 py-1 text-xs hover:bg-amber-700 disabled:opacity-50"
              >
                确认所选（{sel.size}）
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
