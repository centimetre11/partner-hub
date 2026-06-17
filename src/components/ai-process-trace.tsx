"use client";

import { useEffect, useRef } from "react";
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

function ToolStepRow({ step, active }: { step: Extract<AiTraceStep, { type: "tool" }>; active?: boolean }) {
  const hint = step.argHint ?? formatToolArgs(step.name, step.args);
  const running = step.status === "running";
  const showDetail = running || !!step.result || !!step.error;

  return (
    <div
      className={`rounded-lg border overflow-hidden transition-colors ${
        running || active ? "border-indigo-200 bg-indigo-50/40" : "border-zinc-200/80 bg-white"
      }`}
    >
      <div className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <StatusIcon status={step.status} />
        <span className="text-[11px] font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded shrink-0">
          {step.label}
        </span>
        <span className="text-xs text-zinc-500 truncate flex-1">{hint}</span>
      </div>
      {showDetail && (
        <div className="px-3 pb-2.5 pt-0 border-t border-zinc-100/80">
          {step.result ? (
            <div className="text-xs text-zinc-600 whitespace-pre-wrap leading-relaxed">
              {step.result}
              {running && (
                <span className="inline-block w-1 h-3.5 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
              )}
            </div>
          ) : running ? (
            <div className="text-xs text-zinc-400 animate-pulse">Running…</div>
          ) : null}
          {step.error && <div className="text-xs text-red-600 mt-1">{step.error}</div>}
        </div>
      )}
    </div>
  );
}

function ReasoningRow({ step }: { step: Extract<AiTraceStep, { type: "reasoning" }> }) {
  if (!step.content.trim()) return null;
  const running = step.status === "running";
  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        running ? "border-violet-200 bg-violet-50/50" : "border-violet-100 bg-violet-50/30"
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <StatusIcon status={step.status} />
        <span className="text-xs font-medium text-violet-800 shrink-0">Thinking</span>
      </div>
      <div className="px-3 pb-2.5 text-xs text-violet-900/80 whitespace-pre-wrap leading-relaxed border-t border-violet-100/80 pt-2">
        {step.content}
        {running && <span className="inline-block w-1 h-3.5 bg-violet-400 ml-0.5 animate-pulse align-middle" />}
      </div>
    </div>
  );
}

const PHASE_LABELS: Record<string, string> = {
  research: "Researching",
  extract: "Building proposal",
  reply: "Generating reply",
  idle: "",
};

export function AiProcessTrace({
  steps,
  loading,
  phase,
  phaseLabel,
  className = "",
  defaultCollapsed = false,
}: {
  steps: AiTraceStep[];
  loading?: boolean;
  phase?: string;
  phaseLabel?: string;
  className?: string;
  /** Whether to collapse into a one-line summary when complete */
  defaultCollapsed?: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const toolCount = steps.filter((s) => s.type === "tool").length;
  const running = steps.some((s) => s.status === "running");
  const doneCount = steps.filter((s) => s.status === "done").length;
  const latestToolId = [...steps].reverse().find((s) => s.type === "tool")?.id;
  const waiting = !!loading && !running;

  useEffect(() => {
    if (loading || running) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [steps, loading, running]);

  if (!steps.length && !loading) return null;

  const phaseText = phaseLabel || (phase ? PHASE_LABELS[phase] : "");

  return (
    <div className={`rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-2.5 ${className}`}>
      {(loading || running) && (
        <div className="h-1 rounded-full bg-indigo-100 overflow-hidden mb-2 relative">
          <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-indigo-400 to-purple-500 rounded-full animate-pulse" />
        </div>
      )}
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-medium text-zinc-500 shrink-0">
            {loading || running ? "Processing" : "Process trace"}
            {toolCount > 0 && ` · ${toolCount} step${toolCount === 1 ? "" : "s"}`}
            {doneCount > 0 && (loading || running) && ` (${doneCount} done)`}
          </span>
          {(loading || running) && (
            <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              AI working
            </span>
          )}
          {phaseText && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 truncate">
              {phaseText}
            </span>
          )}
        </div>
      </div>
      <div className="space-y-2 max-h-[min(48vh,420px)] overflow-y-auto">
        {steps.map((s) =>
          s.type === "tool" ? (
            <ToolStepRow key={s.id} step={s} active={s.id === latestToolId && (loading || running)} />
          ) : (
            <ReasoningRow key={s.id} step={s} />
          )
        )}
        {loading && steps.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 px-1">
            <span className="inline-block w-3 h-3 border-2 border-zinc-200 border-t-indigo-500 rounded-full animate-spin" />
            Thinking…
          </div>
        )}
        {waiting && steps.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-indigo-500/80 px-2 py-1.5 rounded-lg bg-indigo-50/60 border border-indigo-100/80">
            <span className="inline-block w-3 h-3 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
            {phaseText ? `${phaseText}…` : "Waiting for next step…"}
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
