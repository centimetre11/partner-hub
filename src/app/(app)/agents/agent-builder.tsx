"use client";

import { useMemo, useRef, useState } from "react";
import type { AiStreamState } from "@/lib/ai-trace";
import { consumeAiSse } from "@/lib/ai-trace";
import { createAgentFromBuilderAction } from "@/lib/agent-actions";
import type {
  AgentBuilderClarification,
  AgentBuilderDraft,
  AgentBuilderMessage,
  AgentBuilderTurn,
} from "@/lib/agent-builder-types";
import { OTHER_OPTION_EN, OTHER_OPTION_ZH } from "@/lib/agent-builder-types";
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

function BuilderQuestionsCard({
  clarifications,
  disabled,
  onContinue,
  onSkip,
}: {
  clarifications: AgentBuilderClarification[];
  disabled?: boolean;
  onContinue: (answers: { id: string; question: string; value: string }[]) => void;
  onSkip: () => void;
}) {
  const m = useMessages();
  const ag = m.agents;
  const am = m.assistant;
  const locale = useLocale();
  const otherLabel = locale === "zh" ? OTHER_OPTION_ZH : OTHER_OPTION_EN;
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [otherOpen, setOtherOpen] = useState<Record<string, boolean>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});

  const allAnswered = clarifications.every((c) => {
    if (otherOpen[c.id]) return !!otherText[c.id]?.trim();
    return !!picked[c.id];
  });

  function pickOption(c: AgentBuilderClarification, value: string) {
    if (disabled) return;
    if (value === otherLabel) {
      setOtherOpen((prev) => ({ ...prev, [c.id]: true }));
      setPicked((prev) => {
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
      return;
    }
    setOtherOpen((prev) => ({ ...prev, [c.id]: false }));
    setOtherText((prev) => ({ ...prev, [c.id]: "" }));
    setPicked((prev) => ({ ...prev, [c.id]: value }));
  }

  function submitContinue() {
    if (disabled || !allAnswered) return;
    const answers = clarifications.map((c) => ({
      id: c.id,
      question: c.question,
      value: otherOpen[c.id] ? otherText[c.id]!.trim() : picked[c.id]!,
    }));
    onContinue(answers);
    setPicked({});
    setOtherOpen({});
    setOtherText({});
  }

  return (
    <div className="max-w-[92%] rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
        <div className="text-xs font-semibold text-slate-700">{ag.builderQuestionsTitle}</div>
      </div>
      <div className="p-4 space-y-4">
        {clarifications.map((c) => {
          const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
          const displayOptions = [...c.options, otherLabel];
          return (
            <div key={c.id} className="space-y-2">
              <div className="text-sm text-slate-800 leading-snug">{c.question}</div>
              <div className="space-y-1.5">
                {displayOptions.map((opt, idx) => {
                  const isOther = opt === otherLabel;
                  const isRecommended = idx === 0;
                  const active = isOther ? otherOpen[c.id] : picked[c.id] === opt;
                  return (
                    <div key={`${c.id}-${idx}`}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => pickOption(c, opt)}
                        className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-50 ${
                          active
                            ? "border-slate-800 bg-slate-900 text-white"
                            : "border-slate-200 bg-slate-50/50 text-slate-700 hover:border-slate-300 hover:bg-white"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold ${
                            active ? "bg-white/15 text-white" : "bg-white border border-slate-200 text-slate-500"
                          }`}
                        >
                          {letters[idx] ?? "?"}
                        </span>
                        <span className="leading-snug">
                          {opt}
                          {isRecommended && !isOther && (
                            <span className={`ml-1.5 text-[11px] ${active ? "text-white/80" : "text-sky-600"}`}>
                              ({ag.builderRecommended})
                            </span>
                          )}
                        </span>
                      </button>
                      {isOther && otherOpen[c.id] && (
                        <div className="mt-1.5 flex gap-1.5 pl-8" onMouseDown={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={otherText[c.id] ?? ""}
                            onChange={(e) => setOtherText((prev) => ({ ...prev, [c.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.nativeEvent.isComposing && allAnswered) {
                                e.preventDefault();
                                submitContinue();
                              }
                            }}
                            placeholder={am.clarifyOtherPlaceholder}
                            className="flex-1 min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50/50">
        <button
          type="button"
          disabled={disabled}
          onClick={onSkip}
          className="rounded-md px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-40"
        >
          {ag.builderSkip}
        </button>
        <button
          type="button"
          disabled={disabled || !allAnswered}
          onClick={submitContinue}
          className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-40"
        >
          {ag.builderContinue}
          <span className="text-[10px] opacity-80">↵</span>
        </button>
      </div>
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
  const [liveText, setLiveText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const draftJson = useMemo(() => JSON.stringify(turn?.draft ?? null), [turn]);

  const pendingClarifications =
    turn && !turn.ready && turn.clarifications.length > 0 ? turn.clarifications : [];

  async function send(text?: string) {
    const content = (text ?? inputText).trim();
    if (!content || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInputText("");
    setLoading(true);
    setError(null);
    setLiveText("");
    try {
      const res = await fetch("/api/ai/agent-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ messages: next, stream: true }),
      });
      const { data, liveText: finalText } = await consumeAiSse(res, (_ev, state: AiStreamState) => {
        setLiveText(state.liveText);
      });
      const nextTurn = data as AgentBuilderTurn;
      if (!nextTurn) throw new Error(m.builderBuildFailed);
      setTurn(nextTurn);
      setMessages([...next, { role: "assistant", content: finalText || nextTurn.reply }]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setLiveText("");
    }
  }

  function formatAnswers(answers: { id: string; question: string; value: string }[]) {
    const sep = locale === "zh" ? "：" : ": ";
    return `${m.builderConfirmPrefix}\n${answers.map((a, i) => `${i + 1}. ${a.question}${sep}${a.value}`).join("\n")}`;
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
            <div key={i} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
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
            <div className="flex justify-start">
              <BuilderQuestionsCard
                key={pendingClarifications.map((c) => c.id).join("-")}
                clarifications={pendingClarifications}
                disabled={loading}
                onContinue={(answers) => send(formatAnswers(answers))}
                onSkip={handleSkipQuestions}
              />
            </div>
          )}
          {loading && (
            <div className="space-y-2">
              {liveText ? (
                <div className="max-w-[86%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed bg-slate-100 text-slate-800">
                  {liveText}
                  <span className="inline-block w-1.5 h-4 bg-slate-400 ml-0.5 align-middle" />
                </div>
              ) : (
                <div className="text-xs text-slate-400">{m.builderSending}</div>
              )}
            </div>
          )}
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-slate-100 p-3 flex gap-2">
          <input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && send()}
            placeholder={m.builderInputPlaceholder}
            className={input}
          />
          <button
            onClick={() => send()}
            disabled={loading || !inputText.trim()}
            className="rounded-lg bg-slate-900 text-white px-4 text-sm hover:bg-slate-800 disabled:opacity-40"
          >
            {m.builderSend}
          </button>
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
