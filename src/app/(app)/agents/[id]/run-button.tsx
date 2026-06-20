"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AiStreamState } from "@/lib/ai-trace";
import { consumeAiSse } from "@/lib/ai-trace";
import { saveAutomationAction, type PersistAutomationResult } from "@/lib/automation-actions";
import { useMessages } from "@/lib/i18n";

type SaveAction = (formData: FormData) => Promise<PersistAutomationResult>;

function saveErrorMessage(code: string, automations: ReturnType<typeof useMessages>["automations"]): string {
  switch (code) {
    case "description_required":
      return automations.saveErrorDescription;
    case "delivery_required":
      return automations.saveErrorDelivery;
    case "partner_not_found":
      return automations.saveErrorPartner;
    case "slug_exists":
      return automations.saveErrorSlug;
    default:
      return automations.saveErrorGeneric;
  }
}

export function RunButton({
  agentId,
  compact,
  formId,
  saveBeforeRun,
}: {
  agentId: string;
  compact?: boolean;
  /** 关联编辑表单 id；运行前先提交保存 */
  formId?: string;
  saveBeforeRun?: SaveAction;
}) {
  const { agents: a, automations: auto } = useMessages();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveText, setLiveText] = useState("");
  const router = useRouter();

  const saveFn = saveBeforeRun ?? (formId ? saveAutomationAction : undefined);
  const label = formId ? (compact ? auto.runSaveCompact : auto.runSaveNow) : compact ? a.runCompact : a.runNow;

  async function run() {
    setRunning(true);
    setError(null);
    setLiveText("");
    try {
      if (formId && saveFn) {
        const form = document.getElementById(formId) as HTMLFormElement | null;
        if (!form) throw new Error(auto.saveErrorGeneric);
        if (!form.reportValidity()) return;
        const fd = new FormData(form);
        const saved = await saveFn(fd);
        if (!saved.ok) {
          setError(saveErrorMessage(saved.error, auto));
          return;
        }
      }

      const res = await fetch(`/api/agents/${agentId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ stream: true }),
      });
      await consumeAiSse(res, (_ev, state: AiStreamState) => {
        setLiveText(state.liveText);
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : a.runFailed);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {running && liveText && (
        <div className="max-w-md text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-2 max-h-24 overflow-y-auto whitespace-pre-wrap">
          {liveText}
          <span className="inline-block w-1 h-3 bg-emerald-400 ml-0.5 align-middle" />
        </div>
      )}
      <div className="flex items-center gap-2">
        {error && (
          <span className="text-xs text-red-500 max-w-xs truncate" title={error}>
            {error}
          </span>
        )}
        <button
          type="button"
          onClick={run}
          disabled={running}
          className={
            compact
              ? "rounded-md bg-emerald-600 text-white px-2.5 py-1 text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
              : "rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          }
        >
          {running ? a.running : label}
        </button>
      </div>
    </div>
  );
}
