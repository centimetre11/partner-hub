"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { IntakeProposal, IntakeScope, IntakeClarification } from "@/lib/ai-intake";
import { PROPOSE_INTENT_RE } from "@/lib/propose-intent";
import type { AiStreamState, AiTraceStep } from "@/lib/ai-trace";
import type { ChatImage } from "@/lib/ai";
import type { ProposalChanges } from "@/lib/proposal-merge";
import { countProposalItems, mergeFinalProposal } from "@/lib/proposal-merge";
import { intakeProposalReplacesDraft } from "@/lib/proposal-scope";
import { consumeAiSse } from "@/lib/ai-trace";
import {
  applyDirectClarification,
  applyProposalEdit,
  formatAiClarificationMessage,
  type ClarificationAnswer,
  type ProposalEditPatch,
} from "@/lib/clarification-apply";
import { AiWorkflowPanel } from "@/components/ai-workflow-panel";
import { AiFullscreenOverlay } from "@/components/ai-fullscreen-overlay";
import { useAssistant } from "@/lib/assistant-context";
import { useMessages } from "@/lib/i18n/context";

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

type IntentConfirmResult = {
  mode: "intent_confirm";
  reply: string;
  actionId: string;
  alternatives: Array<{ actionId: string; label: string; index: number }>;
};

import type { FocusEntity } from "@/lib/focus-entity";

type PendingIntent = {
  actionId: string;
  alternatives: Array<{ actionId: string; label: string; index: number }>;
  focus?: FocusEntity;
  patchInstruction?: string;
  patchTargetId?: string;
  patchTargetLabel?: string;
};

