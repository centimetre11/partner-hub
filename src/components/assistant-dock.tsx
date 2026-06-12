"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Msg = { role: "user" | "assistant"; content: string; actions?: string[] };

const SUGGESTIONS = [
  "哪些 Tier A 伙伴超过 2 周没跟进？",
  "对比 Beinex 和 SEIDOR / Clariba，谁更适合先推进？",
  "利雅得有哪些有政府客户资源的候选？",
  "把 DataPlus 的优先级改成 P0，并加一条待办：下周安排 Demo",
];

export function AssistantDock() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "请求失败");
      setMessages([...next, { role: "assistant", content: data.reply, actions: data.actions }]);
      if (data.actions?.length) router.refresh();
    } catch (e) {
      setMessages([...next, { role: "assistant", content: `出错了：${e instanceof Error ? e.message : e}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-40 w-13 h-13 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-xl shadow-indigo-300/50 flex items-center justify-center text-xl hover:scale-105 transition-transform"
        style={{ width: 52, height: 52 }}
        title="AI 助手"
      >
        {open ? "×" : "✦"}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-[420px] max-w-[calc(100vw-3rem)] h-[560px] bg-white rounded-2xl shadow-2xl border border-zinc-200 flex flex-col overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
            <div className="text-sm font-semibold">✦ AI 助手</div>
            <div className="text-[11px] text-indigo-200">能查数据、改档案、建待办 — 直接用自然语言说</div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                <div className="text-xs text-zinc-400 mb-2">试试这些：</div>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="block w-full text-left text-xs rounded-lg border border-zinc-200 px-3 py-2 text-zinc-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                    m.role === "user" ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-800"
                  }`}
                >
                  {m.content}
                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-zinc-200 space-y-1">
                      {m.actions.map((a, j) => (
                        <div key={j} className="text-xs text-emerald-700">✓ {a}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && <div className="text-xs text-zinc-400 animate-pulse">AI 思考中（可能在查数据）…</div>}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t border-zinc-100 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && send()}
              placeholder="问问题，或下达指令…"
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="rounded-lg bg-indigo-600 text-white px-3.5 text-sm hover:bg-indigo-700 disabled:opacity-40"
            >
              发送
            </button>
          </div>
        </div>
      )}
    </>
  );
}
