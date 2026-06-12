"use client";

import { useEffect, useState } from "react";

type Report = { content: string; generatedAt: string };

export function WeeklyReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
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
    try {
      const res = await fetch("/api/ai/weekly", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成失败");
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

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
      {report ? (
        <>
          <div className="text-[11px] text-indigo-200 mb-3">
            生成于 {new Date(report.generatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </div>
          <p className="text-xs leading-relaxed whitespace-pre-wrap text-indigo-50">{report.content}</p>
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
