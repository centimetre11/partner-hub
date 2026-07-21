"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import {
  confirmLeadReviewItemsAction,
  discussLeadReviewItemAction,
  endLeadReviewMeetingAction,
  resetLeadReviewToPrepAction,
  runLeadReviewPrepAction,
  saveLeadReviewItemNotesAction,
  saveLeadReviewLiveNotesAction,
  startLeadReviewMeetingAction,
} from "@/lib/lead-review/actions";
import { LEAD_REVIEW_VERDICTS, type LeadReviewVerdict } from "@/lib/lead-review/types";
import type { LeadPrepBrief } from "@/lib/lead-review/brief";

const VERDICT_LABEL: Record<LeadReviewVerdict, string> = {
  QUALITY: "质量问题",
  DIGESTION: "消化问题",
  NORMAL: "正常",
  WATCH: "待观察",
};

type ItemRow = {
  id: string;
  source: string;
  displayName: string | null;
  status: string;
  verdict: string | null;
  coreNotes: string | null;
  discussedAt: string | null;
  prepBrief: string | null;
  channelId: string | null;
  leadId: string | null;
};

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800 whitespace-pre-wrap break-words">{value}</dd>
    </div>
  );
}

export function LeadReviewWorkspace({
  meetingId,
  status,
  liveNotes,
  items,
  facts,
  stats,
}: {
  meetingId: string;
  status: string;
  liveNotes: string | null;
  items: ItemRow[];
  facts: Record<string, LeadPrepBrief>;
  stats: {
    CHANNEL: Record<string, number>;
    NURTURE: Record<string, number>;
    ALL: Record<string, number>;
  } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(liveNotes ?? "");
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const [drafts, setDrafts] = useState<
    Record<string, { verdict: LeadReviewVerdict | ""; coreNotes: string; todoTitle: string }>
  >(() => {
    const init: Record<
      string,
      { verdict: LeadReviewVerdict | ""; coreNotes: string; todoTitle: string }
    > = {};
    for (const it of items) {
      init[it.id] = {
        verdict: (it.verdict as LeadReviewVerdict) || "",
        coreNotes: it.coreNotes ?? "",
        todoTitle: "",
      };
    }
    return init;
  });

  const active = items.find((i) => i.id === activeId) ?? items[0];
  const brief = active ? facts[active.id] : null;

  function run(fn: () => Promise<{ error?: string; ok?: boolean }>) {
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function updateDraft(
    itemId: string,
    patch: Partial<{ verdict: LeadReviewVerdict | ""; coreNotes: string; todoTitle: string }>,
  ) {
    setDrafts((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId]!, ...patch },
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(status === "DRAFT" || status === "PREP") && (
          <button
            type="button"
            disabled={pending}
            className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm disabled:opacity-40"
            onClick={() => run(() => runLeadReviewPrepAction(meetingId))}
          >
            {status === "DRAFT" ? "开会准备" : "刷新简报"}
          </button>
        )}
        {(status === "DRAFT" || status === "PREP") && (
          <button
            type="button"
            disabled={pending}
            className="rounded-lg bg-emerald-700 text-white px-3 py-1.5 text-sm disabled:opacity-40"
            onClick={() => run(() => startLeadReviewMeetingAction(meetingId))}
          >
            开始开会
          </button>
        )}
        {status === "LIVE" && (
          <button
            type="button"
            disabled={pending}
            className="rounded-lg bg-amber-700 text-white px-3 py-1.5 text-sm disabled:opacity-40"
            onClick={() => run(() => endLeadReviewMeetingAction(meetingId))}
          >
            结束开会
          </button>
        )}
        {(status === "LIVE" || status === "PROCESSING") && (
          <button
            type="button"
            disabled={pending}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40"
            onClick={() => run(() => resetLeadReviewToPrepAction(meetingId))}
          >
            回到会前
          </button>
        )}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {stats && status === "DONE" ? (
        <Card title="本场结论统计">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            {(
              [
                ["ALL", "合计"],
                ["CHANNEL", "Channel"],
                ["NURTURE", "培育"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <div className="text-xs text-slate-500 mb-2">{label}</div>
                <ul className="space-y-1">
                  {LEAD_REVIEW_VERDICTS.map((v) => (
                    <li key={v} className="flex justify-between">
                      <span>{VERDICT_LABEL[v]}</span>
                      <span className="font-medium">{stats[key][v] ?? 0}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card title="议程">
          <ul className="divide-y divide-slate-50 -mx-1">
            {items.map((it) => {
              const activeRow = it.id === active?.id;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(it.id)}
                    className={`w-full text-left px-2 py-2 rounded-lg text-sm ${
                      activeRow ? "bg-sky-50 text-sky-900" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge tone={it.source === "CHANNEL" ? "amber" : "blue"}>
                        {it.source === "CHANNEL" ? "Channel" : "培育"}
                      </Badge>
                      {it.status === "DISCUSSED" || it.status === "CONFIRMED" ? (
                        <Badge tone="green">已过</Badge>
                      ) : null}
                      {it.verdict ? (
                        <Badge tone="zinc">
                          {VERDICT_LABEL[it.verdict as LeadReviewVerdict] ?? it.verdict}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 font-medium truncate">{it.displayName ?? "—"}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {active ? (
          <div className="space-y-4">
            <Card title={brief?.name || active.displayName || "线索"}>
              {brief ? (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                  <Fact label="类型" value={brief.typeDetail} />
                  <Fact label="等级 / 状态" value={[brief.rank, brief.status].filter(Boolean).join(" · ")} />
                  <Fact label="责任销售" value={brief.salesman} />
                  <Fact label="转出前销售" value={brief.staSalesOld} />
                  <Fact label={brief.dateLabel} value={brief.dateValue} />
                  <Fact label="KPI 截止" value={brief.jzDate} />
                  <Fact label="国家 / 城市" value={brief.region} />
                  <Fact label="省份" value={brief.province} />
                  <Fact label="来源" value={brief.sourceLabel} />
                  <Fact label="来源详情" value={brief.sourceDetail} />
                  <Fact label="联系人" value={brief.contName} />
                  <Fact label="职位" value={brief.contDuty} />
                  <Fact label="电话" value={brief.phone} />
                  <Fact label="邮箱" value={brief.contEmail} />
                  <Fact label="代理" value={brief.overseaAgent} />
                  <Fact label="时区" value={brief.zone} />
                  <Fact label="公司 ID" value={brief.companyId} />
                  <Fact label="线索 ID" value={brief.clueId} />
                </dl>
              ) : (
                <p className="text-sm text-slate-500">未找到该条源数据。</p>
              )}

              {status === "LIVE" ? (
                <div className="mt-4">
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-lg bg-sky-700 text-white px-3 py-1.5 text-sm disabled:opacity-40"
                    onClick={() =>
                      run(() => discussLeadReviewItemAction(meetingId, active.id))
                    }
                  >
                    标记正在讨论
                  </button>
                </div>
              ) : null}
            </Card>

            <Card title="商务记录">
              {brief?.traceDetail || brief?.detail ? (
                <dl className="space-y-4 text-sm">
                  {brief.traceDetail ? (
                    <div>
                      <dt className="text-xs text-slate-500 mb-1">商务记录1</dt>
                      <dd className="text-slate-800 whitespace-pre-wrap break-words rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 max-h-64 overflow-y-auto">
                        {brief.traceDetail}
                      </dd>
                    </div>
                  ) : null}
                  {brief.detail ? (
                    <div>
                      <dt className="text-xs text-slate-500 mb-1">商务记录2</dt>
                      <dd className="text-slate-800 whitespace-pre-wrap break-words rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 max-h-64 overflow-y-auto">
                        {brief.detail}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p className="text-sm text-slate-500">
                  暂无商务记录。
                  {active.source === "CHANNEL"
                    ? "公海同步若未带回该字段，可点「开会准备」后仍为空则需重新同步 Channel 数据。"
                    : ""}
                </p>
              )}
            </Card>

            {brief?.topics?.length ? (
              <Card title="建议议题">
                <ul className="list-disc pl-5 space-y-0.5 text-sm text-slate-700">
                  {brief.topics.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {(status === "LIVE" || status === "PROCESSING" || status === "DONE") && (
              <Card title="结论打标">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {LEAD_REVIEW_VERDICTS.map((v) => {
                      const selected = drafts[active.id]?.verdict === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          disabled={status === "DONE" || active.status === "CONFIRMED"}
                          onClick={() => updateDraft(active.id, { verdict: v })}
                          className={`rounded-lg px-3 py-1.5 text-sm border ${
                            selected
                              ? "bg-slate-900 text-white border-slate-900"
                              : "border-slate-200 text-slate-700 hover:bg-slate-50"
                          } disabled:opacity-50`}
                        >
                          {VERDICT_LABEL[v]}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    value={drafts[active.id]?.coreNotes ?? ""}
                    disabled={status === "DONE" || active.status === "CONFIRMED"}
                    onChange={(e) => updateDraft(active.id, { coreNotes: e.target.value })}
                    onBlur={() => {
                      const text = drafts[active.id]?.coreNotes ?? "";
                      void saveLeadReviewItemNotesAction(meetingId, active.id, text);
                    }}
                    rows={4}
                    placeholder="讨论备注…"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  {status === "PROCESSING" && active.status !== "CONFIRMED" ? (
                    <>
                      <input
                        value={drafts[active.id]?.todoTitle ?? ""}
                        onChange={(e) => updateDraft(active.id, { todoTitle: e.target.value })}
                        placeholder="可选：待办标题"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        disabled={pending || !drafts[active.id]?.verdict}
                        className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm disabled:opacity-40"
                        onClick={() => {
                          const d = drafts[active.id];
                          if (!d?.verdict) return;
                          const todos = d.todoTitle.trim()
                            ? [{ title: d.todoTitle.trim(), include: true }]
                            : [];
                          run(() =>
                            confirmLeadReviewItemsAction(meetingId, [
                              {
                                itemId: active.id,
                                verdict: d.verdict as LeadReviewVerdict,
                                coreNotes: d.coreNotes,
                                todos,
                              },
                            ]),
                          );
                        }}
                      >
                        确认本条
                      </button>
                    </>
                  ) : null}
                  {active.status === "CONFIRMED" ? (
                    <p className="text-sm text-emerald-700">本条已确认入库。</p>
                  ) : null}
                </div>
              </Card>
            )}

            {(status === "LIVE" || status === "PROCESSING") && (
              <Card title="会议笔记">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                />
                <button
                  type="button"
                  disabled={pending}
                  className="mt-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  onClick={() =>
                    run(() => saveLeadReviewLiveNotesAction(meetingId, notes))
                  }
                >
                  保存笔记
                </button>
              </Card>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
