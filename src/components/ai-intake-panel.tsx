"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { IntakeProposal, IntakeScope, IntakeClarification } from "@/lib/ai-intake";
import type { AiStreamState, AiTraceStep } from "@/lib/ai-trace";
import type { ChatImage } from "@/lib/ai";
import type { ProposalChanges } from "@/lib/proposal-merge";
import { countProposalItems, emptyIntakeProposal, mergeFinalProposal } from "@/lib/proposal-merge";
import { mergeBusinessRecordIntakeProposal } from "@/lib/business-record-intake";
import { intakeProposalReplacesDraft, isFastIntakeScope, intakeScopePrefetchesPublicResearch, shouldAutoApplyBoundIntake } from "@/lib/proposal-scope";
import { applyIntakeProposalClient } from "@/lib/apply-intake-client";
import { consumeAiSse } from "@/lib/ai-trace";
import { ensureChatImagesWithinLimit } from "@/lib/ai-images";
import {
  applyDirectClarification,
  applyProposalEdit,
  formatAiClarificationMessage,
  hasBlockingClarifications,
  type ClarificationAnswer,
  type ProposalEditPatch,
} from "@/lib/clarification-apply";
import { formatPreferencePick, getClarificationTier } from "@/lib/ai-clarifications";
import { AiWorkflowPanel } from "@/components/ai-workflow-panel";
import { AiFullscreenOverlay } from "@/components/ai-fullscreen-overlay";
import { useMessages, useLocale } from "@/lib/i18n/context";

type Msg = { role: "user" | "assistant"; content: string; trace?: AiTraceStep[]; images?: ChatImage[] };

