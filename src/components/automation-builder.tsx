"use client";

import { useMemo, useRef, useState } from "react";
import type { AiStreamState, AiTraceStep } from "@/lib/ai-trace";
import { consumeAiSse } from "@/lib/ai-trace";
import { createAutomationFromBuilderAction } from "@/lib/automation-actions";
import { formatAiClarificationMessage } from "@/lib/clarification-apply";
import { formatPreferencePick } from "@/lib/ai-clarifications";
import type {
  AutomationBuilderClarification,
  AutomationBuilderDraft,
  AutomationBuilderMessage,
  AutomationBuilderTurn,
} from "@/lib/automation-builder-types";
import { shouldBlockChatInput } from "@/lib/ai-clarifications";
import { describeCron } from "@/lib/cron";
import { AiClarificationFlow } from "@/components/ai-clarification-flow";
import { AiProcessTrace } from "@/components/ai-process-trace";
import { useLocale, useMessages } from "@/lib/i18n";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

function DraftPreview({ draft }: { draft: AutomationBuilderDraft }) {
  const a = useMessages().automations;
  const locale = useLocale();

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4 space-y-3">
      <div>
        <div className="text-xs text-slate-400 font-mono">{draft.slug || "—"}</div>
        <div className="text-sm font-semibold text-slate-900 mt-1">{draft.name || a.builderUntitled}</div>
        <div className="text-xs text-slate-500 mt-0.5">{draft.description || a.builderWaitingDesc}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white p-2">
          <div className="text-slate-400">{a.builderTrigger}</div>
          <div className="font-medium text-slate-800">
            {draft.triggerType === "SCHEDULE"
              ? a.triggerSchedule
              : draft.triggerType === "WEBHOOK"
                ? a.triggerWebhook
                : a.triggerEvent}
          </div>
        </div>
        <div className="rounded-lg bg-white p-2">
          <div className="text-slate-400">{a.builderSchedule}</div>
          <div className="font-medium text-slate-800">
            {draft.triggerType === "SCHEDULE" ? describeCron(draft.cronExpr, locale) : "—"}
          </div>
        </div>
      </div>
      {draft.variables.length > 0 && (
        <div className="rounded-lg bg-white p-3">
          <div className="text-xs font-semibold text-slate-700 mb-1.5">{a.variables}</div>
          <div className="flex flex-wrap gap-1.5">
            {draft.variables.map((v) => (
              <span key={v.key} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
                {`{{${v.key}}}`}
              </span>
            ))}
          </div>
        </div>
      )}
      {draft.rationale && <p className="text-xs text-slate-500 leading-relaxed">{draft.rationale}</p>}
      {draft.missingSkillNotes.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
          <div className="text-xs font-semibold text-amber-800 mb-1">{a.builderSkillGaps}</div>
          <ul className="list-disc list-inside text-xs text-amber-700 space-y-1">
            {draft.missingSkillNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}
      {draft.taskMd && (
        <details className="text-xs">
          <summary className="cursor-pointer text-sky-700 font-medium">{a.builderViewTaskMd}</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-950 text-slate-100 p-3 text-[11px] leading-relaxed max-h-64 overflow-y-auto">
            {draft.taskMd}
          </pre>
        </details>
      )}
    </div>
  );
}

