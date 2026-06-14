"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { IntakeProposal, IntakeScope } from "@/lib/ai-intake";
import type { AiStreamState, AiTraceStep } from "@/lib/ai-trace";
import { consumeAiSse } from "@/lib/ai-trace";
import { AiProcessTrace } from "@/components/ai-process-trace";
import { ProposalConfirmZone } from "@/components/proposal-confirm-zone";

type Msg = { role: "user" | "assistant"; content: string; trace?: AiTraceStep[] };

const SCOPE_META: Record<IntakeScope, { title: string; placeholder: string }> = {
  new_partner: {
    title: "AI 建档",
    placeholder:
      "扔公司名、会议记录、聊天记录、KMS 链接都行——我会读 KMS，也会联网/领英查公开信息，多源叠加尽量填完整。\n例如：\n• 刚见了迪拜 Acme Analytics，做 Power BI 实施\n• https://kms.fineres.com/pages/viewpage.action?pageId=123456\n• 就一家叫 TechMantra 的公司，帮我建档",
  },
  powermap: {
    title: "AI 加人物",
    placeholder: "描述要加的人，或粘贴名片/会议记录。\n例如：他们的 CTO 叫 Khalid，之前在 STC，对国产软件有点顾虑，汇报给 CEO Mosaab。",
  },
  opportunity: {
    title: "AI 加商机",
    placeholder: "描述商机或粘贴相关沟通。\n例如：Purity IT 项目预算 $25K，7 月启动，现在在做需求诊断。",
  },
  profile: {
    title: "AI 补全画像",
    placeholder:
      "描述这家公司的情况，或粘贴 KMS 链接/会议记录，我会结合现有档案和联网调研补全字段。\n例如：他们是微软金牌伙伴，主做 Power BI，客户有 DAMAC，差异化是 UAE+沙特双实体。",
  },
  training: {
    title: "AI 加培训",
    placeholder: "描述要安排的培训/认证。\n例如：让他们两个工程师 8 月底前考下 FCA-FineBI 认证。",
  },
  todo: {
    title: "AI 加待办",
    placeholder: "说要跟进的事。\n例如：周五前给 Beinex 发 Arabic RTL 案例材料，下周二安排 Demo。",
  },
  solution: {
    title: "AI 加联合方案",
    placeholder: "描述这个联合方案。\n例如：针对零售客户，帆软出 FineReport 报表层，伙伴出数据集成和实施，按项目分成。",
  },
};

function applyStreamState(
  state: AiStreamState,
  setters: {
    setLiveTrace: (v: AiTraceStep[]) => void;
    setLiveText: (v: string) => void;
    setProposal: (v: IntakeProposal | null) => void;
    setQuestions: (v: string[]) => void;
    setReady: (v: boolean) => void;
  }
) {
  setters.setLiveTrace(state.trace);
  setters.setLiveText(state.liveText);
  if (state.proposal) {
    setters.setProposal(state.proposal);
    setters.setQuestions(state.questions);
    setters.setReady(state.ready);
  }
}

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
  const [liveTrace, setLiveTrace] = useState<AiTraceStep[]>([]);
  const [liveText, setLiveText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const showConfirm = !!proposal;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, liveTrace, liveText, proposal]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    setLiveTrace([]);
    setLiveText("");
    try {
      const res = await fetch("/api/ai/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ scope, partnerId, messages: next, stream: true }),
      });
      const streamSetters = { setLiveTrace, setLiveText, setProposal, setQuestions, setReady };
      const { data, trace, liveText: finalText } = await consumeAiSse(res, (_ev, state) =>
        applyStreamState(state, streamSetters)
      );
      const turn = data as { reply: string; proposal: IntakeProposal; ready: boolean; questions?: string[] };
      setMessages((m) => [...m, { role: "assistant", content: finalText || turn.reply, trace }]);
      setProposal(turn.proposal);
      setReady(turn.ready);
      setQuestions(turn.questions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setLiveTrace([]);
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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="bg-white w-[min(960px,94vw)] h-full shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600 text-white shrink-0">
          <div>
            <div className="text-base font-semibold flex items-center gap-1.5">✦ {meta.title}</div>
            <div className="text-xs text-indigo-200 mt-0.5">关键步骤即时输出 · 勾选确认后入库</div>
          </div>
          <button onClick={onClose} className="text-indigo-100 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div
          ref={scrollRef}
          className={`overflow-y-auto px-6 py-4 space-y-3 min-h-0 ${showConfirm ? "flex-[0.9]" : "flex-1"}`}
        >
          {messages.length === 0 && (
            <div className="text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed bg-zinc-50 rounded-lg p-4">
              {meta.placeholder}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}>
              {m.role === "assistant" && m.trace && m.trace.length > 0 && (
                <AiProcessTrace steps={m.trace} expandLatestDone className="w-full" />
              )}
              <div
                className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                  m.role === "user" ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-800"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="w-full space-y-3">
              <AiProcessTrace steps={liveTrace} loading expandLatestDone />
              {liveText && (
                <div className="rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed bg-zinc-100 text-zinc-800 border border-indigo-100">
                  {liveText}
                  <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
                </div>
              )}
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {showConfirm && (
          <div className="shrink-0 border-t px-5 py-4 min-h-[360px] max-h-[min(520px,52vh)] overflow-y-auto bg-zinc-50/50">
            <ProposalConfirmZone
              proposal={proposal}
              scope={scope}
              partnerId={partnerId}
              questions={questions}
              ready={ready}
              onApplied={handleApplied}
              spacious
              sourceText={messages.filter((m) => m.role === "user").map((m) => m.content).join("\n")}
            />
          </div>
        )}

        <div className="border-t px-6 py-3 shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder={proposal ? "继续补充，或确认下方入库…" : "输入后按 ⌘/Ctrl + Enter 发送…"}
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="rounded-lg bg-indigo-600 text-white px-5 py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 shrink-0"
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
