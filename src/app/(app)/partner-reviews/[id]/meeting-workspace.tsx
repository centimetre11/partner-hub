"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  saveLiveNotesAction,
  saveTranscriptTextAction,
  startPartnerReviewMeetingAction,
  attachDingTalkRecordingAction,
  confirmMeetingItemsAction,
  markDingTalkRecordingStartedAction,
} from "@/lib/partner-review/actions";
import type { SplitProposal } from "@/lib/partner-review/split-types";
import type { MeetingClient, ReviewItemClient } from "@/lib/partner-review/meeting-client";
import { isDingTalkClient, startDingTalkA1Recording } from "@/lib/dingtalk/client-record";

export type { MeetingClient, ReviewItemClient };

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

  const activeItem = useMemo(
    () => meeting.items.find((i) => i.id === activeItemId) ?? null,
    [meeting.items, activeItemId],
  );

  function flash(ok?: string, err?: string) {
    setMessage(ok ?? null);
    setError(err ?? null);
  }

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
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
                  if (needsPrep) {
                    const prep = await runMeetingPrepAction(meeting.id);
                    if (prep.error) {
                      flash(undefined, prep.error);
                      return;
                    }
                  }
                  const res = await startPartnerReviewMeetingAction(meeting.id);
                  if (res.error) flash(undefined, res.error);
                  else {
                    setMeeting((m) => ({ ...m, status: "LIVE" }));
                    flash(needsPrep ? "已生成简报并开始开会" : "会议已开始，点左侧伙伴可打标");
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
                  if (needsPrep) {
                    const prep = await runMeetingPrepAction(meeting.id);
                    if (prep.error) {
                      flash(undefined, prep.error);
                      return;
                    }
                  }
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
                      flash(undefined, e instanceof Error ? e.message : String(e));
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
                  await saveLiveNotesAction(meeting.id, liveNotes);
                  const res = await endPartnerReviewMeetingAction(meeting.id);
                  if (res.error) flash(undefined, res.error);
                  else {
                    setMeeting((m) => ({ ...m, status: "PROCESSING", liveNotes }));
                    flash("会议已结束，可拉取转写或粘贴纪要后拆分");
                  }
                })
              }
              className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-40"
            >
              结束会议
            </button>
          </>
        )}
        {(phase === "post" || phase === "live") && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                await saveLiveNotesAction(meeting.id, liveNotes);
                flash("记录本已保存");
              })
            }
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40"
          >
            保存记录本
          </button>
        )}
      </div>

      {(message || error) && (
        <p className={`text-xs ${error ? "text-red-600" : "text-emerald-700"}`}>{error || message}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Partner list */}
        <aside className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 text-xs font-medium text-slate-500">伙伴议程</div>
          <ul className="divide-y divide-slate-50 max-h-[70vh] overflow-y-auto">
            {meeting.items.map((item, idx) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveItemId(item.id);
                    // 仅正式开会后点伙伴才打标；准备阶段只切换简报，避免误进 LIVE 导致看不到「开会准备」
                    if (phase === "live") {
                      run(async () => {
                        const res = await discussPartnerAction(meeting.id, item.id);
                        if (res.error) {
                          flash(undefined, res.error);
                          return;
                        }
                        if (res.liveNotes) setLiveNotes(res.liveNotes);
                        setMeeting((m) => ({
                          ...m,
                          liveNotes: res.liveNotes ?? m.liveNotes,
                          items: m.items.map((it) =>
                            it.id === item.id ? { ...it, status: it.status === "CONFIRMED" ? it.status : "DISCUSSED" } : it,
                          ),
                        }));
                      });
                    }
                  }}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 ${
                    activeItemId === item.id ? "bg-sky-50/80" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-4">{idx + 1}</span>
                    <span className="font-medium text-slate-800 truncate">{item.partnerName}</span>
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
              {phase === "done" ? "会中记录本（只读）" : "会中记录本（含伙伴标记）"}
            </div>
            <textarea
              value={liveNotes}
              onChange={(e) => setLiveNotes(e.target.value)}
              readOnly={phase === "done"}
              rows={12}
              placeholder="点左侧伙伴会自动插入 <<<PARTNER:id|name>>> 标记；也可在此手写纪要。"
              className={`w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono leading-relaxed ${
                phase === "done" ? "bg-slate-50 text-slate-700" : ""
              }`}
            />
          </div>

          {phase === "done" && (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <div className="text-xs font-medium text-slate-500">钉钉转写（只读）</div>
              <pre className="w-full max-h-[40vh] overflow-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono whitespace-pre-wrap text-slate-700">
                {transcript.trim() || "（无转写）"}
              </pre>
            </div>
          )}

          {(phase === "post" || meeting.status === "PROCESSING") && phase !== "done" && (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <div className="text-xs font-medium text-slate-500">钉钉转写</div>
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
                      await saveLiveNotesAction(meeting.id, liveNotes);
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
                  <div className="font-medium mb-1">未归属片段（可手工补进记录本标记后重新拆分）</div>
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
  const todos =
    brief.todos?.length
      ? brief.todos
      : (brief.openTodos ?? []).map((t) => ({ ...t, done: false }));
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
        <div className="text-xs font-medium text-slate-500 mb-1.5">
          待办摘录
          {todos.length ? (
            <span className="font-normal text-slate-400">
              {" "}
              · 待完成 {openCount}
              {doneCount ? ` · 已完成 ${doneCount}` : ""}
            </span>
          ) : null}
        </div>
        {todos.length ? (
          <ul className="space-y-1.5">
            {todos.slice(0, 12).map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={t.done}
                  readOnly
                  tabIndex={-1}
                  className="mt-0.5 rounded border-slate-300 text-emerald-600 pointer-events-none"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <span
                    className={
                      t.done
                        ? "text-slate-400 line-through decoration-slate-400"
                        : "text-slate-800"
                    }
                  >
                    {t.title}
                  </span>
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

  return (
    <div className="border-t border-slate-100 pt-3 space-y-2" onFocus={ensure}>
      <div className="text-xs font-medium text-slate-500">会后确认稿</div>
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
