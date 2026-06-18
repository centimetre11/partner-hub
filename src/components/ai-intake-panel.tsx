"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { IntakeProposal, IntakeScope, IntakeClarification } from "@/lib/ai-intake";
import type { AiStreamState, AiTraceStep } from "@/lib/ai-trace";
import type { ChatImage } from "@/lib/ai";
import type { ProposalChanges } from "@/lib/proposal-merge";
import { consumeAiSse } from "@/lib/ai-trace";
import {
  applyDirectClarification,
  formatAiClarificationMessage,
  type ClarificationAnswer,
} from "@/lib/clarification-apply";
import { AiWorkflowPanel } from "@/components/ai-workflow-panel";
import { AiFullscreenOverlay } from "@/components/ai-fullscreen-overlay";

type Msg = { role: "user" | "assistant"; content: string; trace?: AiTraceStep[]; images?: ChatImage[] };

const SCOPE_META: Record<IntakeScope, { title: string; placeholder: string }> = {
  new_partner: {
    title: "AI Onboarding",
    placeholder:
      "Drop a company name, meeting notes, chat logs, or a KMS link — I'll research from multiple sources and show findings live on the right.\nExamples:\n• Just met Acme Analytics in Dubai\n• https://kms.fineres.com/pages/viewpage.action?pageId=123456",
  },
  powermap: {
    title: "AI Add Contact",
    placeholder: "Describe the person to add, or paste a business card / meeting notes.",
  },
  opportunity: {
    title: "AI Add Opportunity",
    placeholder: "Describe the opportunity or paste related communications.",
  },
  profile: {
    title: "AI Complete Profile",
    placeholder: "Describe the company or paste a KMS link — fields will update live on the right.",
  },
  training: { title: "AI Add Training", placeholder: "Describe the training or certification to schedule." },
  solution: { title: "AI Add Joint Solution", placeholder: "Describe the joint solution." },
};

export function AiIntakePanel({
  scope,
  partnerId,
  intent,
  onClose,
  onDone,
}: {
  scope: IntakeScope;
  partnerId?: string;
  intent?: "prospect" | "active";
  onClose: () => void;
  onDone?: (partnerId: string) => void;
}) {
  const router = useRouter();
  const meta = SCOPE_META[scope];
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
    if (!proposal) return;
    const c = clarifications.find((x) => x.id === id);
    if (!c) return;
    const { proposal: next, changes } = applyDirectClarification(proposal, c, value);
    setProposal(next);
    setClarifications((prev) => prev.filter((x) => x.id !== id));
    setPatchChanges(changes);
  }

  function handleAiClarify(answers: ClarificationAnswer[]) {
    void send(formatAiClarificationMessage(answers));
  }

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if ((!text && !pendingImages.length) || loading) return;
    const next = [
      ...messages,
      {
        role: "user" as const,
        content: text || "Please identify the information in the image(s)",
        images: pendingImages.length ? pendingImages : undefined,
      },
    ];
    setMessages(next);
    setInput("");
    setPendingImages([]);
    setLoading(true);
    setError(null);
    setLiveTrace([]);
    setReplyText("");
    setClarifications([]);
    setPatchChanges(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/ai/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ scope, partnerId, messages: next, stream: true }),
        signal: ac.signal,
      });
      const { data, trace, replyText: finalReply, aborted } = await consumeAiSse(
        res,
        (_ev, state) => applyStream(state),
        { excluded: excludedRef.current }
      );
      if (aborted) {
        const partial = (finalReply || "").trim();
        setMessages((m) => [
          ...m,
          { role: "assistant", content: partial ? `${partial}\n\n(Stopped)` : "(Stopped — gathered info on the right is preserved)", trace: [...trace] },
        ]);
        return;
      }
      const turn = data as { reply: string; proposal: IntakeProposal; ready: boolean; questions?: string[]; clarifications?: IntakeClarification[] };
      setMessages((m) => [...m, { role: "assistant", content: turn.reply || finalReply, trace: [...trace] }]);
      setProposal(turn.proposal);
      setReady(turn.ready);
      setQuestions(turn.questions ?? []);
      setClarifications(turn.clarifications ?? []);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setMessages((m) => [...m, { role: "assistant", content: "(Stopped)", trace: [...liveTrace] }]);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
      // Keep trace in messages; clear only the in-flight streaming reply
      setReplyText("");
      abortRef.current = null;
    }
  }

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
          title={meta.title}
          subtitle="Research on the left · live draft on the right"
          onClose={onClose}
          messages={
            messages.length === 0
              ? [{ role: "assistant", content: meta.placeholder }]
              : messages
          }
          loading={loading}
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
          ready={ready}
          scope={scope}
          partnerId={partnerId}
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
          inputPlaceholder={proposal ? "Keep adding details, or confirm on the right…" : undefined}
          sendDisabled={loading || (!input.trim() && !pendingImages.length)}
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
