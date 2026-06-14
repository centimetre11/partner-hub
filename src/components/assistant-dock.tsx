"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { IntakeProposal, IntakeScope } from "@/lib/ai-intake";
import type { AiStreamState, AiTraceStep } from "@/lib/ai-trace";
import type { ProposalChanges } from "@/lib/proposal-merge";
import { consumeAiSse } from "@/lib/ai-trace";
import { AiWorkflowPanel } from "@/components/ai-workflow-panel";
import { AiFullscreenOverlay } from "@/components/ai-fullscreen-overlay";

type Msg = {
  role: "user" | "assistant";
  content: string;
  actions?: string[];
  trace?: AiTraceStep[];
};

type ProposeResult = {
  mode: "propose";
  reply: string;
  proposal: IntakeProposal;
  questions: string[];
  ready: boolean;
  scope: IntakeScope;
};

type QueryResult = {
  mode: "query";
  reply: string;
  actions?: string[];
};

const SUGGESTIONS = [
  "哪些 Tier A 伙伴超过 2 周没跟进？",
  "对比 Beinex 和 SEIDOR / Clariba，谁更适合先推进？",
  "利雅得有哪些有政府客户资源的候选？",
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
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState("");
  const [phaseLabel, setPhaseLabel] = useState("");
  const [patchChanges, setPatchChanges] = useState<ProposalChanges | null>(null);
  const [proposeMode, setProposeMode] = useState(false);
  const excludedRef = useRef(new Set<string>());

  const showDraft = proposeMode || !!proposal || (loading && proposeMode);

  function applyStream(state: AiStreamState) {
    setLiveTrace(state.trace);
    setReplyText(state.replyText);
    if (state.proposal) setProposal(state.proposal);
    setQuestions(state.questions);
    setReady(state.ready);
    setPhase(state.phase);
    setPhaseLabel(state.phaseLabel);
    if (state.lastPatchChanges) setPatchChanges(state.lastPatchChanges);
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setLiveTrace([]);
    setReplyText("");
    setProposal(null);
    setQuestions([]);
    setReady(false);
    setPatchChanges(null);
    const likelyPropose = /kms\.fineres|pageId=\d+|建档|补全画像|录入|创建伙伴/i.test(content);
    if (likelyPropose) setProposeMode(true);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          messages: next.map(({ role, content: c }) => ({ role, content: c })),
          stream: true,
          partnerId: proposePartnerId,
        }),
      });
      const { data, trace, replyText: finalReply } = await consumeAiSse(
        res,
        (_ev, state) => applyStream(state),
        { excluded: excludedRef.current }
      );

      if ((data as ProposeResult).mode === "propose") {
        const p = data as ProposeResult;
        setProposeMode(true);
        setProposal(p.proposal);
        setProposeScope(p.scope);
        setQuestions(p.questions ?? []);
        setReady(p.ready);
        setMessages([...next, { role: "assistant", content: p.reply || finalReply, trace: [...trace] }]);
      } else {
        const q = data as QueryResult;
        setMessages([...next, { role: "assistant", content: q.reply || finalReply, actions: q.actions, trace: [...trace] }]);
        if (q.actions?.length) router.refresh();
      }
    } catch (e) {
      setMessages([
        ...next,
        { role: "assistant", content: `出错了：${e instanceof Error ? e.message : e}`, trace: liveTrace },
      ]);
    } finally {
      setLoading(false);
      setReplyText("");
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
            content: `试试这些：\n\n${SUGGESTIONS.map((s) => `• ${s}`).join("\n")}`,
          },
        ]
      : messages.map((m) => ({
          role: m.role,
          content:
            m.content +
            (m.actions?.length ? `\n\n${m.actions.map((a) => `✓ ${a}`).join("\n")}` : ""),
          trace: m.trace,
        }));

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-xl flex items-center justify-center text-xl hover:scale-105 transition-transform"
          style={{ width: 56, height: 56 }}
          title="AI 助手"
        >
          ✦
        </button>
      )}

      {open && (
        <AiFullscreenOverlay onClose={() => setOpen(false)} zIndex={55}>
          <AiWorkflowPanel
            title={showDraft ? "AI 助手 · 建档" : "AI 助手"}
            subtitle={showDraft ? "左侧调研 · 右侧实时呈现" : "全屏对话 · 查询与指令"}
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
            ready={ready}
            scope={proposeScope}
            partnerId={proposePartnerId}
            sourceText={messages.filter((m) => m.role === "user").map((m) => m.content).join("\n")}
            onApplied={onApplied}
            input={input}
            onInputChange={setInput}
            onSend={() => send()}
            inputPlaceholder={showDraft ? "继续补充，或右侧确认入库…" : "问问题，或下达指令…"}
            sendDisabled={loading || !input.trim()}
            showDraftPanel={showDraft}
          />
        </AiFullscreenOverlay>
      )}
    </>
  );
}
