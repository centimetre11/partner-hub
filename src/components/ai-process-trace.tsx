"use client";

import { useEffect, useRef, useState } from "react";
import type { AiTraceStep } from "@/lib/ai-trace";
import { formatToolArgs } from "@/lib/ai-trace";
import { getToolLabel } from "@/lib/tools-registry";

function StatusIcon({ status }: { status: AiTraceStep["status"] }) {
  if (status === "running") {
    return (
      <span className="inline-block w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin shrink-0" />
    );
  }
  if (status === "error") return <span className="text-red-500 shrink-0 text-sm">✕</span>;
  return <span className="text-emerald-500 shrink-0 text-sm">✓</span>;
}

function ToolStepRow({ step }: { step: Extract<AiTraceStep, { type: "tool" }> }) {
  const [showDetail, setShowDetail] = useState(false);
  const hint = step.argHint ?? formatToolArgs(step.name, step.args);
  const running = step.status === "running";
  return (
    <div
      className={`rounded-lg border overflow-hidden transition-colors ${running ? "border-indigo-200 bg-indigo-50/50" : "border-zinc-200/80 bg-white"}`}
    >
      <div className="w-full flex items-center gap-2 px-2.5 py-2 text-left">
        <StatusIcon status={step.status} />
        <span className="text-[11px] font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded shrink-0">
          {step.label}
        </span>
        <span className="text-xs text-zinc-500 truncate flex-1">{hint}</span>
        {step.result && (
          <button
            type="button"
            onClick={() => setShowDetail(!showDetail)}
            className="text-[10px] text-zinc-400 hover:text-zinc-600 shrink-0"
          >
            {showDetail ? "收起" : "详情"}
          </button>
        )}
      </div>
      {showDetail && step.result && (
        <div className="px-2.5 pb-2 text-[11px] text-zinc-600 bg-zinc-50 border-t border-zinc-100 pt-2 max-h-28 overflow-auto whitespace-pre-wrap leading-relaxed">
          {step.result}
        </div>
      )}
      {step.error && <div className="px-2.5 pb-2 text-[11px] text-red-600">{step.error}</div>}
    </div>
  );
}

function ReasoningRow({ step }: { step: Extract<AiTraceStep, { type: "reasoning" }> }) {
  const [open, setOpen] = useState(step.status === "running");
  if (!step.content.trim()) return null;
  return (
    <div className={`rounded-lg border overflow-hidden ${step.status === "running" ? "border-violet-200 bg-violet-50/50" : "border-violet-100 bg-violet-50/30"}`}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-2.5 py-2 text-left">
        <StatusIcon status={step.status} />
        <span className="text-xs font-medium text-violet-800">思考</span>
        <span className="text-[10px] text-violet-400 flex-1 truncate">{step.content}</span>
        <span className="text-[10px] text-violet-300 shrink-0">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="px-2.5 pb-2 text-xs text-violet-900/80 whitespace-pre-wrap leading-relaxed border-t border-violet-100 pt-2">
          {step.content}
        </div>
      )}
    </div>
  );
}

const PHASE_LABELS: Record<string, string> = {
  research: "调研中",
  extract: "整理提案",
  reply: "生成回复",
  idle: "",
};

export function AiProcessTrace({
  steps,
  loading,
  phase,
  phaseLabel,
  className = "",
}: {
  steps: AiTraceStep[];
  loading?: boolean;
  phase?: string;
  phaseLabel?: string;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const toolCount = steps.filter((s) => s.type === "tool").length;
  const running = steps.some((s) => s.status === "running");
  const doneCount = steps.filter((s) => s.status === "done").length;

  useEffect(() => {
    if (loading || running) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [steps, loading, running]);

  if (!steps.length && !loading) return null;

  const phaseText = phaseLabel || (phase ? PHASE_LABELS[phase] : "");

  if (!loading && !running && steps.length > 0 && collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className={`w-full text-left rounded-xl border border-zinc-200/80 bg-zinc-50/60 px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-100 ${className}`}
      >
        ✓ 已完成 {toolCount || doneCount} 步 · 点击展开
      </button>
    );
  }

  return (
    <div className={`rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-2.5 ${className}`}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-medium text-zinc-500 shrink-0">
            {loading || running ? "处理中" : "处理过程"}
            {toolCount > 0 && ` · ${toolCount} 步`}
          </span>
          {phaseText && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 truncate">
              {phaseText}
            </span>
          )}
        </div>
        {!loading && !running && steps.length > 0 && (
          <button type="button" onClick={() => setCollapsed(true)} className="text-[10px] text-zinc-400 hover:text-zinc-600 shrink-0">
            收起
          </button>
        )}
      </div>
      <div className="space-y-1.5 max-h-[min(42vh,360px)] overflow-y-auto">
        {steps.map((s) =>
          s.type === "tool" ? <ToolStepRow key={s.id} step={s} /> : <ReasoningRow key={s.id} step={s} />
        )}
        {loading && steps.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 px-1">
            <span className="inline-block w-3 h-3 border-2 border-zinc-200 border-t-indigo-500 rounded-full animate-spin" />
            正在思考…
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

export function toolLogToTrace(log: { tool: string; args: unknown; result: string }[]): AiTraceStep[] {
  return log.map((l, i) => ({
    type: "tool" as const,
    id: `log-${i}`,
    name: l.tool,
    label: getToolLabel(l.tool),
    args: (typeof l.args === "object" && l.args !== null ? l.args : { raw: l.args }) as Record<string, unknown>,
    result: l.result.length > 200 ? `${l.result.slice(0, 197)}…` : l.result,
    status: "done" as const,
  }));
}
