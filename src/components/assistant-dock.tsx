"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { IntakeProposal, IntakeScope, IntakeClarification } from "@/lib/ai-intake";
import type { AiStreamState, AiTraceStep } from "@/lib/ai-trace";
import type { ChatImage } from "@/lib/ai";
import type { ProposalChanges } from "@/lib/proposal-merge";
import { consumeAiSse } from "@/lib/ai-trace";
import { AiWorkflowPanel } from "@/components/ai-workflow-panel";
import { AiFullscreenOverlay } from "@/components/ai-fullscreen-overlay";

type Msg = {
  role: "user" | "assistant";
  content: string;
  actions?: string[];
  trace?: AiTraceStep[];
  images?: ChatImage[];
};

type ProposeResult = {
  mode: "propose";
  reply: string;
  proposal: IntakeProposal;
  questions: string[];
  clarifications?: IntakeClarification[];
  ready: boolean;
  scope: IntakeScope;
};

type QueryResult = {
  mode: "query";
  reply: string;
  actions?: string[];
};

const SUGGESTIONS = [
  "Which Tier A partners haven't been followed up in 2+ weeks?",
  "Compare Beinex and SEIDOR / Clariba — which should we prioritize?",
  "Which Riyadh candidates have government client resources?",
];

export function AssistantDock() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [liveTrace, setLiveTrace] = useState<AiTraceStep[]>([]);
  const [replyText, setReplyText] = useState("");
  const [proposal, setProposal] = useState<IntakeProposal | null>(null);
  const [proposeScope, setProposeScope] = useState<IntakeScope>("new_partner");
  const [proposePartnerId, setProposePartnerId] = useState<string | undefined>();
  const [questions, setQuestions] = useState<string[]>([]);
  const [clarifications, setClarifications] = useState<IntakeClarification[]>([]);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState("");
  const [phaseLabel, setPhaseLabel] = useState("");
  const [patchChanges, setPatchChanges] = useState<ProposalChanges | null>(null);
  const [proposeMode, setProposeMode] = useState(false);
  const [pendingImages, setPendingImages] = useState<ChatImage[]>([]);
  const excludedRef = useRef(new Set<string>());
  const abortRef = useRef<AbortController | null>(null);

  function stop() {
    abortRef.current?.abort();
  }

  const showDraft = proposeMode || !!proposal || (loading && proposeMode);

  function applyStream(state: AiStreamState) {
    setLiveTrace(state.trace);
    setReplyText(state.replyText);
    if (state.proposal) setProposal(state.proposal);
    setQuestions(state.questions);
    setClarifications(state.clarifications);
    setReady(state.ready);
    setPhase(state.phase);
    setPhaseLabel(state.phaseLabel);
    if (state.lastPatchChanges) setPatchChanges(state.lastPatchChanges);
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if ((!content && !pendingImages.length) || loading) return;
    const next: Msg[] = [
      ...messages,
      {
        role: "user",
        content: content || "Please identify the information in the image(s)",
        images: pendingImages.length ? pendingImages : undefined,
      },
    ];
    setMessages(next);
    setInput("");
    setPendingImages([]);
    setLoading(true);
    setLiveTrace([]);
    setReplyText("");
    setProposal(null);
    setQuestions([]);
    setClarifications([]);
    setReady(false);
    setPatchChanges(null);
    const likelyPropose = /kms\.fineres|pageId=\d+|onboard|create partner|complete profile|intake|建档|补全画像|录入|创建伙伴/i.test(content);
    if (likelyPropose) setProposeMode(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          messages: next.map(({ role, content: c, images }) => ({ role, content: c, images })),
          stream: true,
          partnerId: proposePartnerId,
        }),
        signal: ac.signal,
      });
      const { data, trace, replyText: finalReply, aborted } = await consumeAiSse(
        res,
        (_ev, state) => applyStream(state),
        { excluded: excludedRef.current }
      );

      if (aborted) {
        const partial = (finalReply || "").trim();
        setMessages([
          ...next,
          { role: "assistant", content: partial ? `${partial}\n\n(Stopped)` : "(Stopped)", trace: [...trace] },
        ]);
        return;
      }

      if ((data as ProposeResult).mode === "propose") {
        const p = data as ProposeResult;
        setProposeMode(true);
        setProposal(p.proposal);
        setProposeScope(p.scope);
        setQuestions(p.questions ?? []);
        setClarifications(p.clarifications ?? []);
        setReady(p.ready);
        setMessages([...next, { role: "assistant", content: p.reply || finalReply, trace: [...trace] }]);
      } else {
        const q = data as QueryResult;
        setMessages([...next, { role: "assistant", content: q.reply || finalReply, actions: q.actions, trace: [...trace] }]);
        if (q.actions?.length) router.refresh();
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setMessages([...next, { role: "assistant", content: "(Stopped)", trace: [...liveTrace] }]);
      } else {
        setMessages([
          ...next,
          { role: "assistant", content: `Error: ${e instanceof Error ? e.message : e}`, trace: liveTrace },
        ]);
      }
    } finally {
      setLoading(false);
      setReplyText("");
      abortRef.current = null;
    }
  }

  function onApplied(partnerId: string) {
    setProposal(null);
    setProposeMode(false);
    setQuestions([]);
    setReady(false);
    setProposePartnerId(partnerId);
    router.refresh();
    router.push(`/partners/${partnerId}`);
  }

  const panelMessages =
    messages.length === 0
      ? [
          {
            role: "assistant" as const,
            content: `Try these:\n\n${SUGGESTIONS.map((s) => `• ${s}`).join("\n")}`,
          },
        ]
      : messages.map((m) => ({
          role: m.role,
          content:
            m.content +
            (m.actions?.length ? `\n\n${m.actions.map((a) => `✓ ${a}`).join("\n")}` : ""),
          trace: m.trace,
          images: m.images,
        }));

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-xl flex items-center justify-center text-xl hover:scale-105 transition-transform"
          style={{ width: 56, height: 56 }}
          title="AI Assistant"
        >
          ✦
        </button>
      )}

      {open && (
        <AiFullscreenOverlay onClose={() => setOpen(false)} zIndex={55}>
          <AiWorkflowPanel
            title={showDraft ? "AI Assistant · Onboarding" : "AI Assistant"}
            subtitle={showDraft ? "Research on the left · live draft on the right" : "Full-screen chat · queries & commands"}
            onClose={() => setOpen(false)}
            messages={panelMessages}
            loading={loading}
            liveTrace={liveTrace}
            replyText={replyText}
            phase={phase}
            phaseLabel={phaseLabel}
            proposal={proposal}
            patchChanges={patchChanges}
            questions={questions}
            clarifications={clarifications}
            onClarify={(t) => send(t)}
            ready={ready}
            scope={proposeScope}
            partnerId={proposePartnerId}
            sourceText={messages.filter((m) => m.role === "user").map((m) => m.content).join("\n")}
            onApplied={onApplied}
            input={input}
            onInputChange={setInput}
            onSend={() => send()}
            onStop={stop}
            pendingImages={pendingImages}
            onAddImages={(imgs) => setPendingImages((p) => [...p, ...imgs])}
            onRemoveImage={(i) => setPendingImages((p) => p.filter((_, j) => j !== i))}
            inputPlaceholder={showDraft ? "Keep adding details, or confirm on the right…" : "Ask a question or give a command…"}
            sendDisabled={loading || (!input.trim() && !pendingImages.length)}
            showDraftPanel={showDraft}
          />
        </AiFullscreenOverlay>
      )}
    </>
  );
}
