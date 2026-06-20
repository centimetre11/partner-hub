"use client";

import { useMemo, useRef, useState } from "react";
import type { AiStreamState, AiTraceStep } from "@/lib/ai-trace";
import { consumeAiSse } from "@/lib/ai-trace";
import { createAgentFromBuilderAction } from "@/lib/agent-actions";
import { formatAiClarificationMessage } from "@/lib/clarification-apply";
import type {
  AgentBuilderClarification,
  AgentBuilderDraft,
  AgentBuilderMessage,
  AgentBuilderTurn,
} from "@/lib/agent-builder-types";
import { AiClarificationCard } from "@/components/ai-clarification-card";
import { AiProcessTrace } from "@/components/ai-process-trace";
import { useLocale, useMessages } from "@/lib/i18n";
import { getToolLabel } from "@/lib/tool-labels";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

function DraftPreview({ draft }: { draft: AgentBuilderDraft }) {
  const m = useMessages().agents;
  const locale = useLocale();

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="text-2xl">{draft.icon || "🤖"}</div>
        <div>
          <div className="text-sm font-semibold text-slate-900">{draft.name || m.builderUntitled}</div>
          <div className="text-xs text-slate-500">{draft.description || m.builderWaitingDesc}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white p-2">
          <div className="text-slate-400">{m.builderTrigger}</div>
          <div className="font-medium text-slate-800">
            {draft.trigger === "SCHEDULE" ? m.builderScheduled : m.builderManual}
          </div>
        </div>
        <div className="rounded-lg bg-white p-2">
          <div className="text-slate-400">{m.builderScope}</div>
          <div className="font-medium text-slate-800">
            {draft.scopeType === "PARTNER" ? m.builderScopePartner : m.builderScopeGlobal}
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white p-3 space-y-2">
        <div className="text-xs font-semibold text-slate-700">
          {m.builderTools}
          {draft.skills.length > 0 && (
            <span className="ml-1.5 font-normal text-slate-400">({draft.skills.length})</span>
          )}
        </div>
        {draft.skills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {draft.skills.map((name) => (
              <span
                key={name}
                className="inline-flex items-center rounded-md border border-sky-100 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-800"
                title={name}
              >
                {getToolLabel(name, locale)}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-slate-400">{m.builderNoTools}</div>
        )}
        {draft.skillIds.length > 0 && (
          <>
            <div className="text-xs font-semibold text-slate-700 pt-1">
              {m.builderSkills}
              <span className="ml-1.5 font-normal text-slate-400">({draft.skillIds.length})</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {draft.skillIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center rounded-md border border-violet-100 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-800"
                >
                  {id}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {draft.rationale && <p className="text-xs text-slate-500 leading-relaxed">{draft.rationale}</p>}
      {draft.missingSkillNotes.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
          <div className="text-xs font-semibold text-amber-800 mb-1">{m.builderSkillGaps}</div>
          <ul className="list-disc list-inside text-xs text-amber-700 space-y-1">
            {draft.missingSkillNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}
      {draft.instructions && (
        <details className="text-xs">
          <summary className="cursor-pointer text-sky-700 font-medium">{m.builderViewInstructions}</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-3 text-slate-600 leading-relaxed">
            {draft.instructions}
          </pre>
        </details>
      )}
    </div>
  );
}

export function AgentBuilder() {
  const m = useMessages().agents;
  const locale = useLocale();
  const starters = m.builderStarters;
  const [messages, setMessages] = useState<AgentBuilderMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [turn, setTurn] = useState<AgentBuilderTurn | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveTrace, setLiveTrace] = useState<AiTraceStep[]>([]);
  const [replyText, setReplyText] = useState("");
  const [phase, setPhase] = useState("");
  const [phaseLabel, setPhaseLabel] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const draftJson = useMemo(() => JSON.stringify(turn?.draft ?? null), [turn]);

  const pendingClarifications =
    turn && !turn.ready && turn.clarifications.length > 0 ? turn.clarifications : [];
  const clarifyBlocked = pendingClarifications.length > 0 && !loading;

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
      const res = await fetch("/api/ai/agent-builder", {
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
      const nextTurn = data as AgentBuilderTurn;
      if (!nextTurn) throw new Error(m.builderBuildFailed);
      setTurn(nextTurn);
      setMessages([
        ...next,
        { role: "assistant", content: finalReply || nextTurn.reply, trace: [...trace] },
      ]);
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

  function handleSkipQuestions() {
    send(m.builderSkipMessage);
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
      <div className="xl:col-span-3 bg-white rounded-lg border border-slate-200/80 shadow-sm flex flex-col min-h-[640px]">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-900">{m.builderTitle}</div>
          <div className="text-xs text-slate-400 mt-1">{m.builderDesc}</div>
        </div>
        <div className="flex-1 p-5 space-y-3 overflow-y-auto">
          {messages.length === 0 && (
            <div className="space-y-2">
              <div className="text-xs text-slate-400">{m.builderTryThese}</div>
              {starters.map((s) => (
                <button
                  key={s}
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
              {msg.role === "assistant" && msg.trace && msg.trace.length > 0 && (
                <AiProcessTrace steps={msg.trace} className="w-full max-w-[92%]" />
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
              <AiClarificationCard
                key={pendingClarifications.map((c) => c.id).join("-")}
                clarifications={pendingClarifications as AgentBuilderClarification[]}
                disabled={loading}
                onContinue={(answers) => send(formatAnswers(answers))}
                onSkip={handleSkipQuestions}
              />
            </div>
          )}
          {loading && (
            <div className="space-y-2 w-full">
              <AiProcessTrace
                steps={liveTrace}
                loading
                phase={phase}
                phaseLabel={phaseLabel}
                className="max-w-[92%]"
              />
              {replyText ? (
                <div className="max-w-[86%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed bg-slate-100 text-slate-800 border border-slate-200/80">
                  {replyText}
                  <span className="inline-block w-1.5 h-4 bg-slate-400 ml-0.5 align-middle" />
                </div>
              ) : liveTrace.length === 0 ? (
                <div className="text-xs text-slate-400">{m.builderSending}</div>
              ) : null}
            </div>
          )}
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-slate-100 p-3 flex flex-col gap-2">
          {clarifyBlocked && (
            <div className="text-xs text-sky-700 bg-sky-50 rounded-lg px-3 py-2">{m.builderClarifyBlockedHint}</div>
          )}
          <div className="flex gap-2">
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && send()}
              placeholder={clarifyBlocked ? m.builderClarifyBlockedPlaceholder : m.builderInputPlaceholder}
              disabled={clarifyBlocked}
              className={`${input} disabled:bg-slate-50 disabled:text-slate-400`}
            />
            <button
              onClick={() => send()}
              disabled={loading || clarifyBlocked || !inputText.trim()}
              className="rounded-lg bg-slate-900 text-white px-4 text-sm hover:bg-slate-800 disabled:opacity-40 shrink-0"
            >
              {m.builderSend}
            </button>
          </div>
        </div>
      </div>

      <div className="xl:col-span-2 space-y-4">
        {turn?.draft ? (
          <>
            <DraftPreview draft={turn.draft} />
            <form action={createAgentFromBuilderAction} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <input type="hidden" name="draft" value={draftJson} />
              <p className="text-xs text-slate-500 leading-relaxed">{m.builderConfirmHint}</p>
              <button
                disabled={!turn.ready}
                className="w-full rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-700 disabled:opacity-40"
              >
                {turn.ready ? m.builderCreateReady : m.builderCreatePending}
              </button>
            </form>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-400">
            {m.builderEmptyPreview}
          </div>
        )}
      </div>
    </div>
  );
}
