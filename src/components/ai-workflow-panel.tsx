"use client";

import type { ReactNode } from "react";
import type { IntakeProposal, IntakeScope } from "@/lib/ai-intake";
import type { AiTraceStep } from "@/lib/ai-trace";
import type { ProposalChanges } from "@/lib/proposal-merge";
import { normalizedToIntake } from "@/lib/proposal-normalize";
import type { NormalizedProposal } from "@/lib/proposal-normalize";
import { AiProcessTrace } from "@/components/ai-process-trace";
import { LiveProposalDraft } from "@/components/live-proposal-draft";

type Msg = { role: "user" | "assistant"; content: string; trace?: AiTraceStep[] };

export function AiWorkflowPanel({
  title,
  subtitle,
  onClose,
  messages,
  loading,
  liveTrace,
  replyText,
  phase,
  phaseLabel,
  proposal,
  patchChanges,
  questions,
  ready,
  scope,
  partnerId,
  sourceText,
  onApplied,
  input,
  onInputChange,
  onSend,
  inputPlaceholder,
  sendDisabled,
  headerExtra,
  leftFooter,
  showDraftPanel = true,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  messages: Msg[];
  loading: boolean;
  liveTrace: AiTraceStep[];
  replyText: string;
  phase?: string;
  phaseLabel?: string;
  proposal: IntakeProposal | null;
  patchChanges?: ProposalChanges | null;
  questions?: string[];
  ready?: boolean;
  scope?: IntakeScope;
  partnerId?: string;
  sourceText?: string;
  onApplied?: (partnerId: string) => void;
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  inputPlaceholder?: string;
  sendDisabled?: boolean;
  headerExtra?: ReactNode;
  leftFooter?: ReactNode;
  /** 是否显示右侧活草稿栏（查询模式可关闭） */
  showDraftPanel?: boolean;
}) {
  async function apply(filtered: NormalizedProposal) {
    const res = await fetch("/api/ai/intake/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: scope ?? "new_partner",
        partnerId,
        proposal: normalizedToIntake(filtered),
        sourceText,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "写入失败");
    onApplied?.(data.partnerId);
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="shrink-0 px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="min-w-0">
          <div className="text-base font-semibold truncate">✦ {title}</div>
          {subtitle && <div className="text-xs text-indigo-200 mt-0.5">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {headerExtra}
          {onClose && (
            <button onClick={onClose} className="text-indigo-100 hover:text-white text-xl leading-none px-1">
              ×
            </button>
          )}
        </div>
      </div>

      <div
        className={`flex-1 min-h-0 grid grid-cols-1 ${showDraftPanel ? "md:grid-cols-[38%_62%]" : ""}`}
      >
        {/* 左侧：找信息 */}
        <div className="flex flex-col min-h-0 border-r border-zinc-100">
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}>
                {m.role === "assistant" && m.trace && m.trace.length > 0 && (
                  <AiProcessTrace steps={m.trace} className="w-full" />
                )}
                <div
                  className={`max-w-[96%] rounded-2xl px-4 py-3 text-[15px] whitespace-pre-wrap leading-relaxed ${
                    m.role === "user" ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-800"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="w-full space-y-2">
                <AiProcessTrace steps={liveTrace} loading phase={phase} phaseLabel={phaseLabel} />
                {replyText && (
                  <div className="rounded-2xl px-4 py-3 text-[15px] whitespace-pre-wrap leading-relaxed bg-zinc-100 text-zinc-800 border border-indigo-100">
                    {replyText}
                    <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="shrink-0 border-t p-4">
            {leftFooter ?? (
              <div className="flex gap-3 items-end">
                <textarea
                  value={input}
                  onChange={(e) => onInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      onSend();
                    }
                  }}
                  rows={3}
                  placeholder={inputPlaceholder ?? "输入后按 ⌘/Ctrl + Enter 发送…"}
                  className="flex-1 rounded-xl border border-zinc-200 px-4 py-3 text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={onSend}
                  disabled={sendDisabled}
                  className="rounded-xl bg-indigo-600 text-white px-6 py-3 text-[15px] font-medium hover:bg-indigo-700 disabled:opacity-50 shrink-0"
                >
                  发送
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：活草稿 */}
        {showDraftPanel && (
        <div className="flex flex-col min-h-0 p-5 md:p-6 bg-zinc-50/50">
          <LiveProposalDraft
            proposal={proposal}
            changes={patchChanges}
            onConfirm={apply}
            confirmLabel={ready ? "确认入库" : "信息够了，直接入库"}
            questions={questions}
            ready={ready}
            loading={loading}
          />
        </div>
        )}
      </div>
    </div>
  );
}
