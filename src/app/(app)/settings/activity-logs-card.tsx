"use client";

import { useState } from "react";
import { Badge, EmptyState, fmtDateTime } from "@/components/ui";
import { useMessages } from "@/lib/i18n/context";

export type AiConversationLogItem = {
  id: string;
  channel: string;
  feature: string;
  mode: string | null;
  userMessage: string;
  assistantReply: string | null;
  status: string;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
  user: { name: string; email: string } | null;
  partner: { name: string } | null;
};

export type SystemEventLogItem = {
  id: string;
  category: string;
  action: string;
  actorLabel: string | null;
  targetType: string | null;
  targetLabel: string | null;
  summary: string | null;
  detail: string | null;
  status: string;
  createdAt: string;
  actor: { name: string } | null;
};

type Tab = "ai" | "system";

export function ActivityLogsCard({
  aiLogs,
  systemLogs,
  stats,
  bcp47,
}: {
  aiLogs: AiConversationLogItem[];
  systemLogs: SystemEventLogItem[];
  stats: { aiToday: number; aiWeek: number; sysToday: number; sysWeek: number };
  bcp47: string;
}) {
  const m = useMessages().activityLogs;
  const [tab, setTab] = useState<Tab>("ai");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox value={stats.aiToday} label={m.aiToday} />
        <StatBox value={stats.aiWeek} label={m.aiWeek} />
        <StatBox value={stats.sysToday} label={m.sysToday} />
        <StatBox value={stats.sysWeek} label={m.sysWeek} />
      </div>

      <div className="flex gap-2 border-b border-slate-100 pb-1">
        <TabButton active={tab === "ai"} onClick={() => setTab("ai")}>
          {m.tabAi} ({aiLogs.length})
        </TabButton>
        <TabButton active={tab === "system"} onClick={() => setTab("system")}>
          {m.tabSystem} ({systemLogs.length})
        </TabButton>
      </div>

      {tab === "ai" ? (
        aiLogs.length ? (
          <div className="space-y-2">
            {aiLogs.map((row) => (
              <LogRow key={row.id} time={fmtDateTime(new Date(row.createdAt), bcp47)}>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <Badge tone={row.channel === "WECOM" ? "blue" : "zinc"}>
                    {row.channel === "WECOM" ? m.channelWecom : m.channelWeb}
                  </Badge>
                  <Badge tone={row.status === "SUCCESS" ? "green" : "red"}>
                    {row.status === "SUCCESS" ? m.success : m.failed}
                  </Badge>
                  {row.mode && <span className="text-xs text-slate-400">{row.mode}</span>}
                  {row.durationMs != null && (
                    <span className="text-xs text-slate-400 tabular-nums">{row.durationMs}ms</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mb-2">
                  {row.feature} · {row.user?.name ?? m.unknownUser}
                  {row.partner ? ` · ${row.partner.name}` : ""}
                </div>
                <details className="group">
                  <summary className="text-sm text-slate-800 cursor-pointer list-none flex items-start gap-2">
                    <span className="text-slate-400 shrink-0">{m.question}:</span>
                    <span className="line-clamp-2 group-open:line-clamp-none">{row.userMessage}</span>
                  </summary>
                  {row.assistantReply && (
                    <div className="mt-2 pl-0 text-sm text-slate-600 whitespace-pre-wrap border-t border-slate-50 pt-2">
                      <span className="text-slate-400 text-xs block mb-1">{m.answer}:</span>
                      {row.assistantReply}
                    </div>
                  )}
                  {row.error && (
                    <div className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">{row.error}</div>
                  )}
                </details>
              </LogRow>
            ))}
          </div>
        ) : (
          <EmptyState text={m.noAiLogs} />
        )
      ) : systemLogs.length ? (
        <div className="space-y-2">
          {systemLogs.map((row) => (
            <LogRow key={row.id} time={fmtDateTime(new Date(row.createdAt), bcp47)}>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <Badge tone="zinc">{row.category}</Badge>
                <Badge tone={row.status === "SUCCESS" ? "green" : "red"}>
                  {row.status === "SUCCESS" ? m.success : m.failed}
                </Badge>
                <span className="text-xs font-mono text-slate-400">{row.action}</span>
              </div>
              <div className="text-sm text-slate-800">{row.summary ?? row.action}</div>
              <div className="text-xs text-slate-500 mt-1">
                {row.actor?.name ?? row.actorLabel ?? m.systemActor}
                {row.targetLabel ? ` → ${row.targetType ?? ""} ${row.targetLabel}` : ""}
              </div>
              {row.detail && (
                <details className="mt-2">
                  <summary className="text-xs text-sky-600 cursor-pointer">{m.viewDetail}</summary>
                  <pre className="mt-1 text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 rounded p-2">{row.detail}</pre>
                </details>
              )}
            </LogRow>
          ))}
        </div>
      ) : (
        <EmptyState text={m.noSystemLogs} />
      )}
    </div>
  );
}

function StatBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-lg font-bold text-slate-900 tabular-nums">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function LogRow({ time, children }: { time: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-100 px-4 py-3">
      <div className="text-xs text-slate-400 mb-2">{time}</div>
      {children}
    </div>
  );
}