export function AssistantDock() {
  const m = useMessages();
  const am = m.assistant;
  const router = useRouter();
  const { open, setOpen } = useAssistant();
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
  const [pendingIntent, setPendingIntent] = useState<PendingIntent | null>(null);
  const [focusEntity, setFocusEntity] = useState<FocusEntity | null>(null);
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

  function handleDirectClarify(id: string, value: string) {
    if (!proposal) return;
    const c = clarifications.find((x) => x.id === id);
    if (!c) return;
    const { proposal: next, changes } = applyDirectClarification(proposal, c, value);
    setProposal(next);
    setClarifications((prev) => prev.filter((x) => x.id !== id));
    setPatchChanges(changes);
  }

  function handleProposalEdit(patch: ProposalEditPatch) {
    if (!proposal) return;
    const { proposal: next, changes } = applyProposalEdit(proposal, patch);
    setProposal(next);
    setPatchChanges(changes);
  }

  function handleAiClarify(answers: ClarificationAnswer[]) {
    void send(formatAiClarificationMessage(answers));
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if ((!content && !pendingImages.length) || loading) return;
    const preserveDraft = proposeMode || !!proposal;
    const next: Msg[] = [
      ...messages,
      {
        role: "user",
        content: content || am.imageFallback,
        images: pendingImages.length ? pendingImages : undefined,
      },
    ];
    setMessages(next);
    setInput("");
    setPendingImages([]);
    setLoading(true);
    setLiveTrace([]);
    setReplyText("");
    if (!preserveDraft) {
      setProposal(null);
      setQuestions([]);
      setClarifications([]);
      setReady(false);
      setPatchChanges(null);
    }
    const likelyPropose = PROPOSE_INTENT_RE.test(content);
    let confirmedActionId: string | undefined;
    if (pendingIntent) {
      if (/^(确认|confirm)$/i.test(content)) {
        confirmedActionId = pendingIntent.actionId;
      } else {
        const num = content.match(/^([1-9])$/);
        if (num) {
          const alt = pendingIntent.alternatives.find((a) => a.index === Number(num[1]));
          if (alt) confirmedActionId = alt.actionId;
        } else {
          for (const alt of pendingIntent.alternatives) {
            if (content.includes(alt.label)) {
              confirmedActionId = alt.actionId;
              break;
            }
          }
        }
      }
    }
    if (pendingIntent && /^(取消|cancel)$/i.test(content)) {
      setPendingIntent(null);
      setMessages([...next, { role: "assistant", content: am.stopped.replace("已停止", "已取消") || "已取消。" }]);
      setLoading(false);
      return;
    }
    if (confirmedActionId) setPendingIntent(null);
    else if (pendingIntent && !/^(确认|confirm|[1-9])$/i.test(content)) {
      setPendingIntent(null);
    }
    if (likelyPropose && !pendingIntent && !confirmedActionId) setProposeMode(true);
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
          forcePropose: (proposeMode || !!proposal) && !pendingIntent,
          confirmedActionId,
          skipIntentConfirm: !!proposal,
          focus: focusEntity,
          patchTargetId: pendingIntent?.patchTargetId,
          patchTargetLabel: pendingIntent?.patchTargetLabel,
          patchInstruction: pendingIntent?.patchInstruction ?? (confirmedActionId ? content : undefined),
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
          { role: "assistant", content: partial ? `${partial}\n\n${am.stopped}` : am.stopped, trace: [...trace] },
        ]);
        return;
      }

      if ((data as ProposeResult).mode === "propose") {
        const p = data as ProposeResult;
        setPendingIntent(null);
        setProposeMode(true);
        setProposal((prev) => {
          if (!p.proposal || countProposalItems(p.proposal) <= 0) return prev ?? p.proposal;
          return intakeProposalReplacesDraft(p.scope)
            ? p.proposal
            : mergeFinalProposal(prev, p.proposal, excludedRef.current);
        });
        setProposeScope(p.scope);
        setQuestions(p.questions ?? []);
        setClarifications((prev) => (p.clarifications?.length ? p.clarifications : prev));
        setReady(p.ready);
        setMessages([...next, { role: "assistant", content: p.reply || finalReply, trace: [...trace] }]);
      } else if ((data as IntentConfirmResult & PendingIntent).mode === "intent_confirm") {
        const ic = data as IntentConfirmResult & PendingIntent;
        setPendingIntent({
          actionId: ic.actionId,
          alternatives: ic.alternatives ?? [],
          focus: ic.focus,
          patchInstruction: ic.patchInstruction,
          patchTargetId: ic.patchTargetId,
          patchTargetLabel: ic.patchTargetLabel,
        });
        if (ic.focus) setFocusEntity(ic.focus);
        setProposeMode(false);
        setProposal(null);
        setMessages([...next, { role: "assistant", content: ic.reply || finalReply, trace: [...trace] }]);
      } else {
        const q = data as QueryResult & { focus?: FocusEntity | null };
        setPendingIntent(null);
        if (q.focus) setFocusEntity(q.focus);
        setMessages([...next, { role: "assistant", content: q.reply || finalReply, actions: q.actions, trace: [...trace] }]);
        if (q.actions?.length) router.refresh();
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setMessages([...next, { role: "assistant", content: am.stopped, trace: [...liveTrace] }]);
      } else {
        setMessages([
          ...next,
          { role: "assistant", content: am.error.replace("{msg}", e instanceof Error ? e.message : String(e)), trace: liveTrace },
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
    router.refresh();
    if (partnerId) {
      setProposePartnerId(partnerId);
      router.push(`/partners/${partnerId}`);
    }
  }

  const panelMessages =
    messages.length === 0
      ? [
          {
            role: "assistant" as const,
            content: `${am.tryThese}\n\n${am.suggestions.map((s) => `• ${s}`).join("\n")}`,
          },
        ]
      : messages.map((msg) => ({
          role: msg.role,
          content:
            msg.content +
            (msg.actions?.length ? `\n\n${msg.actions.map((a) => `✓ ${a}`).join("\n")}` : ""),
          trace: msg.trace,
          images: msg.images,
        }));

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="lg:hidden fixed bottom-4 left-4 sm:bottom-6 z-50 rounded-full bg-slate-900 text-white flex items-center justify-center text-xl safe-bottom"
          style={{ width: 56, height: 56 }}
          title={am.fabTitle}
          aria-label={am.fabTitle}
        >
          ✦
        </button>
      )}

      {open && (
        <AiFullscreenOverlay onClose={() => setOpen(false)} zIndex={55}>
          <AiWorkflowPanel
            title={showDraft ? am.onboardingTitle : am.title}
            subtitle={showDraft ? am.onboardingSubtitle : am.subtitle}
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
            onDirectClarify={handleDirectClarify}
            onAiClarify={handleAiClarify}
            onProposalEdit={handleProposalEdit}
            ready={ready}
            scope={proposeScope}
            partnerId={proposePartnerId}
            sourceText={messages.filter((msg) => msg.role === "user").map((msg) => msg.content).join("\n")}
            onApplied={onApplied}
            input={input}
            onInputChange={setInput}
            onSend={() => send()}
            onStop={stop}
            pendingImages={pendingImages}
            onAddImages={(imgs) => setPendingImages((p) => [...p, ...imgs])}
            onRemoveImage={(i) => setPendingImages((p) => p.filter((_, j) => j !== i))}
            inputPlaceholder={showDraft ? am.inputDraft : am.inputQuery}
            sendDisabled={loading || (!input.trim() && !pendingImages.length)}
            showDraftPanel={showDraft}
          />
        </AiFullscreenOverlay>
      )}
    </>
  );
}
