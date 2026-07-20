"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, EmptyState, fmtDateTime } from "@/components/ui";
import { useMessages } from "@/lib/i18n/context";

export type AiConversationLogItem = {
  id: string;
  channel: string;
  feature: string;
  mode: string | null;
  userMessage: string;
  status: string;
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
  status: string;
  createdAt: string;
  actor: { name: string } | null;
};

type Tab = "ai" | "system";

type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const SYSTEM_CATEGORIES = [
  "AUTH",
  "USER",
  "PARTNER",
  "CUSTOMER",
  "CONTACT",
  "OPPORTUNITY",
  "PROJECT",
  "CONTRACT",
  "TODO",
  "BUSINESS",
  "CRM",
  "LEADS",
  "AI",
  "SETTINGS",
] as const;

export function ActivityLogsCard({
  stats,
  bcp47,
}: {
  stats: { aiToday: number; aiWeek: number; sysToday: number; sysWeek: number };
  bcp47: string;
}) {
  const m = useMessages().activityLogs;
  const [tab, setTab] = useState<Tab>("ai");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [aiTotal, setAiTotal] = useState(0);
  const [systemTotal, setSystemTotal] = useState(0);

  const [channel, setChannel] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [aiLogs, setAiLogs] = useState<AiConversationLogItem[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemEventLogItem[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });

  useEffect(() => {
    void fetch("/api/activity-logs?type=totals")
      .then((r) => r.json())
      .then((data: { aiTotal: number; systemTotal: number }) => {
        setAiTotal(data.aiTotal);
        setSystemTotal(data.systemTotal);
      })
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: tab,
        page: String(page),
        status,
        search,
      });
      if (tab === "ai") params.set("channel", channel);
      else params.set("category", category);

      const res = await fetch(`/api/activity-logs?${params}`);
      if (!res.ok) return;
      const data = (await res.json()) as PaginatedResponse<AiConversationLogItem | SystemEventLogItem>;
      if (tab === "ai") {
        setAiLogs(data.items as AiConversationLogItem[]);
      } else {
        setSystemLogs(data.items as SystemEventLogItem[]);
      }
      setPagination({ total: data.total, page: data.page, totalPages: data.totalPages });
    } finally {
      setLoading(false);
    }
  }, [tab, page, channel, category, status, search]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  function switchTab(next: Tab) {
    setTab(next);
    setPage(1);
    setStatus("ALL");
    setSearch("");
    setSearchInput("");
    if (next === "ai") setChannel("ALL");
    else setCategory("ALL");
  }

  function applySearch() {
    setSearch(searchInput.trim());
    setPage(1);
  }

  const logs = tab === "ai" ? aiLogs : systemLogs;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox value={stats.aiToday} label={m.aiToday} />
        <StatBox value={stats.aiWeek} label={m.aiWeek} />
        <StatBox value={stats.sysToday} label={m.sysToday} />
        <StatBox value={stats.sysWeek} label={m.sysWeek} />
      </div>

      <div className="flex gap-2 border-b border-slate-100 pb-1">
        <TabButton active={tab === "ai"} onClick={() => switchTab("ai")}>
          {m.tabAi} ({aiTotal})
        </TabButton>
        <TabButton active={tab === "system"} onClick={() => switchTab("system")}>
          {m.tabSystem} ({systemTotal})
        </TabButton>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tab === "ai" ? (
          <FilterSelect
            label={m.filterChannel}
            value={channel}
            onChange={(v) => {
              setChannel(v);
              setPage(1);
            }}
            options={[
              { value: "ALL", label: m.filterAll },
              { value: "WEB", label: m.channelWeb },
              { value: "WECOM", label: m.channelWecom },
            ]}
          />
        ) : (
          <FilterSelect
            label={m.filterCategory}
            value={category}
            onChange={(v) => {
              setCategory(v);
              setPage(1);
            }}
            options={[
              { value: "ALL", label: m.filterAll },
              ...SYSTEM_CATEGORIES.map((c) => ({
                value: c,
                label: m.categoryLabels[c as keyof typeof m.categoryLabels] ?? c,
              })),
            ]}
          />
        )}
        <FilterSelect
          label={m.filterStatus}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: "ALL", label: m.filterAll },
            { value: "SUCCESS", label: m.success },
            { value: "FAILED", label: m.failed },
          ]}
        />
        <div className="flex items-center gap-1.5">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            placeholder={m.searchPlaceholder}
            className="h-8 rounded-md border border-slate-200 px-2 text-sm text-slate-700 w-44 sm:w-56 focus:outline-none focus:ring-1 focus:ring-slate-300"
          />
          <button
            type="button"
            onClick={applySearch}
            className="h-8 px-2.5 text-sm rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            {m.search}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-400">{m.loading}</div>
      ) : logs.length ? (
        <div className="rounded-lg border border-slate-100 divide-y divide-slate-50">
          {tab === "ai"
            ? aiLogs.map((row) => (
                <AiLogLine key={row.id} row={row} bcp47={bcp47} m={m} />
              ))
            : systemLogs.map((row) => (
                <SystemLogLine key={row.id} row={row} bcp47={bcp47} m={m} />
              ))}
        </div>
      ) : (
        <EmptyState text={tab === "ai" ? m.noAiLogs : m.noSystemLogs} />
      )}

      {!loading && pagination.totalPages > 0 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={setPage}
          labels={{ prev: m.prevPage, next: m.nextPage, pageOf: m.pageOf }}
        />
      )}
    </div>
  );
}

