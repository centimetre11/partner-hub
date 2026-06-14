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

type Msg = { role: "user" | "assistant"; content: string; trace?: AiTraceStep[]; images?: ChatImage[] };

const SCOPE_META: Record<IntakeScope, { title: string; placeholder: string }> = {
  new_partner: {
    title: "AI 建档",
    placeholder:
      "扔公司名、会议记录、聊天记录、KMS 链接都行——我会多源调研，找到的信息会实时出现在右侧。\n例如：\n• 刚见了迪拜 Acme Analytics\n• https://kms.fineres.com/pages/viewpage.action?pageId=123456",
  },
  powermap: {
    title: "AI 加人物",
    placeholder: "描述要加的人，或粘贴名片/会议记录。",
  },
  opportunity: {
    title: "AI 加商机",
    placeholder: "描述商机或粘贴相关沟通。",
  },
  profile: {
    title: "AI 补全画像",
    placeholder: "描述公司情况或粘贴 KMS 链接，右侧会实时补全字段。",
  },
  training: { title: "AI 加培训", placeholder: "描述要安排的培训/认证。" },
  todo: { title: "AI 加待办", placeholder: "说要跟进的事。" },
  solution: { title: "AI 加联合方案", placeholder: "描述联合方案。" },
};

export function AiIntakePanel({
  scope,
  partnerId,
  onClose,
  onDone,
}: {
  scope: IntakeScope;
  partnerId?: string;
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

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if ((!text && !pendingImages.length) || loading) return;
    const next = [
      ...messages,
      {
        role: "user" as const,
        content: text || "请识别图片中的信息",
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
          { role: "assistant", content: partial ? `${partial}\n\n（已停止）` : "（已停止，右侧已找到的信息保留）", trace: [...trace] },
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
        setMessages((m) => [...m, { role: "assistant", content: "（已停止）", trace: [...liveTrace] }]);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
      // 保留 trace 在消息里，仅清空进行中的流式 reply
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
          subtitle="左侧调研 · 右侧实时呈现"
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
          onClarify={(t) => send(t)}
          ready={ready}
          scope={scope}
          partnerId={partnerId}
          sourceText={messages.filter((m) => m.role === "user").map((m) => m.content).join("\n")}
          onApplied={handleApplied}
          input={input}
          onInputChange={setInput}
          onSend={() => send()}
          onStop={stop}
          pendingImages={pendingImages}
          onAddImages={(imgs) => setPendingImages((p) => [...p, ...imgs])}
          onRemoveImage={(i) => setPendingImages((p) => p.filter((_, j) => j !== i))}
          inputPlaceholder={proposal ? "继续补充，或右侧确认入库…" : undefined}
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
