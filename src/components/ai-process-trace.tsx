"use client";

import { useState } from "react";
import type { AiTraceStep } from "@/lib/ai-trace";
import { consumeAiSse } from "@/lib/ai-trace";
import { getToolLabel } from "@/lib/tools-registry";
import { formatToolArgs } from "@/lib/ai-trace";

function StatusIcon({ status }: { status: AiTraceStep["status"] }) {
  if (status === "running") {
    return (
      <span className="inline-block w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin shrink-0" />
    );
  }
  if (status === "error") return <span className="text-red-500 shrink-0">✕</span>;
  return <span className="text-emerald-500 shrink-0">✓</span>;
}

function ToolStepRow({ step }: { step: Extract<AiTraceStep, { type: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const summary = formatToolArgs(step.name, step.args);
  return (
    <div className="rounded-lg border border-zinc-200/80 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-zinc-50/80 transition-colors"
      >
        <StatusIcon status={step.status} />
        <span className="text-[11px] font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded shrink-0">
          {step.label}
        </span>
        <span className="text-xs text-zinc-500 truncate flex-1">{summary}</span>
        <span className="text-[10px] text-zinc-300 shrink-0">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 space-y-1.5 border-t border-zinc-100 pt-2">
          <pre className="text-[10px] text-zinc-400 font-mono whitespace-pre-wrap break-all bg-zinc-50 rounded p-2 max-h-24 overflow-auto">
            {JSON.stringify(step.args, null, 2)}
          </pre>
          {step.result && (
            <div className="text-[11px] text-zinc-600 bg-zinc-50 rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap leading-relaxed">
              {step.result}
            </div>
          )}
          {step.error && <div className="text-[11px] text-red-600">{step.error}</div>}
        </div>
      )}
    </div>
  );
}

function ReasoningRow({ step }: { step: Extract<AiTraceStep, { type: "reasoning" }> }) {
  const [open, setOpen] = useState(step.status === "running");
  if (!step.content.trim()) return null;
  return (
    <div className="rounded-lg border border-violet-100 bg-violet-50/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
      >
        <StatusIcon status={step.status} />
        <span className="text-xs font-medium text-violet-800">思考过程</span>
        <span className="text-[10px] text-violet-400 flex-1 truncate">
          {step.status === "running" ? "分析中…" : step.content.slice(0, 48)}
        </span>
        <span className="text-[10px] text-violet-300 shrink-0">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 text-xs text-violet-900/80 whitespace-pre-wrap leading-relaxed border-t border-violet-100 pt-2">
          {step.content}
        </div>
      )}
    </div>
  );
}

export function AiProcessTrace({
  steps,
  loading,
  compact,
  className = "",
}: {
  steps: AiTraceStep[];
  loading?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const toolCount = steps.filter((s) => s.type === "tool").length;
  const running = steps.some((s) => s.status === "running");

  if (!steps.length && !loading) return null;

  const inner = (
    <div className={`space-y-1.5 ${compact ? "text-xs" : ""}`}>
      {steps.map((s) =>
        s.type === "tool" ? <ToolStepRow key={s.id} step={s} /> : <ReasoningRow key={s.id} step={s} />
      )}
      {loading && running === false && steps.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-zinc-400 px-1">
          <span className="inline-block w-3 h-3 border-2 border-zinc-200 border-t-indigo-500 rounded-full animate-spin" />
          正在思考…
        </div>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className={`rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-2.5 ${className}`}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-medium text-zinc-500">
            {loading || running ? "AI 处理中" : "处理过程"}
            {toolCount > 0 && ` · ${toolCount} 次工具调用`}
          </span>
          <button type="button" onClick={() => setCollapsed(!collapsed)} className="text-[10px] text-zinc-400 hover:text-zinc-600">
            {collapsed ? "展开" : "收起"}
          </button>
        </div>
        {!collapsed && inner}
      </div>
    );
  }

  return <div className={className}>{inner}</div>;
}

/** 将 Agent 运行日志转为 trace 步骤（复用同一套 UI） */
export function toolLogToTrace(log: { tool: string; args: unknown; result: string }[]): AiTraceStep[] {
  return log.map((l, i) => ({
    type: "tool" as const,
    id: `log-${i}`,
    name: l.tool,
    label: getToolLabel(l.tool),
    args: (typeof l.args === "object" && l.args !== null ? l.args : { raw: l.args }) as Record<string, unknown>,
    result: l.result,
    status: "done" as const,
  }));
}
