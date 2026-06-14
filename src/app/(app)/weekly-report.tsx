"use client";

import { useEffect, useState } from "react";
import type { AiStreamState } from "@/lib/ai-trace";
import { consumeAiSse } from "@/lib/ai-trace";

type Report = { content: string; generatedAt: string };

export function WeeklyReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai/weekly")
      .then((r) => r.json())
      .then((d) => d?.content && setReport(d))
      .catch(() => {});
  }, []);

  async function generate() {
    setLoading(true);
    setError(null);
    setLiveText("");
    try {
      const res = await fetch("/api/ai/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ stream: true }),
      });
      const { data, liveText: finalText } = await consumeAiSse(res, (_ev, state: AiStreamState) => {
        setLiveText(state.liveText);
      });
      setReport(data as Report);
      if (finalText && !(data as Report).content) {
        setReport({ content: finalText, generatedAt: new Date().toISOString() });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setLiveText("");
    }
  }

  const displayContent = loading ? liveText : report?.content;

  return (
    <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl shadow-sm p-5 text-white">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold">✦ AI 经营周报</h3>
        <button
          onClick={generate}
          disabled={loading}
          className="text-xs rounded-md bg-white/15 hover:bg-white/25 px-2.5 py-1 disabled:opacity-50"
        >
          {loading ? "生成中…" : report ? "重新生成" : "生成本周周报"}
        </button>
      </div>
      {displayContent ? (
        <>
          {report && !loading && (
            <div className="text-[11px] text-indigo-200 mb-3">
              生成于 {new Date(report.generatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
          <p className="text-xs leading-relaxed whitespace-pre-wrap text-indigo-50">
            {displayContent}
            {loading && <span className="inline-block w-1 h-3 bg-indigo-200 ml-0.5 animate-pulse align-middle" />}
          </p>
        </>
      ) : (
        <p className="text-xs text-indigo-200 mt-2">
          一键生成本周经营摘要：Pipeline 变化、风险信号、本周建议聚焦的伙伴。
        </p>
      )}
      {error && <p className="text-xs text-amber-200 mt-2">{error}</p>}
    </div>
  );
}
