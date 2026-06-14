"use client";

import { useMemo, useRef, useState } from "react";
import { createAgentFromBuilderAction } from "@/lib/agent-actions";
import type { AgentBuilderDraft, AgentBuilderMessage, AgentBuilderTurn } from "@/lib/agent-builder";

const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

const starters = [
  "帮我做一个每天早上扫描停滞伙伴并建待办的 Agent",
  "我想做一个会前简报 Agent：先查伙伴档案和知识库，再输出会议议程",
  "做一个竞品信号雷达，每周找 Power BI / Tableau 的新闻并沉淀话术",
];

function DraftPreview({ draft }: { draft: AgentBuilderDraft }) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="text-2xl">{draft.icon || "🤖"}</div>
        <div>
          <div className="text-sm font-semibold text-zinc-900">{draft.name || "未命名 Agent"}</div>
          <div className="text-xs text-zinc-500">{draft.description || "等待补全描述"}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="rounded-lg bg-white p-2">
          <div className="text-zinc-400">触发</div>
          <div className="font-medium text-zinc-800">{draft.trigger === "SCHEDULE" ? "定时" : "手动"}</div>
        </div>
        <div className="rounded-lg bg-white p-2">
          <div className="text-zinc-400">作用域</div>
          <div className="font-medium text-zinc-800">{draft.scopeType === "PARTNER" ? "绑定伙伴" : "全局"}</div>
        </div>
        <div className="rounded-lg bg-white p-2">
          <div className="text-zinc-400">工具</div>
          <div className="font-medium text-zinc-800">{draft.skills.length}</div>
        </div>
        <div className="rounded-lg bg-white p-2">
          <div className="text-zinc-400">技能</div>
          <div className="font-medium text-zinc-800">{draft.skillIds.length}</div>
        </div>
      </div>
      {draft.rationale && <p className="text-xs text-zinc-500 leading-relaxed">{draft.rationale}</p>}
      {draft.missingSkillNotes.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
          <div className="text-xs font-semibold text-amber-800 mb-1">技能缺口与临时处理</div>
          <ul className="list-disc list-inside text-xs text-amber-700 space-y-1">
            {draft.missingSkillNotes.map((note, i) => <li key={i}>{note}</li>)}
          </ul>
        </div>
      )}
      {draft.instructions && (
        <details className="text-xs">
          <summary className="cursor-pointer text-indigo-700 font-medium">查看生成的任务指令</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-3 text-zinc-600 leading-relaxed">{draft.instructions}</pre>
        </details>
      )}
    </div>
  );
}

export function AgentBuilder() {
  const [messages, setMessages] = useState<AgentBuilderMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [turn, setTurn] = useState<AgentBuilderTurn | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const draftJson = useMemo(() => JSON.stringify(turn?.draft ?? null), [turn]);

  async function send(text?: string) {
    const content = (text ?? inputText).trim();
    if (!content || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInputText("");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/agent-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "构建失败");
      setTurn(data);
      setMessages([...next, { role: "assistant", content: data.reply }]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
      <div className="xl:col-span-3 bg-white rounded-xl border border-zinc-200/80 shadow-sm flex flex-col min-h-[640px]">
        <div className="px-5 py-4 border-b border-zinc-100">
          <div className="text-sm font-semibold text-zinc-900">对话式 Agent Builder</div>
          <div className="text-xs text-zinc-400 mt-1">描述目标即可；信息不够时会生成调研问卷，并自动匹配工具与技能。</div>
        </div>
        <div className="flex-1 p-5 space-y-3 overflow-y-auto">
          {messages.length === 0 && (
            <div className="space-y-2">
              <div className="text-xs text-zinc-400">可以这样开始：</div>
              {starters.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="block w-full rounded-lg border border-zinc-200 px-3 py-2 text-left text-xs text-zinc-600 hover:border-indigo-300 hover:text-indigo-700"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={`max-w-[86%] rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${m.role === "user" ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-800"}`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && <div className="text-xs text-zinc-400 animate-pulse">正在梳理目标、匹配工具与技能、生成草案...</div>}
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-zinc-100 p-3 flex gap-2">
          <input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && send()}
            placeholder="描述你想构建的 Agent，或回答上面的调研问题..."
            className={input}
          />
          <button
            onClick={() => send()}
            disabled={loading || !inputText.trim()}
            className="rounded-lg bg-indigo-600 text-white px-4 text-sm hover:bg-indigo-700 disabled:opacity-40"
          >
            发送
          </button>
        </div>
      </div>

      <div className="xl:col-span-2 space-y-4">
        {turn?.draft ? (
          <>
            <DraftPreview draft={turn.draft} />
            {turn.questions.length > 0 && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                <div className="text-sm font-semibold text-amber-900 mb-2">调研问卷</div>
                <ol className="list-decimal list-inside text-xs text-amber-800 space-y-1.5">
                  {turn.questions.map((q, i) => <li key={i}>{q}</li>)}
                </ol>
              </div>
            )}
            <form action={createAgentFromBuilderAction} className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
              <input type="hidden" name="draft" value={draftJson} />
              <p className="text-xs text-zinc-500 leading-relaxed">
                草案确认后会创建一个可编辑 Agent；之后仍可进入详情页微调工具、技能、触发方式和指令。
              </p>
              <button
                disabled={!turn.ready}
                className="w-full rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-40"
              >
                {turn.ready ? "确认并创建 Agent" : "回答问卷后再创建"}
              </button>
            </form>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-white p-6 text-sm text-zinc-400">
            这里会展示 Agent 草案、工具/技能匹配理由和需要确认的调研问卷。
          </div>
        )}
      </div>
    </div>
  );
}
