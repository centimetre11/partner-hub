"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AiStreamState } from "@/lib/ai-trace";
import { consumeAiSse } from "@/lib/ai-trace";

export function AiPanel({ partnerId, missing }: { partnerId: string; missing: string[] }) {
  const router = useRouter();
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState<"q" | "s" | null>(null);
  const [liveText, setLiveText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function genQuestions() {
    setLoading("q");
    setError(null);
    try {
      const res = await fetch("/api/ai/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setQuestions(data.questions);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }

  async function genSummary() {
    setLoading("s");
    setError(null);
    setLiveText("");
    setSummary(null);
    try {
      const res = await fetch("/api/ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ partnerId, stream: true }),
      });
      const { data, liveText: finalText } = await consumeAiSse(res, (_ev, state: AiStreamState) => {
        setLiveText(state.liveText);
        setSummary(state.liveText);
      });
      const result = data as { summary: string };
      setSummary(finalText || result.summary);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
      setLiveText("");
    }
  }

  return (
    <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl shadow-sm p-5 text-white">
      <h3 className="text-sm font-semibold flex items-center gap-1.5">✦ AI Assistant</h3>
      <p className="text-xs text-indigo-200 mt-1 mb-4">
        Generate contact questions from profile gaps; or summarize recent activity.
      </p>
      <div className="flex gap-2">
        <button
          onClick={genQuestions}
          disabled={loading !== null}
          className="flex-1 rounded-lg bg-white/15 hover:bg-white/25 px-3 py-2 text-xs font-medium disabled:opacity-50 transition-colors"
        >
          {loading === "q" ? "Generating…" : `Fill gaps (${missing.length} missing)`}
        </button>
        <button
          onClick={genSummary}
          disabled={loading !== null}
          className="flex-1 rounded-lg bg-white/15 hover:bg-white/25 px-3 py-2 text-xs font-medium disabled:opacity-50 transition-colors"
        >
          {loading === "s" ? "Generating…" : "Generate activity summary"}
        </button>
      </div>
      {error && <p className="text-xs text-amber-200 mt-3">{error}</p>}
      {questions && (
        <div className="mt-4 bg-white/10 rounded-lg p-3.5">
          <div className="text-xs font-semibold mb-2">Questions for next contact:</div>
          <ol className="text-xs space-y-1.5 list-decimal list-inside text-indigo-50">
            {questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </div>
      )}
      {loading === "s" && liveText && (
        <div className="mt-4 bg-white/10 rounded-lg p-3.5">
          <div className="text-xs font-semibold mb-2">Generating activity summary…</div>
          <p className="text-xs text-indigo-50 whitespace-pre-wrap leading-relaxed">
            {liveText}
            <span className="inline-block w-1 h-3 bg-indigo-200 ml-0.5 animate-pulse align-middle" />
          </p>
        </div>
      )}
      {summary && loading !== "s" && (
        <div className="mt-4 bg-white/10 rounded-lg p-3.5">
          <div className="text-xs font-semibold mb-2">Activity summary (saved to timeline):</div>
          <p className="text-xs text-indigo-50 whitespace-pre-wrap leading-relaxed">{summary}</p>
        </div>
      )}
    </div>
  );
}
