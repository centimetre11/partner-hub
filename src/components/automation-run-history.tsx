"use client";

import { Badge } from "@/components/ui";
import { AiProcessTrace } from "@/components/ai-process-trace";
import { parseToolLog, toolLogToTrace } from "@/lib/ai-trace";
import { useMessages } from "@/lib/i18n/context";

export type AutomationRunItem = {
  id: string;
  status: string;
  output: string | null;
  error: string | null;
  toolLog: string | null;
  startedAtLabel: string;
};

export function AutomationRunHistory({ runs }: { runs: AutomationRunItem[] }) {
  const m = useMessages();
  const a = m.automations;

  if (runs.length === 0) {
    return <p className="text-sm text-slate-400 py-2">{a.noRuns}</p>;
  }

  return (
    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
      {runs.map((run) => {
        const toolLog = parseToolLog(run.toolLog);
        return (
          <div key={run.id} className="rounded-lg border border-slate-200/80 bg-white p-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] text-slate-400">{run.startedAtLabel}</span>
              <Badge tone={run.status === "SUCCESS" ? "green" : run.status === "FAILED" ? "red" : "amber"}>
                {run.status === "SUCCESS" ? m.common.success : run.status === "FAILED" ? m.common.failed : m.common.running}
              </Badge>
            </div>
            {run.output && (
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans line-clamp-4">{run.output}</pre>
            )}
            {run.error && <p className="text-xs text-red-600 mt-1">{run.error}</p>}
            {toolLog.length > 0 && (
              <details className="mt-2">
                <summary className="text-[11px] text-slate-500 cursor-pointer font-medium">
                  {m.agents.toolTrace.replace("{n}", String(toolLog.length))}
                </summary>
                <div className="mt-1.5">
                  <AiProcessTrace steps={toolLogToTrace(toolLog)} />
                </div>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
