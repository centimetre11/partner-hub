"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  ConfirmItemPayload,
  ConfirmedItemSnapshot,
  PartnerPrepBrief,
} from "@/lib/partner-review/types";
import {
  discussPartnerAction,
  endPartnerReviewMeetingAction,
  pullDingTalkTranscriptAction,
  runMeetingPrepAction,
  runMeetingSplitAction,
  saveTranscriptTextAction,
  startPartnerReviewMeetingAction,
  attachDingTalkRecordingAction,
  confirmMeetingItemsAction,
  markDingTalkRecordingStartedAction,
} from "@/lib/partner-review/actions";
import type { SplitProposal } from "@/lib/partner-review/split-types";
import type { MeetingClient, ReviewItemClient } from "@/lib/partner-review/meeting-client";
import { isDingTalkClient, startDingTalkA1Recording } from "@/lib/dingtalk/client-record";
import { TodoCompleteButton } from "@/components/todo-complete-dialog";

export type { MeetingClient, ReviewItemClient };

const RAPID_CLICK_WINDOW_MS = 12_000;
const RAPID_CLICK_WARN_COUNT = 3;

export function MeetingWorkspace({ meeting: initial }: { meeting: MeetingClient }) {
  const router = useRouter();
  const [meeting, setMeeting] = useState(initial);
  const [activeItemId, setActiveItemId] = useState<string | null>(initial.items[0]?.id ?? null);
  const [liveNotes, setLiveNotes] = useState(initial.liveNotes ?? "");
  const [transcript, setTranscript] = useState(initial.transcriptText ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [proposal, setProposal] = useState<SplitProposal | null>(null);
  const [currentDiscussItemId, setCurrentDiscussItemId] = useState<string | null>(() => {
    const discussed = [...initial.items]
      .filter((it) => it.markerInsertedAt || it.discussedAt)
      .sort((a, b) => {
        const ta = Date.parse(a.markerInsertedAt || a.discussedAt || "") || 0;
        const tb = Date.parse(b.markerInsertedAt || b.discussedAt || "") || 0;
        return tb - ta;
      });
    return discussed[0]?.id ?? null;
  });
  const recentDiscussClicks = useRef<{ itemId: string; at: number }[]>([]);
  const [confirmDrafts, setConfirmDrafts] = useState<
    Record<
      string,
      {
        coreNotes: string;
        businessRecordTitle: string;
        businessRecordContent: string;
        skipBusinessRecord: boolean;
        todos: { id?: string; title: string; detail: string; dueDate: string; include: boolean }[];
      }
    >
  >({});
  const [dingForm, setDingForm] = useState({
    recordId: initial.dingtalkRecordId ?? "",
    conferenceId: initial.dingtalkConferenceId ?? "",
    spaceId: initial.dingtalkSpaceId ?? "",
    fileId: initial.dingtalkFileId ?? "",
  });

  useEffect(() => {
    setMeeting(initial);
    setLiveNotes(initial.liveNotes ?? "");
    setTranscript(initial.transcriptText ?? "");
    setDingForm({
      recordId: initial.dingtalkRecordId ?? "",
      conferenceId: initial.dingtalkConferenceId ?? "",
      spaceId: initial.dingtalkSpaceId ?? "",
      fileId: initial.dingtalkFileId ?? "",
    });
  }, [initial]);

  const activeItem = useMemo(
    () => meeting.items.find((i) => i.id === activeItemId) ?? null,
    [meeting.items, activeItemId],
  );

  const currentDiscussItem = useMemo(
    () => meeting.items.find((i) => i.id === currentDiscussItemId) ?? null,
    [meeting.items, currentDiscussItemId],
  );

  function flash(ok?: string, err?: string) {
    setMessage(ok ?? null);
    setError(err ?? null);
  }

  function noteRapidDiscussClick(itemId: string) {
    const now = Date.now();
    recentDiscussClicks.current = [
      ...recentDiscussClicks.current.filter((c) => now - c.at < RAPID_CLICK_WINDOW_MS),
      { itemId, at: now },
    ];
    const unique = new Set(recentDiscussClicks.current.map((c) => c.itemId));
    if (unique.size >= RAPID_CLICK_WARN_COUNT) {
      flash(undefined, "请按讨论顺序点伙伴：开始聊谁再点谁，勿提前把议程全点完，否则转写难以按伙伴切开。");
    }
  }

  function run(fn: () => Promise<void>, opts?: { refresh?: boolean }) {
    const shouldRefresh = opts?.refresh !== false;
    startTransition(async () => {
      try {
        await fn();
        if (shouldRefresh) router.refresh();
      } catch (e) {
        flash(undefined, e instanceof Error ? e.message : String(e));
      }
    });
  }

  const phase =
    meeting.status === "DONE"
      ? "done"
      : meeting.status === "PROCESSING" || proposal
        ? "post"
        : meeting.status === "LIVE"
          ? "live"
          : "prep";

  const needsPrep = meeting.items.some((it) => !it.prepBrief);
  const canRunPrep = phase === "prep" || phase === "live";

  function runPrep() {
    run(async () => {
      const res = await runMeetingPrepAction(meeting.id);
      if (res.error) flash(undefined, res.error);
      else {
        flash(res.message ?? "开会准备已完成");
        setMeeting((m) => ({
          ...m,
          status: m.status === "DRAFT" ? "PREP" : m.status,
        }));
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {canRunPrep && (
          <button
            type="button"
            disabled={pending}
            onClick={runPrep}
            className="rounded-lg bg-sky-700 text-white px-3 py-1.5 text-sm hover:bg-sky-800 disabled:opacity-40"
          >
            {needsPrep ? "开会准备（拉取近 2 周进展）" : "刷新会前简报"}
          </button>
        )}
        {phase === "prep" && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const res = await startPartnerReviewMeetingAction(meeting.id);
                  if (res.error) flash(undefined, res.error);
                  else {
                    setMeeting((m) => ({ ...m, status: "LIVE" }));
                    flash("会议已开始，点左侧伙伴可打标");
                    router.refresh();
                  }
                })
              }
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40"
            >
              开始开会
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const res = await startPartnerReviewMeetingAction(meeting.id);
                  if (res.error) {
                    flash(undefined, res.error);
                    return;
                  }
                  setMeeting((m) => ({ ...m, status: "LIVE" }));
                  try {
                    const rec = await startDingTalkA1Recording({ meetingId: meeting.id });
                    await markDingTalkRecordingStartedAction(meeting.id, { fid: rec.fid });
                    flash("已开始开会，并已启动钉钉 A1 录音");
                  } catch (e) {
                    const tip = e instanceof Error ? e.message : String(e);
                    flash(
                      isDingTalkClient()
                        ? `会议已开始，但自动录音失败：${tip}`
                        : `会议已开始。${tip}；也可手动按 A1 开录，结束后回调会自动关联。`,
                    );
                  }
                  router.refresh();
                })
              }
              className="rounded-lg bg-rose-700 text-white px-3 py-1.5 text-sm hover:bg-rose-800 disabled:opacity-40"
            >
              录音并开始开会
            </button>
          </>
        )}
        {phase === "live" && (
          <>
            {currentDiscussItem ? (
              <span className="rounded-lg bg-sky-50 text-sky-800 border border-sky-100 px-3 py-1.5 text-xs font-medium">
                当前过：{currentDiscussItem.partnerName}
              </span>
            ) : (
              <span className="rounded-lg bg-amber-50 text-amber-800 border border-amber-100 px-3 py-1.5 text-xs">
                尚未打标 · 讨论谁就点左侧谁
              </span>
            )}
            {!meeting.dingtalkFileId && !meeting.dingtalkRecordId ? (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    try {
                      const rec = await startDingTalkA1Recording({ meetingId: meeting.id });
                      await markDingTalkRecordingStartedAction(meeting.id, { fid: rec.fid });
                      flash("已启动钉钉 A1 录音");
                      router.refresh();
                    } catch (e) {
                      const tip = e instanceof Error ? e.message : String(e);
                      flash(
                        undefined,
                        isDingTalkClient() ? tip : `请在钉钉客户端内打开本页。${tip}`,
                      );
                    }
                  })
                }
                className="rounded-lg bg-rose-700 text-white px-3 py-1.5 text-sm hover:bg-rose-800 disabled:opacity-40"
              >
                启动 A1 录音
              </button>
            ) : (
              <span className="rounded-lg bg-rose-50 text-rose-700 border border-rose-100 px-3 py-1.5 text-xs">
                A1 录音已关联
              </span>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const res = await endPartnerReviewMeetingAction(meeting.id);
                  if (res.error) flash(undefined, res.error);
                  else {
                    setMeeting((m) => ({ ...m, status: "PROCESSING" }));
                    flash("会议已结束。可拉取钉钉转写或粘贴纪要后 AI 拆分");
                  }
                })
              }
              className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-40"
            >
              结束会议
            </button>
          </>
        )}
      </div>

      {(message || error) && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error || message}
        </div>
      )}

      {phase === "prep" ? (
        <p className="text-xs text-slate-500 leading-relaxed">
          建议：需要简报时先点「开会准备」→「录音并开始开会」（钉钉 A1，需在钉钉内打开）→ 讨论谁点左侧谁打标 →
          结束会议 → 拉取转写（记录本自动生成）→ AI 拆分。钉钉 A1 不支持会中实时转写写入。钉钉配置见{" "}
          <Link href="/settings#integrations" className="text-sky-700 hover:underline">
            团队设置 · 钉钉
          </Link>
          。
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Partner list */}
        <aside className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 text-xs font-medium text-slate-500">
            伙伴议程
            {phase === "live" ? (
              <span className="font-normal text-slate-400"> · 讨论谁点谁</span>
            ) : null}
          </div>
          <ul className="divide-y divide-slate-50 max-h-[70vh] overflow-y-auto">
            {meeting.items.map((item, idx) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveItemId(item.id);
                    // 仅正式开会后点伙伴才打标；准备阶段只切换简报，避免误进 LIVE 导致看不到「开会准备」
                    if (phase === "live") {
                      noteRapidDiscussClick(item.id);
                      run(
                        async () => {
                          const res = await discussPartnerAction(meeting.id, item.id);
                          if (res.error) {
                            flash(undefined, res.error);
                            return;
                          }
                          setCurrentDiscussItemId(item.id);
                          const discussedAt = res.discussedAt ?? new Date().toISOString();
                          setMeeting((m) => ({
                            ...m,
                            items: m.items.map((it) =>
                              it.id === item.id
                                ? {
                                    ...it,
                                    status: it.status === "CONFIRMED" ? it.status : "DISCUSSED",
                                    discussedAt: it.discussedAt ?? discussedAt,
                                    markerInsertedAt: it.markerInsertedAt ?? discussedAt,
                                  }
                                : it,
                            ),
                          }));
                        },
                      );
                    }
                  }}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 ${
                    activeItemId === item.id ? "bg-sky-50/80" : ""
                  } ${currentDiscussItemId === item.id && phase === "live" ? "ring-1 ring-inset ring-sky-200" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-4">{idx + 1}</span>
                    <span className="font-medium text-slate-800 truncate">{item.partnerName}</span>
                    {currentDiscussItemId === item.id && phase === "live" ? (
                      <span className="text-[10px] text-sky-700 shrink-0">当前</span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400 pl-6">
                    {item.status === "CONFIRMED"
                      ? "已确认入库"
                      : item.status === "DISCUSSED"
                        ? "已讨论"
                        : "待讨论"}
                    {item.partnerTier ? ` · Tier ${item.partnerTier}` : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Brief / confirm */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 min-h-[320px]">
          {!activeItem ? (
            <p className="text-sm text-slate-400">选择左侧伙伴</p>
          ) : (
            <>
              <div>
                <h3 className="text-base font-semibold text-slate-900">{activeItem.partnerName}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {phase === "done"
                    ? "已确认摘要（历史回看）"
                    : activeItem.prepBrief?.windowLabel
                      ? `简报窗口 ${activeItem.prepBrief.windowLabel}`
                      : "尚未拉取近 2 周进展，请点上方「开会准备」"}
                </p>
              </div>

              {phase === "done" ? (
                <ConfirmedHistoryPanel item={activeItem} />
              ) : (
                <>
                  {!activeItem.prepBrief && canRunPrep ? (
                    <div className="rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-3 space-y-2">
                      <p className="text-sm text-slate-700">
                        会前简报会汇总该伙伴近 2 周商务记录、时间线、开放待办与活跃商机，并给出讨论议题。
                      </p>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={runPrep}
                        className="rounded-lg bg-sky-700 text-white px-3 py-1.5 text-sm hover:bg-sky-800 disabled:opacity-40"
                      >
                        立即生成会前简报
                      </button>
                    </div>
                  ) : null}
                  {activeItem.prepBrief ? (
                    <PrepBriefView brief={activeItem.prepBrief} />
                  ) : null}

                  {phase === "post" && (
                    <PostConfirmPanel
                      item={activeItem}
                      draft={confirmDrafts[activeItem.id]}
                      onChange={(d) => setConfirmDrafts((prev) => ({ ...prev, [activeItem.id]: d }))}
                      proposalItem={proposal?.items.find((p) => p.itemId === activeItem.id)}
                    />
                  )}
                </>
              )}
            </>
          )}
        </section>

        {/* Notes / transcript */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">
              {phase === "live"
                ? "议程打点"
                : phase === "done"
                  ? "会议记录（只读）"
                  : "会议记录（转写到位后自动生成）"}
            </div>
            {phase === "live" ? (
              <LiveAgendaPanel
                items={meeting.items}
                currentDiscussItemId={currentDiscussItemId}
                recordingStartedAt={meeting.recordingStartedAt}
              />
            ) : (
              <textarea
                value={liveNotes}
                readOnly
                rows={phase === "post" ? 12 : 18}
                placeholder="结束会议并拉取钉钉转写后，将按议程打点自动填入各伙伴讨论内容。"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono leading-relaxed bg-slate-50 text-slate-700"
              />
            )}
          </div>

          {(phase === "post" || meeting.status === "PROCESSING") && phase !== "done" && (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <div className="text-xs font-medium text-slate-500">钉钉听记 · 会议转写</div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                正常流程：A1 录完 → 钉钉推送回调（约 1–5 分钟）→ 下方 ID 与转写自动填入 → 点「拉取转写」。若一直为空，请到
                团队设置 · 钉钉 核对回调地址与事件订阅，或从听记详情复制 ID 手动绑定。
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  placeholder="Record ID"
                  value={dingForm.recordId}
                  onChange={(e) => setDingForm((f) => ({ ...f, recordId: e.target.value }))}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                />
                <input
                  placeholder="Conference ID"
                  value={dingForm.conferenceId}
                  onChange={(e) => setDingForm((f) => ({ ...f, conferenceId: e.target.value }))}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                />
                <input
                  placeholder="钉盘 Space ID"
                  value={dingForm.spaceId}
                  onChange={(e) => setDingForm((f) => ({ ...f, spaceId: e.target.value }))}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                />
                <input
                  placeholder="钉盘 File ID"
                  value={dingForm.fileId}
                  onChange={(e) => setDingForm((f) => ({ ...f, fileId: e.target.value }))}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      await attachDingTalkRecordingAction(meeting.id, dingForm);
                      flash("已绑定钉钉录音信息");
                    })
                  }
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50"
                >
                  绑定录音
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      await attachDingTalkRecordingAction(meeting.id, dingForm);
                      const res = await pullDingTalkTranscriptAction(meeting.id);
                      if (res.error) flash(undefined, res.error);
                      else {
                        flash(res.message);
                        router.refresh();
                      }
                    })
                  }
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50"
                >
                  拉取转写
                </button>
              </div>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={8}
                placeholder="粘贴钉钉 Markdown 转写，或等待回调自动填入"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      await saveTranscriptTextAction(meeting.id, transcript);
                      flash("转写已保存");
                    })
                  }
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50"
                >
                  保存转写
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      await saveTranscriptTextAction(meeting.id, transcript);
                      const res = await runMeetingSplitAction(meeting.id);
                      if (res.error) {
                        flash(undefined, res.error);
                        return;
                      }
                      if (res.proposal) {
                        setProposal(res.proposal);
                        const drafts: typeof confirmDrafts = {};
                        for (const row of res.proposal.items) {
                          drafts[row.itemId] = {
                            coreNotes: row.coreNotes,
                            businessRecordTitle: row.businessRecordTitle,
                            businessRecordContent: row.businessRecordContent,
                            skipBusinessRecord: !row.segmentText.trim(),
                            todos: row.todos.map((t) => ({
                              id: undefined,
                              title: t.title,
                              detail: t.detail ?? "",
                              dueDate: t.dueDate ?? "",
                              include: true,
                            })),
                          };
                        }
                        // merge server drafts if any
                        for (const item of meeting.items) {
                          if (!drafts[item.id] && item.todoDrafts.length) {
                            drafts[item.id] = {
                              coreNotes: item.coreNotes ?? "",
                              businessRecordTitle: `${item.partnerName} 过伙伴讨论`,
                              businessRecordContent: item.coreNotes ?? "",
                              skipBusinessRecord: false,
                              todos: item.todoDrafts.map((t) => ({
                                id: t.id,
                                title: t.title,
                                detail: t.detail ?? "",
                                dueDate: t.dueDate?.slice(0, 10) ?? "",
                                include: !t.confirmed,
                              })),
                            };
                          } else if (drafts[item.id] && item.todoDrafts.length) {
                            drafts[item.id]!.todos = item.todoDrafts.map((t, i) => ({
                              id: t.id,
                              title: drafts[item.id]!.todos[i]?.title || t.title,
                              detail: drafts[item.id]!.todos[i]?.detail || t.detail || "",
                              dueDate: drafts[item.id]!.todos[i]?.dueDate || t.dueDate?.slice(0, 10) || "",
                              include: !t.confirmed,
                            }));
                          }
                        }
                        setConfirmDrafts(drafts);
                        flash("AI 拆分完成，请在左侧逐个确认");
                      }
                    })
                  }
                  className="rounded-lg bg-violet-700 text-white px-3 py-1.5 text-xs hover:bg-violet-800 disabled:opacity-40"
                >
                  AI 拆分讨论
                </button>
                <button
                  type="button"
                  disabled={pending || !Object.keys(confirmDrafts).length}
                  onClick={() =>
                    run(async () => {
                      const items: ConfirmItemPayload[] = Object.entries(confirmDrafts).map(([itemId, d]) => ({
                        itemId,
                        coreNotes: d.coreNotes,
                        businessRecordTitle: d.businessRecordTitle,
                        businessRecordContent: d.businessRecordContent,
                        skipBusinessRecord: d.skipBusinessRecord,
                        todos: d.todos.map((t) => ({
                          id: t.id,
                          title: t.title,
                          detail: t.detail,
                          dueDate: t.dueDate || null,
                          include: t.include,
                        })),
                      }));
                      const res = await confirmMeetingItemsAction(meeting.id, items);
                      if (res.error) flash(undefined, res.error);
                      else {
                        flash(`已确认入库 ${res.results?.length ?? 0} 个伙伴，已记入历史`);
                        setMeeting((m) => ({
                          ...m,
                          status: "DONE",
                          items: m.items.map((it) => {
                            const d = confirmDrafts[it.id];
                            if (!d) return { ...it, status: "CONFIRMED" };
                            const todos = d.todos
                              .filter((t) => t.include && t.title.trim())
                              .map((t) => ({
                                title: t.title.trim(),
                                detail: t.detail?.trim() || null,
                                dueDate: t.dueDate || null,
                                todoItemId: null,
                              }));
                            return {
                              ...it,
                              status: "CONFIRMED",
                              coreNotes: d.coreNotes,
                              confirmedSnapshot: {
                                confirmedAt: new Date().toISOString(),
                                coreNotes: d.coreNotes,
                                businessRecordTitle: d.businessRecordTitle,
                                businessRecordContent: d.businessRecordContent,
                                skipBusinessRecord: d.skipBusinessRecord,
                                wroteBusinessRecord: !d.skipBusinessRecord && !!d.businessRecordTitle.trim(),
                                todos,
                              },
                            };
                          }),
                        }));
                      }
                    })
                  }
                  className="rounded-lg bg-emerald-700 text-white px-3 py-1.5 text-xs hover:bg-emerald-800 disabled:opacity-40"
                >
                  确认写入商务记录与待办
                </button>
              </div>
              {proposal?.unassignedText ? (
                <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-900 whitespace-pre-wrap">
                  <div className="font-medium mb-1">未归属片段（请检查会中是否按讨论顺序打标后重新拆分）</div>
                  {proposal.unassignedText.slice(0, 2000)}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function formatAgendaMarkerTime(
  markerInsertedAt: string | null,
  recordingStartedAt: string | null,
): string {
  if (!markerInsertedAt) return "—";
  const at = Date.parse(markerInsertedAt);
  if (Number.isNaN(at)) return "—";
  if (recordingStartedAt) {
    const anchor = Date.parse(recordingStartedAt);
    if (!Number.isNaN(anchor)) {
      const relSec = Math.max(0, Math.round((at - anchor) / 1000));
      const m = Math.floor(relSec / 60);
      const s = relSec % 60;
      return `录音 +${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
  }
  return new Date(at).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function LiveAgendaPanel({
  items,
  currentDiscussItemId,
  recordingStartedAt,
}: {
  items: ReviewItemClient[];
  currentDiscussItemId: string | null;
  recordingStartedAt: string | null;
}) {
  const marked = items
    .filter((it) => it.markerInsertedAt || it.discussedAt)
    .sort((a, b) => {
      const ta = Date.parse(a.markerInsertedAt || a.discussedAt || "") || 0;
      const tb = Date.parse(b.markerInsertedAt || b.discussedAt || "") || 0;
      return ta - tb;
    });

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-3 space-y-3 min-h-[280px]">
      <p className="text-xs text-slate-600 leading-relaxed">
        讨论谁就点左侧伙伴，系统记录<strong>相对 A1 开录</strong>的时间点，用于会后把钉钉转写切到各伙伴。
        无需手写；钉钉 A1 暂不支持会中实时转写写入此处。
      </p>
      {!recordingStartedAt ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2">
          尚未记录 A1 开录时间。请先点「启动 A1 录音」或「录音并开始开会」，否则只能按讨论顺序做 AI 拆分。
        </p>
      ) : null}
      {marked.length ? (
        <ol className="space-y-2">
          {marked.map((it, idx) => (
            <li
              key={it.id}
              className={`rounded-lg border px-3 py-2 text-sm ${
                it.id === currentDiscussItemId
                  ? "border-sky-200 bg-sky-50/80"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800">
                  {idx + 1}. {it.partnerName}
                </span>
                <span className="text-[11px] text-slate-500 font-mono shrink-0">
                  {formatAgendaMarkerTime(it.markerInsertedAt ?? it.discussedAt, recordingStartedAt)}
                </span>
              </div>
              {it.id === currentDiscussItemId ? (
                <p className="text-[11px] text-sky-700 mt-0.5">当前正在过</p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-slate-400">尚未打点 · 点左侧伙伴开始</p>
      )}
    </div>
  );
}

const CATEGORY_LABEL: Record<string, string> = {
  VISIT: "拜访",
  TRAINING: "培训",
  NEGOTIATION: "谈判",
  DELIVERY: "交付",
  RELATIONSHIP: "关系",
  OTHER: "进展",
};

function tidyClientText(text: string) {
  let flat = text.replace(/\s+/g, " ").trim();
  for (let len = 8; len <= 40; len++) {
    flat = flat.replace(new RegExp(`(.{${len}})(\\1)+`, "g"), "$1");
  }
  return flat.replace(/【联系人\s*[^】]+】\s*/g, "").trim();
}

function PrepBriefView({ brief }: { brief: PartnerPrepBrief }) {
  const baseTodos =
    brief.todos?.length
      ? brief.todos
      : (brief.openTodos ?? []).map((t) => ({ ...t, done: false }));
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(baseTodos.map((t) => [t.id, t.done])),
  );

  useEffect(() => {
    setDoneMap(Object.fromEntries(baseTodos.map((t) => [t.id, t.done])));
    // 简报刷新或切换伙伴时重置本地勾选状态
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随简报内容指纹变化
  }, [brief.partnerId, brief.windowLabel, baseTodos.map((t) => `${t.id}:${t.done}`).join("|")]);

  const todos = baseTodos.map((t) => ({
    ...t,
    done: doneMap[t.id] ?? t.done,
  }));
  const openCount = todos.filter((t) => !t.done).length;
  const doneCount = todos.filter((t) => t.done).length;

  return (
    <div className="space-y-4 text-sm">
      {brief.summaryLine ? (
        <p className="text-slate-700 leading-relaxed">{brief.summaryLine}</p>
      ) : null}

      <div>
        <div className="text-xs font-medium text-slate-500 mb-1.5">AI 推荐议题</div>
        <ul className="list-disc pl-5 space-y-1 text-slate-700">
          {brief.aiTopics.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="text-xs font-medium text-slate-500">
            待办摘录
            {todos.length ? (
              <span className="font-normal text-slate-400">
                {" "}
                · 待完成 {openCount}
                {doneCount ? ` · 已完成 ${doneCount}` : ""}
              </span>
            ) : null}
          </div>
          <Link
            href={`/partners/${brief.partnerId}`}
            className="text-[11px] text-sky-700 hover:underline shrink-0"
          >
            在伙伴页处理
          </Link>
        </div>
        {todos.length ? (
          <ul className="space-y-2">
            {todos.slice(0, 12).map((t) => (
              <li key={t.id} className="flex items-start gap-2.5 text-sm">
                <TodoCompleteButton
                  todoId={t.id}
                  title={t.title}
                  status={t.done ? "DONE" : "OPEN"}
                  partnerId={brief.partnerId}
                  size="sm"
                  onStatusChange={(next) =>
                    setDoneMap((prev) => ({ ...prev, [t.id]: next === "DONE" }))
                  }
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/partners/${brief.partnerId}`}
                    className={
                      t.done
                        ? "text-slate-400 line-through decoration-slate-400 hover:text-slate-500"
                        : "text-slate-800 hover:text-sky-700"
                    }
                  >
                    {t.title}
                  </Link>
                  {!t.done && t.overdue ? (
                    <span className="ml-1.5 text-[11px] text-red-600">逾期</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">暂无相关待办</p>
        )}
      </div>

      <div>
        <div className="text-xs font-medium text-slate-500 mb-1.5">近两周进展</div>
        {brief.progress.length ? (
          <ul className="space-y-2.5">
            {brief.progress.slice(0, 8).map((p, i) => {
              const label = p.categoryLabel || CATEGORY_LABEL[p.category] || "进展";
              const body = tidyClientText(p.contentPreview || "");
              const dateLabel = p.occurredAt
                ? new Date(p.occurredAt).toLocaleDateString("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                  })
                : "";
              return (
                <li
                  key={`${p.title}-${i}`}
                  className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5 space-y-1"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium bg-white text-slate-600 border border-slate-200">
                      {label}
                    </span>
                    {dateLabel ? <span className="text-[11px] text-slate-400">{dateLabel}</span> : null}
                    {p.contactName ? (
                      <span className="text-[11px] text-sky-700">联系人 {p.contactName}</span>
                    ) : null}
                  </div>
                  <div className="text-sm font-medium text-slate-900 leading-snug">{p.title}</div>
                  {body && body !== p.title ? (
                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{body}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">近两周无商务记录</p>
        )}
      </div>
    </div>
  );
}

function ConfirmedHistoryPanel({ item }: { item: ReviewItemClient }) {
  const snap =
    item.confirmedSnapshot ??
    ({
      confirmedAt: "",
      coreNotes: item.coreNotes ?? "",
      businessRecordTitle: "",
      businessRecordContent: "",
      skipBusinessRecord: true,
      wroteBusinessRecord: false,
      todos: item.todoDrafts
        .filter((t) => t.confirmed)
        .map((t) => ({
          title: t.title,
          detail: t.detail,
          dueDate: t.dueDate?.slice(0, 10) ?? null,
          todoItemId: null,
        })),
    } satisfies ConfirmedItemSnapshot);

  return (
    <div className="space-y-4 text-sm border-t border-slate-100 pt-3">
      <div>
        <div className="text-xs font-medium text-slate-500 mb-1">核心讨论</div>
        <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">
          {snap.coreNotes.trim() || "（无）"}
        </p>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-500 mb-1">商务记录</div>
        {snap.skipBusinessRecord || !snap.wroteBusinessRecord ? (
          <p className="text-xs text-slate-400">确认时未写入商务记录</p>
        ) : (
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 space-y-1">
            <div className="font-medium text-slate-900">{snap.businessRecordTitle || "（无标题）"}</div>
            {snap.businessRecordContent ? (
              <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                {snap.businessRecordContent}
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div>
        <div className="text-xs font-medium text-slate-500 mb-1">已入库待办</div>
        {snap.todos.length ? (
          <ul className="space-y-2">
            {snap.todos.map((t, i) => (
              <li key={`${t.title}-${i}`} className="rounded-lg border border-slate-100 px-3 py-2">
                <div className="font-medium text-slate-800">{t.title}</div>
                {t.detail ? <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">{t.detail}</p> : null}
                {t.dueDate ? <p className="text-[11px] text-slate-400 mt-1">截止日期 {t.dueDate.slice(0, 10)}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">无待办</p>
        )}
      </div>

      {snap.confirmedAt ? (
        <p className="text-[11px] text-slate-400">
          确认于 {new Date(snap.confirmedAt).toLocaleString("zh-CN", { hour12: false })}
        </p>
      ) : null}
    </div>
  );
}

function PostConfirmPanel({
  item,
  draft,
  onChange,
  proposalItem,
}: {
  item: ReviewItemClient;
  draft?: {
    coreNotes: string;
    businessRecordTitle: string;
    businessRecordContent: string;
    skipBusinessRecord: boolean;
    todos: { id?: string; title: string; detail: string; dueDate: string; include: boolean }[];
  };
  onChange: (d: NonNullable<typeof draft>) => void;
  proposalItem?: SplitProposal["items"][number];
}) {
  const d =
    draft ??
    ({
      coreNotes: proposalItem?.coreNotes || item.coreNotes || "",
      businessRecordTitle: proposalItem?.businessRecordTitle || `${item.partnerName} 过伙伴讨论`,
      businessRecordContent: proposalItem?.businessRecordContent || item.coreNotes || "",
      skipBusinessRecord: false,
      todos:
        proposalItem?.todos.map((t) => ({
          title: t.title,
          detail: t.detail ?? "",
          dueDate: t.dueDate ?? "",
          include: true,
        })) ||
        item.todoDrafts.map((t) => ({
          id: t.id,
          title: t.title,
          detail: t.detail ?? "",
          dueDate: t.dueDate?.slice(0, 10) ?? "",
          include: !t.confirmed,
        })),
    } as NonNullable<typeof draft>);

  function ensure() {
    if (!draft) onChange(d);
  }

  const segmentText = proposalItem?.segmentText?.trim() ?? "";
  const segmentPreview = segmentText.slice(0, 480);
  const segmentChars = segmentText.length;

  return (
    <div className="border-t border-slate-100 pt-3 space-y-2" onFocus={ensure}>
      <div className="text-xs font-medium text-slate-500">会后确认稿</div>
      {proposalItem ? (
        <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 space-y-1">
          <div className="text-[11px] font-medium text-violet-900">
            本段转写摘录
            <span className="font-normal text-violet-700/80"> · {segmentChars} 字</span>
          </div>
          {segmentChars ? (
            <p className="text-xs text-violet-950/80 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
              {segmentPreview}
              {segmentChars > segmentPreview.length ? "…" : ""}
            </p>
          ) : (
            <p className="text-xs text-amber-800">
              本段暂无归属内容。若转写落在「未归属」或别的伙伴，请检查会中是否按讨论顺序打标后重新拆分。
            </p>
          )}
        </div>
      ) : null}
      <label className="block space-y-1">
        <span className="text-[11px] text-slate-400">核心讨论</span>
        <textarea
          value={d.coreNotes}
          onChange={(e) => onChange({ ...d, coreNotes: e.target.value })}
          rows={3}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={!d.skipBusinessRecord}
          onChange={(e) => onChange({ ...d, skipBusinessRecord: !e.target.checked })}
        />
        写入商务记录
      </label>
      {!d.skipBusinessRecord && (
        <>
          <input
            value={d.businessRecordTitle}
            onChange={(e) => onChange({ ...d, businessRecordTitle: e.target.value })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            placeholder="商务记录标题"
          />
          <textarea
            value={d.businessRecordContent}
            onChange={(e) => onChange({ ...d, businessRecordContent: e.target.value })}
            rows={4}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            placeholder="商务记录正文"
          />
        </>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">待办（可改/删/加）</span>
          <button
            type="button"
            className="text-[11px] text-sky-700"
            onClick={() =>
              onChange({
                ...d,
                todos: [...d.todos, { title: "", detail: "", dueDate: "", include: true }],
              })
            }
          >
            + 添加待办
          </button>
        </div>
        {d.todos.map((t, idx) => (
          <div key={t.id ?? idx} className="rounded-lg border border-slate-100 p-2 space-y-1">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={t.include}
                onChange={(e) => {
                  const todos = [...d.todos];
                  todos[idx] = { ...t, include: e.target.checked };
                  onChange({ ...d, todos });
                }}
              />
              纳入
            </label>
            <input
              value={t.title}
              onChange={(e) => {
                const todos = [...d.todos];
                todos[idx] = { ...t, title: e.target.value };
                onChange({ ...d, todos });
              }}
              placeholder="待办标题"
              className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
            <input
              value={t.detail}
              onChange={(e) => {
                const todos = [...d.todos];
                todos[idx] = { ...t, detail: e.target.value };
                onChange({ ...d, todos });
              }}
              placeholder="详情（可选）"
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
            />
            <input
              type="date"
              value={t.dueDate}
              onChange={(e) => {
                const todos = [...d.todos];
                todos[idx] = { ...t, dueDate: e.target.value };
                onChange({ ...d, todos });
              }}
              className="rounded border border-slate-200 px-2 py-1 text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
