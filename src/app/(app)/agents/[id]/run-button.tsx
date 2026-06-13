"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunButton({ agentId, compact }: { agentId: string; compact?: boolean }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "运行失败");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "运行失败");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-500 max-w-xs truncate" title={error}>{error}</span>}
      <button
        onClick={run}
        disabled={running}
        className={
          compact
            ? "rounded-md bg-emerald-600 text-white px-2.5 py-1 text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
            : "rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        }
      >
        {running ? "运行中…" : compact ? "▶ 运行" : "▶ 立即运行"}
      </button>
    </div>
  );
}