export function AutomationBuilder() {
  const a = useMessages().automations;
  const locale = useLocale();
  const starters = a.builderStarters;
  const [messages, setMessages] = useState<AutomationBuilderMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [turn, setTurn] = useState<AutomationBuilderTurn | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveTrace, setLiveTrace] = useState<AiTraceStep[]>([]);
  const [replyText, setReplyText] = useState("");
  const [phase, setPhase] = useState("");
  const [phaseLabel, setPhaseLabel] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const draftJson = useMemo(() => JSON.stringify(turn?.draft ?? null), [turn]);

  const pendingClarifications = turn?.clarifications?.length ? turn.clarifications : [];
  const clarifyBlocked = shouldBlockChatInput(pendingClarifications) && !loading;

  async function send(text?: string) {
    const content = (text ?? inputText).trim();
    if (!content || loading || clarifyBlocked) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInputText("");
    setLoading(true);
    setError(null);
    setLiveTrace([]);
    setReplyText("");
    try {
      const res = await fetch("/api/ai/automation-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ messages: next, stream: true }),
      });
      const { data, trace, replyText: finalReply } = await consumeAiSse(res, (_ev, state: AiStreamState) => {
        setLiveTrace(state.trace);
        setReplyText(state.replyText);
        setPhase(state.phase);
        setPhaseLabel(state.phaseLabel);
      });
      const nextTurn = data as AutomationBuilderTurn;
      if (!nextTurn) throw new Error(a.builderBuildFailed);
      setTurn(nextTurn);
      setMessages([...next, { role: "assistant", content: finalReply || nextTurn.reply, trace: [...trace] }]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setReplyText("");
    }
  }

  function formatAnswers(answers: { id: string; question: string; value: string }[]) {
    return formatAiClarificationMessage(answers, locale);
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
      <div className="xl:col-span-3 bg-white rounded-lg border border-slate-200/80 shadow-sm flex flex-col min-h-[640px]">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-900">{a.builderTitle}</div>
          <div className="text-xs text-slate-400 mt-1">{a.builderDesc}</div>
        </div>
        <div className="flex-1 p-5 space-y-3 overflow-y-auto">
          {messages.length === 0 && (
            <div className="space-y-2">
              <div className="text-xs text-slate-400">{a.builderTryThese}</div>
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-xs text-slate-600 hover:border-slate-300 hover:text-sky-700"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={msg.role === "user" ? "flex flex-col items-end gap-2" : "flex flex-col items-start gap-2"}>
              {msg.role === "assistant" && msg.trace && Array.isArray(msg.trace) && msg.trace.length > 0 && (
                <AiProcessTrace steps={msg.trace as AiTraceStep[]} className="w-full max-w-[92%]" />
              )}
              <div
                className={`max-w-[86%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                  msg.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {pendingClarifications.length > 0 && !loading && (
            <div className="flex justify-start w-full">
              <AiClarificationFlow
                key={pendingClarifications.map((c) => c.id).join("-")}
                clarifications={pendingClarifications as AutomationBuilderClarification[]}
                disabled={loading}
                onRequiredContinue={(answers) => send(formatAnswers(answers))}
                onRequiredSkip={() => send(a.builderSkipMessage)}
                onPreferencePick={(answer) => send(formatPreferencePick(answer, locale))}
              />
            </div>
          )}
          {loading && (
            <div className="space-y-2 w-full">
              <AiProcessTrace steps={liveTrace} loading phase={phase} phaseLabel={phaseLabel} className="max-w-[92%]" />
              {replyText ? (
                <div className="max-w-[86%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed bg-slate-100 text-slate-800 border border-slate-200/80">
                  {replyText}
                  <span className="inline-block w-1.5 h-4 bg-slate-400 ml-0.5 align-middle" />
                </div>
              ) : liveTrace.length === 0 ? (
                <div className="text-xs text-slate-400">{a.builderSending}</div>
              ) : null}
            </div>
          )}
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-slate-100 p-3 flex flex-col gap-2">
          {clarifyBlocked && (
            <div className="text-xs text-sky-700 bg-sky-50 rounded-lg px-3 py-2">{a.builderClarifyBlockedHint}</div>
          )}
          <div className="flex gap-2">
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && send()}
              placeholder={clarifyBlocked ? a.builderClarifyBlockedPlaceholder : a.builderInputPlaceholder}
              disabled={clarifyBlocked}
              className={`${input} disabled:bg-slate-50 disabled:text-slate-400`}
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={loading || clarifyBlocked || !inputText.trim()}
              className="rounded-lg bg-slate-900 text-white px-4 text-sm hover:bg-slate-800 disabled:opacity-40 shrink-0"
            >
              {a.builderSend}
            </button>
          </div>
        </div>
      </div>

      <div className="xl:col-span-2 space-y-4">
        {turn?.draft ? (
          <>
            <DraftPreview draft={turn.draft} />
            <form action={createAutomationFromBuilderAction} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <input type="hidden" name="draft" value={draftJson} />
              <p className="text-xs text-slate-500 leading-relaxed">{a.builderConfirmHint}</p>
              <button
                type="submit"
                disabled={!turn.ready}
                className="w-full rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-40"
              >
                {turn.ready ? a.builderCreateReady : a.builderCreatePending}
              </button>
            </form>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-400">
            {a.builderEmptyPreview}
          </div>
        )}
      </div>
    </div>
  );
}