export function AiIntakePanel({
  scope,
  partnerId,
  customerId,
  intent,
  seedMessage,
  autoStart,
  onClose,
  onDone,
}: {
  scope: IntakeScope;
  partnerId?: string;
  customerId?: string;
  intent?: "prospect" | "active";
  /** 预填的首条消息（如从 CRM 客户带入的信息），配合 autoStart 自动发送 */
  seedMessage?: string;
  /** 挂载后自动发送 seedMessage */
  autoStart?: boolean;
  onClose: () => void;
  onDone?: (id: string) => void;
}) {
  const router = useRouter();
  const { intakePanel: ip, assistant: am } = useMessages();
  const locale = useLocale();
  const meta = ip.scopes[scope];
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<IntakeProposal | null>(null);
  const [ready, setReady] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [clarifications, setClarifications] = useState<IntakeClarification[]>([]);
  const [liveTrace, setLiveTrace] = useState<AiTraceStep[]>([]);
  const [replyText, setReplyText] = useState("");
  const [phase, setPhase] = useState("");
  const [phaseLabel, setPhaseLabel] = useState("");
  const [patchChanges, setPatchChanges] = useState<ProposalChanges | null>(null);
  const [pendingImages, setPendingImages] = useState<ChatImage[]>([]);
  const excludedRef = useRef(new Set<string>());
  const abortRef = useRef<AbortController | null>(null);
  const didAutoStartRef = useRef(false);
  const directRequiredAnswersRef = useRef<ClarificationAnswer[]>([]);
  const autoApplyMode = !!((partnerId || customerId) && isFastIntakeScope(scope) && scope !== "business_record");
  const [autoApplyFailed, setAutoApplyFailed] = useState(false);
  const [autoApplying, setAutoApplying] = useState(false);

  function stop() {
    abortRef.current?.abort();
  }

  function applyStream(state: AiStreamState) {
    setLiveTrace(state.trace);
    setReplyText(state.replyText);
    setProposal(state.proposal);
    setQuestions(state.questions);
    setClarifications(state.clarifications);
    setReady(state.ready);
    setPhase(state.phase);
    setPhaseLabel(state.phaseLabel);
    if (state.lastPatchChanges) setPatchChanges(state.lastPatchChanges);
  }

  function handleDirectClarify(id: string, value: string) {
    const base = proposal ?? emptyIntakeProposal();
    const c = clarifications.find((x) => x.id === id);
    if (!c) return;
    const tier = getClarificationTier(c);
    const { proposal: next, changes } = applyDirectClarification(base, c, value);
    setProposal(next);
    const remaining = clarifications.filter((x) => x.id !== id);
    setClarifications(remaining);
    setPatchChanges(changes);

    if (tier === "required") {
      directRequiredAnswersRef.current.push({ id, question: c.question, value });
    }

    if (
      intakeScopePrefetchesPublicResearch(scope) &&
      tier === "required" &&
      !hasBlockingClarifications(remaining) &&
      directRequiredAnswersRef.current.length > 0
    ) {
      const answers = [...directRequiredAnswersRef.current];
      directRequiredAnswersRef.current = [];
      void send(formatAiClarificationMessage(answers, locale));
    }
  }

  function handleProposalEdit(patch: ProposalEditPatch) {
    if (!proposal) return;
    const { proposal: next, changes } = applyProposalEdit(proposal, patch);
    setProposal(next);
    setPatchChanges(changes);
  }

  function handleAiClarify(answers: ClarificationAnswer[]) {
    void send(formatAiClarificationMessage(answers, locale));
  }

  function handlePreferenceClarify(answer: ClarificationAnswer) {
    void send(formatPreferencePick(answer, locale));
  }

  async function tryAutoApply(
    turn: {
      proposal: IntakeProposal;
      ready: boolean;
      clarifications?: IntakeClarification[];
      reply: string;
    },
    userMessages: Msg[]
  ): Promise<boolean> {
    const nextProposal = turn.proposal;
    if (
      !shouldAutoApplyBoundIntake({
        scope,
        partnerId,
        ready: turn.ready,
        clarifications: turn.clarifications,
        proposal: nextProposal,
      })
    ) {
      return false;
    }

    setAutoApplying(true);
    setAutoApplyFailed(false);
    try {
      const sourceText = userMessages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
      const result = await applyIntakeProposalClient({
        scope,
        partnerId,
        customerId,
        proposal: nextProposal,
        sourceText,
        intent,
      });
      const detail = result.applied.length ? result.applied.join("；") : ip.autoSaved;
      setMessages((m) => [...m, { role: "assistant", content: `${turn.reply}\n\n✅ ${detail}` }]);
      handleApplied(result.customerId || result.partnerId || customerId || partnerId || "");
      return true;
    } catch (e) {
      setAutoApplyFailed(true);
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setAutoApplying(false);
    }
  }

  function mergeTurnProposal(turnProposal: IntakeProposal, prev: IntakeProposal | null): IntakeProposal | null {
    if (!turnProposal || countProposalItems(turnProposal) <= 0) return prev ?? turnProposal ?? emptyIntakeProposal();
    if (scope === "business_record" && prev) {
      return mergeBusinessRecordIntakeProposal(prev, turnProposal);
    }
    return intakeProposalReplacesDraft(scope)
      ? turnProposal
      : mergeFinalProposal(prev, turnProposal, excludedRef.current);
  }

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if ((!text && !pendingImages.length) || loading) return;
    if (!override && hasBlockingClarifications(clarifications)) return;

    const compressedPending = pendingImages.length
      ? await ensureChatImagesWithinLimit(pendingImages)
      : [];
    const nextRaw = [
      ...messages,
      {
        role: "user" as const,
        content: text || am.imageFallback,
        images: compressedPending.length ? compressedPending : undefined,
      },
    ];
    const next = await Promise.all(
      nextRaw.map(async (m) =>
        m.images?.length ? { ...m, images: await ensureChatImagesWithinLimit(m.images) } : m,
      ),
    );
    setMessages(next);
    setInput("");
    setPendingImages([]);
    setLoading(true);
    setError(null);
    setLiveTrace([]);
    setReplyText("");
    setClarifications([]);
    setPatchChanges(null);
    setAutoApplyFailed(false);
    directRequiredAnswersRef.current = [];
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const useStream = scope === "business_record" || !isFastIntakeScope(scope);
      const res = await fetch("/api/ai/intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(useStream ? { Accept: "text/event-stream" } : {}),
        },
        body: JSON.stringify({ scope, partnerId, customerId, messages: next, stream: useStream }),
        signal: ac.signal,
      });

      if (!useStream) {
        const turn = (await res.json()) as {
          reply: string;
          proposal: IntakeProposal;
          ready: boolean;
          questions?: string[];
          clarifications?: IntakeClarification[];
          error?: string;
        };
        if (!res.ok) throw new Error(turn.error ?? "Request failed");
        const merged = mergeTurnProposal(turn.proposal, proposal);
        setProposal(merged);
        setReady(turn.ready);
        setQuestions(turn.questions ?? []);
        setClarifications(turn.clarifications ?? []);
        const autoApplied = await tryAutoApply(
          { ...turn, proposal: merged ?? turn.proposal },
          next
        );
        if (!autoApplied) {
          setMessages((m) => [...m, { role: "assistant", content: turn.reply }]);
        }
        return;
      }

      const { data, trace, replyText: finalReply, aborted } = await consumeAiSse(
        res,
        (_ev, state) => applyStream(state),
        { excluded: excludedRef.current }
      );
      if (aborted) {
        const partial = (finalReply || "").trim();
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: partial ? `${partial}\n\n${am.stopped}` : ip.stoppedPreserve,
            trace: [...trace],
          },
        ]);
        return;
      }
      const turn = data as { reply: string; proposal: IntakeProposal; ready: boolean; questions?: string[]; clarifications?: IntakeClarification[] };
      const merged = mergeTurnProposal(turn.proposal, proposal);
      setProposal(merged);
      setReady(turn.ready);
      setQuestions((prev) => (turn.questions?.length ? turn.questions : prev));
      setClarifications((prev) => (turn.clarifications?.length ? turn.clarifications : prev));
      const autoApplied = await tryAutoApply(
        { ...turn, proposal: merged ?? turn.proposal },
        next
      );
      if (!autoApplied) {
        setMessages((m) => [...m, { role: "assistant", content: turn.reply || finalReply, trace: [...trace] }]);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setMessages((m) => [...m, { role: "assistant", content: am.stopped, trace: [...liveTrace] }]);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
      setReplyText("");
      abortRef.current = null;
    }
  }

  useEffect(() => {
    if (autoStart && seedMessage && !didAutoStartRef.current) {
      didAutoStartRef.current = true;
      void send(seedMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleApplied(id: string) {
    if (onDone) onDone(id);
    else {
      router.refresh();
      onClose();
    }
  }

  return (
    <AiFullscreenOverlay onClose={onClose}>
      <div className="relative h-full min-h-0 flex flex-col">
        <AiWorkflowPanel
          onClose={onClose}
          messages={
            messages.length === 0 ? [{ role: "assistant", content: meta.placeholder }] : messages
          }
          loading={loading || autoApplying}
          liveTrace={liveTrace}
          replyText={replyText}
          phase={phase}
          phaseLabel={phaseLabel}
          proposal={proposal}
          patchChanges={patchChanges}
          questions={questions}
          clarifications={clarifications}
          onDirectClarify={handleDirectClarify}
          onAiClarify={handleAiClarify}
          onPreferenceClarify={handlePreferenceClarify}
          onProposalEdit={handleProposalEdit}
          ready={ready}
          scope={scope}
          partnerId={partnerId}
          customerId={customerId}
          intent={intent}
          sourceText={messages.filter((m) => m.role === "user").map((m) => m.content).join("\n")}
          onApplied={handleApplied}
          input={input}
          onInputChange={setInput}
          onSend={() => send()}
          onStop={stop}
          pendingImages={pendingImages}
          onAddImages={(imgs) => setPendingImages((p) => [...p, ...imgs])}
          onRemoveImage={(i) => setPendingImages((p) => p.filter((_, j) => j !== i))}
          inputPlaceholder={proposal ? am.inputDraft : undefined}
          sendDisabled={loading || autoApplying || (!input.trim() && !pendingImages.length)}
          showDraftPanel
        />
        {error && (
          <div className="absolute bottom-24 left-6 right-[62%] text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2 shadow-sm z-10">
            {error}
          </div>
        )}
      </div>
    </AiFullscreenOverlay>
  );
}