function AiLogLine({
  row,
  bcp47,
  m,
}: {
  row: AiConversationLogItem;
  bcp47: string;
  m: ReturnType<typeof useMessages>["activityLogs"];
}) {
  const user = row.user?.name ?? m.unknownUser;
  const partner = row.partner ? ` · ${row.partner.name}` : "";
  const msg = truncate(row.userMessage, 80);

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm min-w-0" title={row.userMessage}>
      <span className="text-xs text-slate-400 shrink-0 tabular-nums w-[72px]">
        {fmtDateTime(new Date(row.createdAt), bcp47)}
      </span>
      <Badge tone={row.channel === "WECOM" ? "blue" : "zinc"}>
        {row.channel === "WECOM" ? m.channelWecom : m.channelWeb}
      </Badge>
      <Badge tone={row.status === "SUCCESS" ? "green" : "red"}>
        {row.status === "SUCCESS" ? m.success : m.failed}
      </Badge>
      <span className="text-xs text-slate-400 shrink-0">{row.feature}</span>
      {row.durationMs != null && (
        <span className="text-xs text-slate-400 shrink-0 tabular-nums">{row.durationMs}ms</span>
      )}
      <span className="text-slate-700 truncate min-w-0 flex-1">
        <span className="text-slate-500">{user}{partner}</span>
        <span className="text-slate-300 mx-1.5">·</span>
        {msg}
      </span>
    </div>
  );
}

function SystemLogLine({
  row,
  bcp47,
  m,
}: {
  row: SystemEventLogItem;
  bcp47: string;
  m: ReturnType<typeof useMessages>["activityLogs"];
}) {
  const actor = row.actor?.name ?? row.actorLabel ?? m.systemActor;
  const target = row.targetLabel ? ` → ${row.targetLabel}` : "";
  const text = row.summary ?? row.action;

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm min-w-0" title={text}>
      <span className="text-xs text-slate-400 shrink-0 tabular-nums w-[72px]">
        {fmtDateTime(new Date(row.createdAt), bcp47)}
      </span>
      <Badge tone="zinc">{row.category}</Badge>
      <Badge tone={row.status === "SUCCESS" ? "green" : "red"}>
        {row.status === "SUCCESS" ? m.success : m.failed}
      </Badge>
      <span className="text-xs font-mono text-slate-400 shrink-0">{row.action}</span>
      <span className="text-slate-700 truncate min-w-0 flex-1">
        {text}
        <span className="text-slate-400 ml-2">{actor}{target}</span>
      </span>
    </div>
  );
}

function truncate(text: string, max: number) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
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

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-500">
      <span className="shrink-0">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-slate-200 px-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-slate-300"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  labels,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (p: number) => void;
  labels: { prev: string; next: string; pageOf: string };
}) {
  return (
    <div className="flex items-center justify-between pt-1">
      <span className="text-xs text-slate-400">
        {labels.pageOf.replace("{page}", String(page)).replace("{total}", String(totalPages)).replace("{count}", String(total))}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="px-3 py-1 text-sm rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {labels.prev}
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="px-3 py-1 text-sm rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {labels.next}
        </button>
      </div>
    </div>
  );
}
