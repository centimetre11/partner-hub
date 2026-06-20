"use client";

import { createAgentFromBuilderAction } from "@/lib/agent-actions";
import { createAutomationFromBuilderAction } from "@/lib/automation-actions";
import type { AgentBuilderDraft } from "@/lib/agent-builder-types";
import type { AutomationBuilderDraft } from "@/lib/automation-builder-types";
import { describeCron } from "@/lib/cron";
import { useLocale, useMessages } from "@/lib/i18n/context";

export function AssistantBuilderPanel({
  kind,
  draft,
  ready,
}: {
  kind: "agent" | "automation";
  draft: AgentBuilderDraft | AutomationBuilderDraft;
  ready: boolean;
}) {
  const locale = useLocale();
  const m = useMessages();

  if (kind === "agent") {
    const d = draft as AgentBuilderDraft;
    const a = m.agents;
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 h-full overflow-y-auto">
        <div className="text-sm font-semibold text-slate-900">{a.builderTitle}</div>
        <div className="flex items-start gap-2">
          <span className="text-2xl">{d.icon || "🤖"}</span>
          <div>
            <div className="font-medium text-slate-800">{d.name || a.builderUntitled}</div>
            <div className="text-xs text-slate-500">{d.description || a.builderWaitingDesc}</div>
          </div>
        </div>
        <div className="text-xs text-slate-500">
          {a.builderTrigger}：{d.trigger === "SCHEDULE" ? a.builderScheduled : a.builderManual}
        </div>
        <form action={createAgentFromBuilderAction} className="space-y-2 pt-2 border-t border-slate-100">
          <input type="hidden" name="draft" value={JSON.stringify(d)} />
          <p className="text-xs text-slate-500">{a.builderConfirmHint}</p>
          <button
            type="submit"
            disabled={!ready}
            className="w-full rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-40"
          >
            {ready ? a.builderCreateReady : a.builderCreatePending}
          </button>
        </form>
      </div>
    );
  }

  const d = draft as AutomationBuilderDraft;
  const a = m.automations;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 h-full overflow-y-auto">
      <div className="text-sm font-semibold text-slate-900">{a.builderTitle}</div>
      <div>
        <div className="text-xs font-mono text-slate-400">{d.slug || "—"}</div>
        <div className="font-medium text-slate-800 mt-1">{d.name || a.builderUntitled}</div>
        <div className="text-xs text-slate-500">{d.description || a.builderWaitingDesc}</div>
      </div>
      <div className="text-xs text-slate-500">
        {a.builderSchedule}：{d.triggerType === "SCHEDULE" ? describeCron(d.cronExpr, locale) : d.triggerType}
      </div>
      <form action={createAutomationFromBuilderAction} className="space-y-2 pt-2 border-t border-slate-100">
        <input type="hidden" name="draft" value={JSON.stringify(d)} />
        <p className="text-xs text-slate-500">{a.builderConfirmHint}</p>
        <button
          type="submit"
          disabled={!ready}
          className="w-full rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-40"
        >
          {ready ? a.builderCreateReady : a.builderCreatePending}
        </button>
      </form>
    </div>
  );
}
