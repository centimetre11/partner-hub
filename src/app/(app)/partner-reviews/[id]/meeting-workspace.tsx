"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  ConfirmItemPayload,
  ConfirmedItemSnapshot,
  PartnerPrepBrief,
} from "@/lib/partner-review/types";
import {
  addPartnersToMeetingAction,
  endPartnerReviewMeetingAction,
  resetMeetingToPrepAction,
  getMeetingPreviewPathAction,
  matchMeetingMinutesAction,
  extractMeetingOutcomesAction,
  saveMatchedNotesAction,
  runMeetingPrepAction,
  startPartnerReviewMeetingAction,
  confirmMeetingItemsAction,
} from "@/lib/partner-review/actions";
import type { SplitProposal } from "@/lib/partner-review/split-types";
import type { MeetingClient, ReviewItemClient } from "@/lib/partner-review/meeting-client";
import {
  buildLiveNotesFromSegments,
  parsePartnerSectionsFromLiveNotes,
  type TranscriptSegment,
} from "@/lib/partner-review/markers";
import {
  buildFinalReportMarkdown,
  reportRowFromBriefAndDraft,
  reportRowFromConfirmed,
} from "@/lib/partner-review/final-report";
import { TodoCompleteButton } from "@/components/todo-complete-dialog";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";

export type { MeetingClient, ReviewItemClient };

const RAPID_CLICK_WINDOW_MS = 12_000;
const RAPID_CLICK_WARN_COUNT = 3;

/** 会后子阶段：粘贴 → 确认归属 → 提炼确认 */
type PostStep = "paste" | "assign" | "extract";
type WorkStage = "idle" | "saving" | "matching" | "extracting" | "done";

function matchMethodFlash(method?: string): string {
  switch (method) {
    case "summary_sections":
      return "已按「小结」整段对齐讨论顺序 · 请核对切点后提炼";
    case "sequential":
      return "已按讨论顺序整段切分 · 请用「并入上/下一段」微调切点后提炼";
    case "ai":
      return "已按讨论顺序整段切分 · 请核对切点后提炼";
    case "name":
      return "名称匹配可能打散段落 · 请按顺序整段核对切点后再提炼";
    case "timeline":
    case "timeline_fallback":
      return "时间戳仅弱参考 · 请按顺序整段核对切点后再提炼";
    case "ai_fallback":
      return "已初步整段切分 · 请核对切点后提炼";
    default:
      return "已按顺序整段匹配 · 请在时间线核对切点后再提炼";
  }
}

function workStageLabel(stage: WorkStage): string {
  switch (stage) {
    case "saving":
      return "正在保存纪要…";
    case "matching":
      return "正在匹配归属到各伙伴…";
    case "extracting":
      return "正在提炼近两周进展与后续待办…";
    case "done":
      return "完成";
    default:
      return "";
  }
}

function applySegmentsToDrafts(
  segments: TranscriptSegment[],
  setMatchDrafts: (v: Record<string, string>) => void,
  setUnassignedDraft: (v: string) => void,
) {
  const drafts: Record<string, string> = {};
  let unassigned = "";
  for (const seg of segments) {
    if (seg.partnerId) {
      drafts[seg.partnerId] = seg.text;
    } else if (seg.text.trim()) {
      unassigned = unassigned ? `${unassigned}\n\n${seg.text}` : seg.text;
    }
  }
  setMatchDrafts(drafts);
  setUnassignedDraft(unassigned);
}

function segmentsFromDrafts(
  items: ReviewItemClient[],
  matchDrafts: Record<string, string>,
  unassignedDraft: string,
): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  if (unassignedDraft.trim()) {
    segments.push({ partnerId: null, partnerName: null, text: unassignedDraft.trim() });
  }
  for (const it of items) {
    segments.push({
      partnerId: it.partnerId,
      partnerName: it.partnerName,
      text: matchDrafts[it.partnerId] ?? "",
    });
  }
  return segments;
}

/** 按发言人抬头 / 时间戳行切成可挪动的小段 */
function splitTranscriptTurns(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const speakerRe = /^(?:发言人|Speaker)\s*\d+\s+\d{1,2}:\d{2}:\d{2}\b/i;
  const bracketRe = /^\[(?:\d{1,2}:)?\d{1,2}:\d{2}/;
  const wallClockRe = /^\d{1,2}:\d{2}(?::\d{2})?\s+\S/;
  const isTurnStart = (line: string) => {
    const t = line.trim();
    return speakerRe.test(t) || bracketRe.test(t) || wallClockRe.test(t);
  };
  const turns: string[] = [];
  let buf: string[] = [];
  for (const line of normalized.split("\n")) {
    if (isTurnStart(line) && buf.some((l) => l.trim())) {
      turns.push(buf.join("\n").trimEnd());
      buf = [line];
    } else {
      buf.push(line);
    }
  }
  if (buf.length) {
    const t = buf.join("\n").trim();
    if (t) turns.push(t);
  }
  if (turns.length <= 1) {
    const paras = normalized.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    if (paras.length > 1) return paras;
  }
  return turns;
}

function joinTranscriptTurns(turns: string[]): string {
  return turns.map((t) => t.trim()).filter(Boolean).join("\n\n");
}

/** 讨论顺序：已打点按时间，其余按议程顺序接在后面 */
function discussOrderItems(items: ReviewItemClient[]): ReviewItemClient[] {
  const marked = [...items]
    .filter((it) => it.markerInsertedAt || it.discussedAt)
    .sort((a, b) => {
      const ta = Date.parse(a.markerInsertedAt || a.discussedAt || "") || 0;
      const tb = Date.parse(b.markerInsertedAt || b.discussedAt || "") || 0;
      return ta - tb;
    });
  const markedIds = new Set(marked.map((it) => it.id));
  const rest = items.filter((it) => !markedIds.has(it.id));
  return [...marked, ...rest];
}

type ConfirmDraft = {
  coreNotes: string;
  businessRecordTitle: string;
  businessRecordContent: string;
  skipBusinessRecord: boolean;
  todos: { id?: string; title: string; detail: string; dueDate: string; include: boolean }[];
};

function draftsFromProposal(proposal: SplitProposal): Record<string, ConfirmDraft> {
  const drafts: Record<string, ConfirmDraft> = {};
  for (const row of proposal.items) {
    drafts[row.itemId] = {
      coreNotes: row.coreNotes,
      businessRecordTitle: row.businessRecordTitle,
      businessRecordContent: row.businessRecordContent,
      skipBusinessRecord: !row.segmentText.trim(),
      todos: row.todos.map((t) => ({
        title: t.title,
        detail: t.detail ?? "",
        dueDate: t.dueDate ?? "",
        include: true,
      })),
    };
  }
  return drafts;
}

function draftsFromItems(items: ReviewItemClient[]): Record<string, ConfirmDraft> {
  const drafts: Record<string, ConfirmDraft> = {};
  for (const item of items) {
    if (!item.coreNotes && !item.todoDrafts.length) continue;
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
  }
  return drafts;
}

export function MeetingWorkspace({
  meeting: initial,
  allPartners,
}: {
  meeting: MeetingClient;
  allPartners: { id: string; name: string; tier: string | null }[];
}) {
  const router = useRouter();
  const [meeting, setMeeting] = useState(initial);
  const [activeItemId, setActiveItemId] = useState<string | null>(initial.items[0]?.id ?? null);
  const [liveNotes, setLiveNotes] = useState(initial.liveNotes ?? "");
  const [transcript, setTranscript] = useState(initial.transcriptText ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  const [confirmDrafts, setConfirmDrafts] = useState<Record<string, ConfirmDraft>>({});
  const [markJustAt, setMarkJustAt] = useState(0);
  const [matchDrafts, setMatchDrafts] = useState<Record<string, string>>({});
  const [unassignedDraft, setUnassignedDraft] = useState("");
  const [postStep, setPostStep] = useState<PostStep>(() => {
    if (initial.status === "DONE") return "extract";
    if (initial.items.some((it) => it.coreNotes || it.todoDrafts.length)) return "extract";
    if (initial.liveNotes?.trim() || initial.transcriptText?.trim()) return "assign";
    return "paste";
  });
  const [workStage, setWorkStage] = useState<WorkStage>("idle");
  /** 用户主动停留在归属确认时，禁止 refresh 用旧 coreNotes 把步骤打回 extract */
  const lockAssignStep = useRef(false);

  useEffect(() => {
    setMeeting(initial);
    setLiveNotes(initial.liveNotes ?? "");
    setTranscript(initial.transcriptText ?? "");
    if (initial.status === "DONE") {
      setPostStep("extract");
      lockAssignStep.current = false;
      return;
    }
    if (lockAssignStep.current) return;
    if (initial.items.some((it) => it.coreNotes || it.todoDrafts.length)) {
      setPostStep("extract");
    } else if (initial.liveNotes?.trim() || initial.transcriptText?.trim()) {
      setPostStep((s) => (s === "extract" ? s : "assign"));
    }
  }, [initial]);

  useEffect(() => {
    if (!initial.liveNotes?.trim()) return;
    if (postStep === "extract" && Object.keys(matchDrafts).length) return;
    const segments = parsePartnerSectionsFromLiveNotes(initial.liveNotes, initial.items);
    applySegmentsToDrafts(segments, setMatchDrafts, setUnassignedDraft);
    // 仅在 liveNotes / items 变化时同步；避免覆盖用户正在编辑的归属
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.liveNotes, initial.items]);

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

  function markPartnerDiscuss(itemId: string, partnerName: string) {
    if (phase !== "live") return;

    noteRapidDiscussClick(itemId);
    const nowIso = new Date().toISOString();
    const anchor = meeting.startedAt;
    setActiveItemId(itemId);
    setCurrentDiscussItemId(itemId);
    setMarkJustAt(Date.now());
    setMeeting((m) => ({
      ...m,
      items: m.items.map((it) => {
        if (it.id !== itemId) return it;
        const prevMarker = it.markerInsertedAt ? Date.parse(it.markerInsertedAt) : NaN;
        const anchorMs = anchor ? Date.parse(anchor) : NaN;
        const keepMarker =
          Number.isFinite(prevMarker) &&
          Number.isFinite(anchorMs) &&
          prevMarker >= anchorMs;
        return {
          ...it,
          status: it.status === "CONFIRMED" ? it.status : "DISCUSSED",
          discussedAt: it.discussedAt ?? nowIso,
          markerInsertedAt: keepMarker ? it.markerInsertedAt : nowIso,
        };
      }),
    }));

    const relLabel = formatRelativeMeetingTime(nowIso, anchor);
    flash(`✓ 已开始过 ${partnerName}${relLabel ? ` · ${relLabel}` : ""}`);

    void (async () => {
      try {
        const res = await fetch(`/api/partner-reviews/${meeting.id}/discuss-partner`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          markerInsertedAt?: string;
          discussedAt?: string;
          partnerName?: string;
          relativeMs?: number | null;
        };
        if (!res.ok || data.error) {
          flash(undefined, data.error || `伙伴打点失败 HTTP ${res.status}`);
          return;
        }
        if (data.markerInsertedAt || data.discussedAt) {
          setMeeting((m) => ({
            ...m,
            items: m.items.map((it) =>
              it.id === itemId
                ? {
                    ...it,
                    markerInsertedAt: data.markerInsertedAt ?? it.markerInsertedAt,
                    discussedAt: data.discussedAt ?? it.discussedAt,
                  }
                : it,
            ),
          }));
        }
      } catch (e) {
        flash(undefined, e instanceof Error ? e.message : String(e));
      }
    })();
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
    void (async () => {
      setBusy(true);
      try {
        await fn();
        if (shouldRefresh) router.refresh();
      } catch (e) {
        flash(undefined, e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    })();
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
  const postConfirmReady =
    phase === "post" && postStep === "extract" && Object.keys(confirmDrafts).length > 0;
  const orderedForTimeline = useMemo(() => discussOrderItems(meeting.items), [meeting.items]);

  useEffect(() => {
    if (phase !== "post" || postStep !== "extract" || Object.keys(confirmDrafts).length) return;
    const hydrated = draftsFromItems(meeting.items);
    if (Object.keys(hydrated).length) setConfirmDrafts(hydrated);
  }, [phase, postStep, meeting.items, confirmDrafts]);

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
            disabled={busy}
            onClick={runPrep}
            className="rounded-lg bg-sky-700 text-white px-3 py-1.5 text-sm hover:bg-sky-800 disabled:opacity-40"
          >
            {needsPrep ? "开会准备（拉取近 2 周进展）" : "刷新会前简报"}
          </button>
        )}
        {phase === "prep" && (
          <>
            <MeetingPreviewActions meetingId={meeting.id} previewToken={meeting.previewToken} />
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const res = await startPartnerReviewMeetingAction(meeting.id);
                  if (res.error) flash(undefined, res.error);
                  else {
                    setMeeting((m) => ({ ...m, status: "LIVE", startedAt: new Date().toISOString() }));
                    flash("会议已开始 · 讨论谁点左侧谁，会后在右侧粘贴腾讯会议总结");
                  }
                }, { refresh: false })
              }
              className="rounded-lg bg-rose-700 text-white px-3 py-1.5 text-sm hover:bg-rose-800 disabled:opacity-40"
            >
              开始开会
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
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const res = await endPartnerReviewMeetingAction(meeting.id);
                  if (res.error) flash(undefined, res.error);
                  else {
                    setMeeting((m) => ({ ...m, status: "PROCESSING", endedAt: new Date().toISOString() }));
                    flash("会议已结束 · 请粘贴腾讯会议智能纪要并解析拆分");
                  }
                }, { refresh: false })
              }
              className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-40"
            >
              结束会议
            </button>
          </>
        )}
        {phase === "post" && meeting.status === "PROCESSING" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                !window.confirm(
                  "确定回到会前？将清空本次打点时间、粘贴的纪要、解析结果与待确认草案；议程与会前简报会保留。",
                )
              ) {
                return;
              }
              run(async () => {
                const res = await resetMeetingToPrepAction(meeting.id);
                if (res.error) flash(undefined, res.error);
                else {
                  setMeeting((m) => ({
                    ...m,
                    status: "PREP",
                    startedAt: null,
                    endedAt: null,
                    liveNotes: null,
                    transcriptText: null,
                    items: m.items.map((it) => ({
                      ...it,
                      status: "PENDING",
                      discussedAt: null,
                      markerInsertedAt: null,
                      coreNotes: null,
                      confirmedSnapshot: null,
                      todoDrafts: [],
                    })),
                  }));
                  setLiveNotes("");
                  setTranscript("");
                  setProposal(null);
                  setPostStep("paste");
                  setWorkStage("idle");
                  lockAssignStep.current = false;
                  setMatchDrafts({});
                  setUnassignedDraft("");
                  setCurrentDiscussItemId(null);
                  setConfirmDrafts({});
                  flash("已回到会前 · 可重新开始开会");
                }
              }, { refresh: false });
            }}
            className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-1.5 text-sm hover:bg-amber-100 disabled:opacity-40"
          >
            回到会前
          </button>
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
          建议：开会准备（可选）→ 开始开会 → 腾讯会议讨论并按顺序点伙伴 → 结束会议 → 粘贴纪要 →
          <strong>确认归属</strong> → <strong>提炼进展与待办</strong> → 入库与分享。
        </p>
      ) : null}

      {phase === "live" ? (
        <DiscussingNowBanner
          currentDiscussItem={currentDiscussItem}
          meetingStartedAt={meeting.startedAt}
          markJustAt={markJustAt}
        />
      ) : null}

      {/* 会后第一步：粘贴 + 匹配归属 */}
      {(phase === "post" || phase === "done") && (
        <MinutesPastePanel
          phase={phase}
          postStep={postStep}
          transcript={transcript}
          liveNotes={liveNotes}
          busy={busy}
          workStage={workStage}
          onTranscriptChange={setTranscript}
          onMatch={() =>
            run(async () => {
              setWorkStage("saving");
              const t = window.setTimeout(() => setWorkStage("matching"), 400);
              try {
                const res = await matchMeetingMinutesAction(meeting.id, transcript);
                if (res.error) {
                  setWorkStage("idle");
                  flash(undefined, res.error);
                  return;
                }
                if (res.liveNotes) {
                  setLiveNotes(res.liveNotes);
                  const segments = parsePartnerSectionsFromLiveNotes(res.liveNotes, meeting.items);
                  applySegmentsToDrafts(segments, setMatchDrafts, setUnassignedDraft);
                }
                setProposal(null);
                setConfirmDrafts({});
                lockAssignStep.current = true;
                setPostStep("assign");
                setWorkStage("done");
                flash("已按讨论顺序整段切分 · 请在下方核对切点（可用并入上/下一段），再点紫色按钮提炼");
                requestAnimationFrame(() => {
                  document.getElementById("assignment-timeline")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                });
              } finally {
                window.clearTimeout(t);
              }
            })
          }
          onRematch={() => {
            lockAssignStep.current = true;
            setPostStep("assign");
            setProposal(null);
            setConfirmDrafts({});
            setWorkStage("idle");
            flash("请在下方时间线核对各伙伴段落，改完后点紫色按钮提炼");
            requestAnimationFrame(() => {
              document.getElementById("assignment-timeline")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            });
          }}
        />
      )}

      {phase === "post" ? <PostStepIndicator step={postStep} /> : null}

      {/* 会后第一步：归属时间线确认（主交互） */}
      {phase === "post" && postStep === "assign" ? (
        <AssignmentTimelinePanel
          items={orderedForTimeline}
          matchDrafts={matchDrafts}
          unassignedDraft={unassignedDraft}
          busy={busy}
          workStage={workStage}
          onChangePartner={(partnerId, text) =>
            setMatchDrafts((prev) => ({ ...prev, [partnerId]: text }))
          }
          onChangeUnassigned={setUnassignedDraft}
          onMoveToPartner={(fromPartnerId, toPartnerId) => {
            const text = (matchDrafts[fromPartnerId] ?? "").trim();
            if (!text || fromPartnerId === toPartnerId) return;
            setMatchDrafts((prev) => ({
              ...prev,
              [fromPartnerId]: "",
              [toPartnerId]: [prev[toPartnerId]?.trim(), text].filter(Boolean).join("\n\n"),
            }));
          }}
          onMergeAdjacent={(fromIdx, direction) => {
            const ordered = orderedForTimeline;
            const toIdx = direction === "up" ? fromIdx - 1 : fromIdx + 1;
            if (toIdx < 0 || toIdx >= ordered.length) return;
            const from = ordered[fromIdx]!;
            const to = ordered[toIdx]!;
            const text = (matchDrafts[from.partnerId] ?? "").trim();
            if (!text) return;
            setMatchDrafts((prev) => {
              const merged =
                direction === "up"
                  ? [prev[to.partnerId]?.trim(), text].filter(Boolean).join("\n\n")
                  : [text, prev[to.partnerId]?.trim()].filter(Boolean).join("\n\n");
              return {
                ...prev,
                [from.partnerId]: "",
                [to.partnerId]: merged,
              };
            });
          }}
          onMoveTurns={(fromIdx, turnFrom, turnTo, direction) => {
            // fromIdx: -1 = 未归属；伙伴按 orderedForTimeline 下标
            const ordered = orderedForTimeline;
            const readTurns = (idx: number) => {
              if (idx === -1) return splitTranscriptTurns(unassignedDraft);
              const id = ordered[idx]?.partnerId;
              return id ? splitTranscriptTurns(matchDrafts[id] ?? "") : [];
            };
            const applyTurns = (
              idx: number,
              turns: string[],
              drafts: Record<string, string>,
              unassigned: string,
            ) => {
              const text = joinTranscriptTurns(turns);
              if (idx === -1) return { drafts, unassigned: text };
              const id = ordered[idx]!.partnerId;
              return { drafts: { ...drafts, [id]: text }, unassigned };
            };

            const toIdx = direction === "up" ? fromIdx - 1 : fromIdx + 1;
            const maxIdx = ordered.length - 1;
            if (fromIdx < -1 || fromIdx > maxIdx) return;
            if (toIdx < -1 || toIdx > maxIdx) return;

            const source = readTurns(fromIdx);
            if (!source.length) return;
            const lo = Math.max(0, Math.min(turnFrom, turnTo));
            const hi = Math.min(source.length - 1, Math.max(turnFrom, turnTo));
            const moving = source.slice(lo, hi + 1);
            if (!moving.length) return;
            const remaining = [...source.slice(0, lo), ...source.slice(hi + 1)];
            const target = readTurns(toIdx);
            const nextTarget =
              direction === "up" ? [...target, ...moving] : [...moving, ...target];

            let drafts = { ...matchDrafts };
            let unassigned = unassignedDraft;
            ({ drafts, unassigned } = applyTurns(fromIdx, remaining, drafts, unassigned));
            ({ drafts, unassigned } = applyTurns(toIdx, nextTarget, drafts, unassigned));
            setMatchDrafts(drafts);
            setUnassignedDraft(unassigned);
          }}
          onSave={() =>
            run(async () => {
              const notes = buildLiveNotesFromSegments(
                segmentsFromDrafts(meeting.items, matchDrafts, unassignedDraft),
              );
              await saveMatchedNotesAction(meeting.id, notes);
              setLiveNotes(notes);
              flash("归属已保存（尚未提炼）");
            })
          }
          onConfirmExtract={() =>
            run(async () => {
              setWorkStage("extracting");
              try {
                const notes = buildLiveNotesFromSegments(
                  segmentsFromDrafts(meeting.items, matchDrafts, unassignedDraft),
                );
                await saveMatchedNotesAction(meeting.id, notes);
                setLiveNotes(notes);
                const res = await extractMeetingOutcomesAction(meeting.id);
                if (res.error) {
                  setWorkStage("idle");
                  flash(undefined, res.error);
                  return;
                }
                if (res.proposal) {
                  setProposal(res.proposal);
                  setConfirmDrafts(draftsFromProposal(res.proposal));
                  lockAssignStep.current = false;
                  setPostStep("extract");
                  const first =
                    res.proposal.items.find((it) => it.coreNotes.trim() || it.todos.length) ??
                    res.proposal.items[0];
                  if (first) setActiveItemId(first.itemId);
                }
                setWorkStage("done");
                flash("已提炼进展与待办 · 请在下方两栏逐伙伴确认修改后入库");
                router.refresh();
              } catch (e) {
                setWorkStage("idle");
                flash(undefined, e instanceof Error ? e.message : String(e));
              }
            })
          }
        />
      ) : null}

      {/* 归属确认阶段隐藏三栏，避免干扰 */}
      {phase === "post" && postStep === "assign" ? null : (
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]">
        {/* Partner list */}
        <aside className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 text-xs font-medium text-slate-500">
            伙伴议程
            {phase === "live" ? (
              <span className="font-normal text-slate-400"> · 讨论谁点谁</span>
            ) : null}
          </div>
          <ul className="divide-y divide-slate-50 max-h-[70vh] overflow-y-auto">
            {meeting.items.map((item, idx) => {
              const isDiscussing =
                currentDiscussItemId === item.id && phase === "live";
              const justMarked =
                isDiscussing && markJustAt > 0 && Date.now() - markJustAt < 2500;
              return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveItemId(item.id);
                    if (phase === "live") {
                      markPartnerDiscuss(item.id, item.partnerName);
                    }
                  }}
                  className={`w-full text-left py-2.5 pr-3 text-sm transition-colors ${
                    isDiscussing
                      ? "pl-2 border-l-4 border-emerald-500 bg-emerald-50/90 hover:bg-emerald-50"
                      : activeItemId === item.id
                        ? "pl-3 bg-sky-50/80 hover:bg-sky-50"
                        : "pl-3 hover:bg-slate-50"
                  } ${justMarked ? "ring-2 ring-emerald-400 ring-inset" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-4">{idx + 1}</span>
                    <span className="font-medium text-slate-800 truncate">{item.partnerName}</span>
                    {isDiscussing ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        讨论中
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400 pl-6">
                    {item.status === "CONFIRMED"
                      ? "已确认入库"
                      : item.status === "DISCUSSED"
                        ? isDiscussing
                          ? "当前正在过"
                          : "已讨论"
                        : phase === "live"
                          ? "待讨论 · 点击开始"
                          : "待讨论"}
                    {item.partnerTier ? ` · Tier ${item.partnerTier}` : ""}
                    {isDiscussing && item.markerInsertedAt && meeting.startedAt ? (
                      <span className="ml-1 font-mono text-emerald-700">
                        · {formatRelativeMeetingTime(item.markerInsertedAt, meeting.startedAt)}
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            );
            })}
          </ul>
          {phase === "live" ? (
            <LiveAgendaPanel
              items={meeting.items}
              currentDiscussItemId={currentDiscussItemId}
              meetingStartedAt={meeting.startedAt}
              compact
            />
          ) : null}
          {(phase === "prep" || phase === "live" || phase === "post") && (
            <AddPartnersPanel
              meetingId={meeting.id}
              allPartners={allPartners}
              existingPartnerIds={meeting.items.map((it) => it.partnerId)}
              busy={busy}
              onAdded={(items) => {
                setMeeting((m) => ({ ...m, items: [...m.items, ...items] }));
                if (items[0]) setActiveItemId(items[0].id);
                flash(`已追加 ${items.length} 个伙伴 · 点左侧开始讨论`);
              }}
              onError={(err) => flash(undefined, err)}
            />
          )}
        </aside>

        {/* 伙伴详情 · 左栏：概览与商机 */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 min-h-[320px] max-h-[78vh] overflow-y-auto">
          {!activeItem ? (
            <p className="text-sm text-slate-400">选择左侧伙伴查看详情</p>
          ) : (
            <>
              <PartnerDetailHeader activeItem={activeItem} phase={phase} />
              {phase === "done" ? (
                <ConfirmedHistoryPanel item={activeItem} part="left" />
              ) : (
                <>
                  {!activeItem.prepBrief && canRunPrep ? (
                    <div className="rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-3 space-y-2">
                      <p className="text-sm text-slate-700">
                        会前简报会汇总该伙伴近 2 周商务记录、待办，并按<strong>终端客户</strong>列出进行中商机，同时给出讨论议题。
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={runPrep}
                        className="rounded-lg bg-sky-700 text-white px-3 py-1.5 text-sm hover:bg-sky-800 disabled:opacity-40"
                      >
                        立即生成会前简报
                      </button>
                    </div>
                  ) : null}
                  {postConfirmReady ? (
                    <PostConfirmPanel
                      item={activeItem}
                      draft={confirmDrafts[activeItem.id]}
                      onChange={(d) => setConfirmDrafts((prev) => ({ ...prev, [activeItem.id]: d }))}
                      proposalItem={proposal?.items.find((p) => p.itemId === activeItem.id)}
                      part="left"
                    />
                  ) : activeItem.prepBrief ? (
                    <PrepBriefOverview brief={activeItem.prepBrief} />
                  ) : phase === "post" && postStep === "assign" ? (
                    <p className="text-xs text-slate-400">请先在上方时间线确认纪要归属，再提炼进展总结</p>
                  ) : phase === "post" ? (
                    <p className="text-xs text-slate-400">粘贴纪要并匹配归属后，此处确认进展总结</p>
                  ) : null}
                </>
              )}
            </>
          )}
        </section>

        {/* 伙伴详情 · 右栏：待办与进展 */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 min-h-[320px] max-h-[78vh] overflow-y-auto">
          {!activeItem ? (
            <p className="text-sm text-slate-400">议题、待办与近两周进展将显示在这里</p>
          ) : (
            <>
              {phase === "done" ? (
                <ConfirmedHistoryPanel item={activeItem} part="right" />
              ) : (
                <>
                  {postConfirmReady ? (
                    <PostConfirmPanel
                      item={activeItem}
                      draft={confirmDrafts[activeItem.id]}
                      onChange={(d) => setConfirmDrafts((prev) => ({ ...prev, [activeItem.id]: d }))}
                      proposalItem={proposal?.items.find((p) => p.itemId === activeItem.id)}
                      part="right"
                    />
                  ) : activeItem.prepBrief ? (
                    <PrepBriefActivity brief={activeItem.prepBrief} />
                  ) : phase === "post" && postStep === "assign" ? (
                    <p className="text-xs text-slate-400">请先在上方时间线确认纪要归属，再提炼待办</p>
                  ) : phase === "post" ? (
                    <p className="text-xs text-slate-400">粘贴纪要并匹配归属后，此处确认后续待办</p>
                  ) : (
                    <p className="text-xs text-slate-400">生成简报后，此处显示待办与近两周进展</p>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
      )}

      {/* 会后第二步：会议报告 + 入库 */}
      {phase === "post" && postStep === "extract" ? (
        <FinalReportPanel
          meeting={meeting}
          confirmDrafts={confirmDrafts}
          proposal={proposal}
          busy={busy}
          onConfirmAll={() =>
            run(async () => {
              const items: ConfirmItemPayload[] = Object.entries(confirmDrafts).map(
                ([itemId, d]) => ({
                  itemId,
                  coreNotes: d.coreNotes,
                  businessRecordTitle: d.businessRecordTitle,
                  businessRecordContent: d.skipBusinessRecord
                    ? d.coreNotes
                    : d.businessRecordContent || d.coreNotes,
                  skipBusinessRecord: d.skipBusinessRecord,
                  todos: d.todos.map((t) => ({
                    id: t.id,
                    title: t.title,
                    detail: t.detail,
                    dueDate: t.dueDate || null,
                    include: t.include,
                  })),
                }),
              );
              const res = await confirmMeetingItemsAction(meeting.id, items);
              if (res.error) flash(undefined, res.error);
              else {
                flash(`已确认入库 ${res.results?.length ?? 0} 个伙伴 · 会议报告已记入历史`);
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
                        wroteBusinessRecord:
                          !d.skipBusinessRecord && !!d.businessRecordTitle.trim(),
                        todos,
                      },
                    };
                  }),
                }));
              }
            })
          }
          onFlash={flash}
        />
      ) : null}

      {phase === "done" ? (
        <FinalReportPanel
          meeting={meeting}
          confirmDrafts={confirmDrafts}
          proposal={proposal}
          busy={busy}
          readonly
          onFlash={flash}
        />
      ) : null}
    </div>
  );
}

function PostStepIndicator({ step }: { step: PostStep }) {
  const steps: { id: PostStep; label: string }[] = [
    { id: "paste", label: "① 粘贴纪要" },
    { id: "assign", label: "② 确认归属" },
    { id: "extract", label: "③ 提炼入库" },
  ];
  const order = { paste: 0, assign: 1, extract: 2 } as const;
  const cur = order[step];
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {steps.map((s, idx) => {
        const active = s.id === step;
        const done = idx < cur;
        return (
          <li
            key={s.id}
            className={`rounded-full px-3 py-1.5 border font-medium ${
              active
                ? "border-sky-500 bg-sky-100 text-sky-900"
                : done
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-400"
            }`}
          >
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

function MinutesPastePanel({
  phase,
  postStep,
  transcript,
  liveNotes,
  busy,
  workStage,
  onTranscriptChange,
  onMatch,
  onRematch,
}: {
  phase: string;
  postStep: PostStep;
  transcript: string;
  liveNotes: string;
  busy: boolean;
  workStage: WorkStage;
  onTranscriptChange: (v: string) => void;
  onMatch: () => void;
  onRematch: () => void;
}) {
  const matching = busy && (workStage === "saving" || workStage === "matching");
  const collapsed = postStep === "assign";

  return (
    <section className="rounded-xl border-2 border-sky-200 bg-sky-50/40 p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            {phase === "done"
              ? "会议纪要（只读）"
              : collapsed
                ? "1. 会议纪要（已匹配）"
                : "1. 粘贴会议纪要"}
          </div>
          {phase === "post" && !collapsed ? (
            <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
              粘贴全文后点「自动匹配归属」。系统把内容粗分到议程伙伴；
              <strong>真正确认归属</strong>在下一步的时间线里完成。
            </p>
          ) : null}
          {phase === "post" && collapsed ? (
            <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
              请向下查看<strong>讨论顺序时间线</strong>：核对每段是否挂对伙伴，改完后点紫色按钮「确认归属并提炼」。
            </p>
          ) : null}
        </div>
        {matching ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-800">
            <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
            {workStageLabel(workStage)}
          </span>
        ) : postStep === "assign" ? (
          <span className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
            当前：请确认归属
          </span>
        ) : postStep === "extract" ? (
          <span className="text-xs font-medium text-emerald-700">已提炼 · 可改归属后重来</span>
        ) : null}
      </div>

      {phase === "post" ? (
        <>
          {!collapsed ? (
            <textarea
              value={transcript}
              onChange={(e) => onTranscriptChange(e.target.value)}
              rows={7}
              disabled={matching}
              placeholder="粘贴腾讯会议纪要全文（智能纪要或发言人逐字稿）…"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono leading-relaxed disabled:opacity-60"
            />
          ) : (
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                展开查看已粘贴纪要（{transcript.length} 字）
              </summary>
              <textarea
                value={transcript}
                onChange={(e) => onTranscriptChange(e.target.value)}
                rows={4}
                disabled={matching}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono leading-relaxed disabled:opacity-60"
              />
            </details>
          )}
          {matching ? (
            <ol className="flex flex-wrap gap-2 text-[11px]">
              {(
                [
                  ["saving", "① 保存"],
                  ["matching", "② 匹配归属"],
                ] as const
              ).map(([key, label], idx) => {
                const order = { saving: 0, matching: 1, extracting: 2, done: 3, idle: -1 } as const;
                const cur = order[workStage];
                const active = key === workStage;
                const done = idx < cur;
                return (
                  <li
                    key={key}
                    className={`rounded-full px-2.5 py-1 border ${
                      active
                        ? "border-sky-400 bg-sky-100 text-sky-900 font-medium"
                        : done
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 bg-white text-slate-400"
                    }`}
                  >
                    {label}
                  </li>
                );
              })}
            </ol>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {postStep !== "assign" ? (
              <button
                type="button"
                disabled={busy || !transcript.trim()}
                onClick={onMatch}
                className="rounded-lg bg-sky-700 text-white px-4 py-2 text-sm font-medium hover:bg-sky-800 disabled:opacity-40"
              >
                {matching
                  ? workStageLabel(workStage)
                  : postStep === "paste"
                    ? "自动匹配归属"
                    : "重新匹配归属"}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || !transcript.trim()}
                onClick={onMatch}
                className="rounded-lg border border-sky-300 bg-white text-sky-800 px-3 py-1.5 text-xs hover:bg-sky-50 disabled:opacity-40"
              >
                {matching ? workStageLabel(workStage) : "重新跑匹配"}
              </button>
            )}
            {postStep === "extract" ? (
              <button
                type="button"
                disabled={busy}
                onClick={onRematch}
                className="rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-medium hover:bg-amber-700 disabled:opacity-40"
              >
                打开归属时间线
              </button>
            ) : null}
            {postStep === "paste" && !matching ? (
              <span className="text-[11px] text-slate-500">下一步：在时间线上确认每段属于谁</span>
            ) : null}
          </div>
        </>
      ) : (
        <textarea
          value={liveNotes || transcript}
          readOnly
          rows={5}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono leading-relaxed bg-white text-slate-700"
        />
      )}
    </section>
  );
}

function AssignmentTimelinePanel({
  items,
  matchDrafts,
  unassignedDraft,
  busy,
  workStage,
  onChangePartner,
  onChangeUnassigned,
  onMoveToPartner,
  onMergeAdjacent,
  onMoveTurns,
  onSave,
  onConfirmExtract,
}: {
  items: ReviewItemClient[];
  matchDrafts: Record<string, string>;
  unassignedDraft: string;
  busy: boolean;
  workStage: WorkStage;
  onChangePartner: (partnerId: string, text: string) => void;
  onChangeUnassigned: (text: string) => void;
  onMoveToPartner: (fromPartnerId: string, toPartnerId: string) => void;
  onMergeAdjacent: (fromIdx: number, direction: "up" | "down") => void;
  /** segmentIdx -1=未归属；移动 [turnFrom..turnTo] 到相邻段 */
  onMoveTurns: (
    segmentIdx: number,
    turnFrom: number,
    turnTo: number,
    direction: "up" | "down",
  ) => void;
  onSave: () => void;
  onConfirmExtract: () => void;
}) {
  const extracting = busy && workStage === "extracting";
  const [editRaw, setEditRaw] = useState<Record<string, boolean>>({});
  const unassignedTurns = splitTranscriptTurns(unassignedDraft);

  return (
    <section
      id="assignment-timeline"
      className="rounded-xl border-2 border-amber-300 bg-amber-50/30 p-4 space-y-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">2. 确认归属 · 按顺序整段切分</div>
          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
            过伙伴会议按顺序整段讨论。切点偏了时，在<strong>中间某条发言</strong>上点「放到上一段 / 放到下一段」，
            或用「以上归上 / 以下归下」整块挪边界；也可整段改挂。核对完再提炼。
          </p>
        </div>
        {extracting ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-800">
            <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
            {workStageLabel("extracting")}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-amber-900 bg-amber-100 border border-amber-200 rounded-full px-2.5 py-1">
            必做步骤
          </span>
        )}
      </div>

      <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-900">
              —
            </span>
            <p className="text-xs font-medium text-amber-900">未归属 / 开场</p>
          </div>
          <button
            type="button"
            disabled={extracting}
            onClick={() => setEditRaw((p) => ({ ...p, __unassigned: !p.__unassigned }))}
            className="text-[11px] text-slate-500 underline-offset-2 hover:underline disabled:opacity-40"
          >
            {editRaw.__unassigned ? "按条调整" : "编辑全文"}
          </button>
        </div>
        {editRaw.__unassigned ? (
          <textarea
            value={unassignedDraft}
            onChange={(e) => onChangeUnassigned(e.target.value)}
            rows={3}
            disabled={extracting}
            placeholder="无法归属到具体伙伴的开场或串场…"
            className="w-full rounded border border-amber-100 bg-white px-2 py-1.5 text-xs font-mono leading-relaxed disabled:opacity-50"
          />
        ) : unassignedTurns.length ? (
          <TurnAdjustList
            turns={unassignedTurns}
            segmentIdx={-1}
            canMoveUp={false}
            canMoveDown={items.length > 0}
            disabled={extracting}
            onMoveTurns={onMoveTurns}
          />
        ) : (
          <p className="text-[11px] text-amber-800/70 px-1">无开场内容（可点「编辑全文」补充）</p>
        )}
      </div>

      <ol className="relative space-y-0 pl-2">
        {items.map((it, idx) => {
          const text = matchDrafts[it.partnerId] ?? "";
          const hasText = !!text.trim();
          const turns = splitTranscriptTurns(text);
          const rawKey = it.partnerId;
          const showRaw = !!editRaw[rawKey];
          return (
            <li key={it.id} className="relative flex gap-3 pb-5 last:pb-0">
              {idx < items.length - 1 ? (
                <span
                  className="absolute left-[11px] top-7 bottom-0 w-px bg-slate-200"
                  aria-hidden
                />
              ) : null}
              <div className="relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-sky-500 bg-white text-[11px] font-semibold text-sky-800">
                {idx + 1}
              </div>
              <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{it.partnerName}</p>
                    <p className="text-[11px] text-slate-400">
                      讨论顺序第 {idx + 1}
                      {it.partnerTier ? ` · Tier ${it.partnerTier}` : ""}
                      {hasText ? ` · ${turns.length || 1} 条` : " · 暂无内容"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={extracting || !hasText || idx === 0}
                      onClick={() => onMergeAdjacent(idx, "up")}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                      title="整段并入上一位伙伴"
                    >
                      整段↑
                    </button>
                    <button
                      type="button"
                      disabled={extracting || !hasText || idx === items.length - 1}
                      onClick={() => onMergeAdjacent(idx, "down")}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                      title="整段并入下一位伙伴"
                    >
                      整段↓
                    </button>
                    <label className="flex items-center gap-1 text-[11px] text-slate-500">
                      改挂
                      <select
                        disabled={extracting || !hasText}
                        className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs disabled:opacity-40"
                        defaultValue=""
                        onChange={(e) => {
                          const to = e.target.value;
                          e.target.value = "";
                          if (!to) return;
                          onMoveToPartner(it.partnerId, to);
                        }}
                      >
                        <option value="">…</option>
                        {items
                          .filter((p) => p.partnerId !== it.partnerId)
                          .map((p) => (
                            <option key={p.partnerId} value={p.partnerId}>
                              {p.partnerName}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={extracting}
                      onClick={() => setEditRaw((p) => ({ ...p, [rawKey]: !p[rawKey] }))}
                      className="text-[11px] text-slate-500 underline-offset-2 hover:underline disabled:opacity-40"
                    >
                      {showRaw ? "按条调整" : "编辑全文"}
                    </button>
                  </div>
                </div>
                {showRaw ? (
                  <textarea
                    value={text}
                    onChange={(e) => onChangePartner(it.partnerId, e.target.value)}
                    rows={5}
                    disabled={extracting}
                    placeholder="该伙伴对应的纪要段落，可手动增删…"
                    className="w-full rounded border border-slate-100 px-2 py-1.5 text-xs font-mono leading-relaxed disabled:opacity-50"
                  />
                ) : hasText ? (
                  <TurnAdjustList
                    turns={turns.length ? turns : [text.trim()]}
                    segmentIdx={idx}
                    canMoveUp
                    canMoveDown={idx < items.length - 1}
                    disabled={extracting}
                    onMoveTurns={onMoveTurns}
                  />
                ) : (
                  <p className="text-[11px] text-slate-400 px-1">暂无内容 · 可从相邻段把发言挪过来</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2 border-t border-amber-200/80 pt-3">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirmExtract}
          className="rounded-lg bg-violet-700 text-white px-5 py-2.5 text-sm font-semibold hover:bg-violet-800 disabled:opacity-40"
        >
          {extracting ? workStageLabel("extracting") : "确认归属无误，开始提炼"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onSave}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
        >
          仅保存归属
        </button>
        <span className="text-[11px] text-slate-500">提炼后才会生成进展总结与待办</span>
      </div>
    </section>
  );
}

function TurnAdjustList({
  turns,
  segmentIdx,
  canMoveUp,
  canMoveDown,
  disabled,
  onMoveTurns,
}: {
  turns: string[];
  segmentIdx: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled: boolean;
  onMoveTurns: (
    segmentIdx: number,
    turnFrom: number,
    turnTo: number,
    direction: "up" | "down",
  ) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {turns.map((turn, ti) => (
        <li
          key={`${segmentIdx}-${ti}-${turn.slice(0, 24)}`}
          className="group relative rounded-md border border-sky-100 bg-sky-50/40 px-2.5 py-2"
        >
          <div className="mb-1.5 flex flex-wrap items-center gap-1">
            <button
              type="button"
              disabled={disabled || !canMoveUp}
              onClick={() => onMoveTurns(segmentIdx, ti, ti, "up")}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50 disabled:opacity-25"
              title="把这条发言放到上一段末尾"
            >
              ↑ 放到上一段
            </button>
            <button
              type="button"
              disabled={disabled || !canMoveDown}
              onClick={() => onMoveTurns(segmentIdx, ti, ti, "down")}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50 disabled:opacity-25"
              title="把这条发言放到下一段开头"
            >
              ↓ 放到下一段
            </button>
            {ti > 0 && canMoveUp ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onMoveTurns(segmentIdx, 0, ti, "up")}
                className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-white/80 disabled:opacity-25"
                title="本条及以上全部并入上一段"
              >
                以上归上
              </button>
            ) : null}
            {ti < turns.length - 1 && canMoveDown ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onMoveTurns(segmentIdx, ti, turns.length - 1, "down")}
                className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-white/80 disabled:opacity-25"
                title="本条及以下全部并入下一段"
              >
                以下归下
              </button>
            ) : null}
          </div>
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-800">
            {turn}
          </pre>
        </li>
      ))}
    </ul>
  );
}

function FinalReportPanel({
  meeting,
  confirmDrafts,
  proposal,
  busy,
  readonly,
  onConfirmAll,
  onFlash,
}: {
  meeting: MeetingClient;
  confirmDrafts: Record<string, ConfirmDraft>;
  proposal: SplitProposal | null;
  busy: boolean;
  readonly?: boolean;
  onConfirmAll?: () => void;
  onFlash: (ok?: string, err?: string) => void;
}) {
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const reportMd = useMemo(() => {
    const partners = meeting.items.map((it) => {
      if (readonly || meeting.status === "DONE") {
        return reportRowFromConfirmed({
          partnerName: it.partnerName,
          partnerTier: it.partnerTier,
          prepBrief: it.prepBrief,
          snapshot: it.confirmedSnapshot,
          coreNotes: it.coreNotes,
        });
      }
      const d = confirmDrafts[it.id];
      const prop = proposal?.items.find((p) => p.itemId === it.id);
      return reportRowFromBriefAndDraft({
        partnerName: it.partnerName,
        partnerTier: it.partnerTier,
        prepBrief: it.prepBrief,
        progressSummary: d?.coreNotes || prop?.coreNotes || it.coreNotes || "",
        todos:
          d?.todos.map((t) => ({
            title: t.title,
            detail: t.detail,
            dueDate: t.dueDate,
            include: t.include,
          })) ||
          prop?.todos.map((t) => ({
            title: t.title,
            detail: t.detail,
            dueDate: t.dueDate,
            include: true,
          })) ||
          [],
      });
    });
    return buildFinalReportMarkdown({
      title: meeting.title,
      endedAt: meeting.endedAt,
      partners,
    });
  }, [meeting, confirmDrafts, proposal, readonly]);

  async function copyReport() {
    const ok = await copyTextToClipboard(reportMd);
    onFlash(ok ? "会议报告已复制" : undefined, ok ? undefined : "复制失败，请手动选择文本");
  }

  async function shareReport() {
    setSharing(true);
    try {
      const res = await getMeetingPreviewPathAction(meeting.id);
      if (!res.path) {
        onFlash(undefined, "无法生成分享链接");
        return;
      }
      const url = `${window.location.origin}${res.path}`;
      setShareUrl(url);
      const ok = await copyTextToClipboard(url);
      onFlash(ok ? "分享链接已复制" : undefined, ok ? undefined : "链接已生成，请手动复制");
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            {readonly ? "会议报告（已入库）" : "3. 会议报告 · 确认入库"}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            含会前摘要、近两周进展总结与后续待办；入库后写入历史，并可分享链接。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyReport()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50"
          >
            复制报告
          </button>
          <button
            type="button"
            disabled={sharing}
            onClick={() => void shareReport()}
            className="rounded-lg border border-sky-200 bg-sky-50 text-sky-900 px-3 py-1.5 text-xs hover:bg-sky-100 disabled:opacity-40"
          >
            {sharing ? "生成中…" : "分享报告链接"}
          </button>
          {!readonly && onConfirmAll ? (
            <button
              type="button"
              disabled={busy || !Object.keys(confirmDrafts).length}
              onClick={onConfirmAll}
              className="rounded-lg bg-emerald-700 text-white px-3 py-1.5 text-xs font-medium hover:bg-emerald-800 disabled:opacity-40"
            >
              确认入库到历史
            </button>
          ) : null}
        </div>
      </div>
      {shareUrl ? (
        <input
          type="text"
          readOnly
          value={shareUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono text-slate-700 bg-slate-50"
        />
      ) : null}
      <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3 max-h-[420px] overflow-y-auto space-y-4 text-sm">
        {meeting.items.map((it, idx) => {
          const d = confirmDrafts[it.id];
          const progress =
            d?.coreNotes ||
            it.confirmedSnapshot?.coreNotes ||
            it.coreNotes ||
            proposal?.items.find((p) => p.itemId === it.id)?.coreNotes ||
            "";
          const todos =
            d?.todos.filter((t) => t.include && t.title.trim()) ||
            it.confirmedSnapshot?.todos ||
            proposal?.items.find((p) => p.itemId === it.id)?.todos ||
            [];
          return (
            <article key={it.id} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0">
              <h3 className="font-semibold text-slate-900">
                {idx + 1}. {it.partnerName}
                {it.partnerTier ? (
                  <span className="text-xs font-normal text-slate-400 ml-2">Tier {it.partnerTier}</span>
                ) : null}
              </h3>
              {it.prepBrief?.summaryLine ? (
                <div className="mt-2">
                  <div className="text-[11px] font-medium text-slate-400">会前摘要</div>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{it.prepBrief.summaryLine}</p>
                </div>
              ) : null}
              <div className="mt-2">
                <div className="text-[11px] font-medium text-slate-400">近两周进展总结</div>
                <p className="text-xs text-slate-800 mt-0.5 leading-relaxed whitespace-pre-wrap">
                  {progress.trim() || "（暂无）"}
                </p>
              </div>
              <div className="mt-2">
                <div className="text-[11px] font-medium text-slate-400">后续待办</div>
                {todos.length ? (
                  <ul className="mt-0.5 space-y-1">
                    {todos.map((t, i) => (
                      <li key={`${"title" in t ? t.title : ""}-${i}`} className="text-xs text-slate-700">
                        · {"title" in t ? t.title : ""}
                        {"dueDate" in t && t.dueDate ? (
                          <span className="text-slate-400">
                            {" "}
                            （{String(t.dueDate).slice(0, 10)}）
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400 mt-0.5">（无）</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AddPartnersPanel({
  meetingId,
  allPartners,
  existingPartnerIds,
  busy,
  onAdded,
  onError,
}: {
  meetingId: string;
  allPartners: { id: string; name: string; tier: string | null }[];
  existingPartnerIds: string[];
  busy: boolean;
  onAdded: (items: ReviewItemClient[]) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  const existing = useMemo(() => new Set(existingPartnerIds), [existingPartnerIds]);
  const candidates = useMemo(
    () => allPartners.filter((p) => !existing.has(p.id)),
    [allPartners, existing],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((p) => p.name.toLowerCase().includes(q));
  }, [candidates, query]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit() {
    if (!selected.length || adding) return;
    void (async () => {
      setAdding(true);
      try {
        const res = await addPartnersToMeetingAction(meetingId, selected);
        if (res.error) {
          onError(res.error);
          return;
        }
        if (res.items?.length) {
          onAdded(res.items);
          setSelected([]);
          setQuery("");
          setOpen(false);
        }
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      } finally {
        setAdding(false);
      }
    })();
  }

  if (!candidates.length) return null;

  return (
    <div className="border-t border-slate-100 px-3 py-2 bg-slate-50/60">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-lg border border-dashed border-slate-300 px-2 py-2 text-xs text-slate-600 hover:border-sky-300 hover:text-sky-800 hover:bg-white"
        >
          + 追加讨论伙伴
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700">追加讨论伙伴</span>
            <button
              type="button"
              className="text-[11px] text-slate-400 hover:text-slate-700"
              onClick={() => {
                setOpen(false);
                setSelected([]);
                setQuery("");
              }}
            >
              收起
            </button>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            临时决定多过几个伙伴时使用；会自动拉取近 2 周简报，加入后点左侧即可打标。
          </p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索伙伴…"
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs"
          />
          <div className="max-h-36 overflow-y-auto rounded-md border border-slate-100 bg-white divide-y divide-slate-50">
            {filtered.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={() => toggle(p.id)}
                />
                <span className="flex-1 truncate text-slate-800">{p.name}</span>
                {p.tier ? <span className="text-slate-400">T{p.tier}</span> : null}
              </label>
            ))}
            {!filtered.length ? (
              <p className="px-2 py-3 text-[11px] text-slate-400">没有可追加的伙伴</p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={adding || busy || !selected.length}
            onClick={submit}
            className="w-full rounded-lg bg-sky-700 text-white px-2 py-1.5 text-xs hover:bg-sky-800 disabled:opacity-40"
          >
            {adding ? `正在加入并拉取简报（${selected.length}）…` : `加入议程（${selected.length || 0}）`}
          </button>
        </div>
      )}
    </div>
  );
}

function MeetingPreviewActions({
  meetingId,
  previewToken,
}: {
  meetingId: string;
  previewToken: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState<string | null>(null);

  async function resolvePreviewPath(): Promise<string | null> {
    if (previewToken) return `/partner-reviews/preview/${previewToken}`;
    const res = await getMeetingPreviewPathAction(meetingId);
    if (!res.ok || !res.path) return null;
    return res.path;
  }

  async function openPreview() {
    setCopyError(null);
    try {
      const path = await resolvePreviewPath();
      if (!path) {
        setCopyError("无法获取预览链接，请刷新页面后重试");
        return;
      }
      window.open(path, "_blank", "noopener,noreferrer");
    } catch (e) {
      setCopyError(e instanceof Error ? e.message : "打开预览失败");
    }
  }

  async function copyLink() {
    setCopyError(null);
    setManualUrl(null);
    try {
      const path = await resolvePreviewPath();
      if (!path) {
        setCopyError("无法获取预览链接，请刷新页面后重试");
        return;
      }
      const url = `${window.location.origin}${path}`;
      const ok = await copyTextToClipboard(url);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
      setManualUrl(url);
      setCopyError("浏览器不允许自动复制，请手动选中下方链接复制");
    } catch (e) {
      setCopyError(e instanceof Error ? e.message : "复制失败");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void openPreview()}
          className="rounded-lg border border-sky-200 bg-sky-50 text-sky-800 px-3 py-1.5 text-sm hover:bg-sky-100"
        >
          打开会前预览
        </button>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          {copied ? "已复制链接" : "复制预览链接"}
        </button>
        {previewToken ? null : (
          <span className="text-[11px] text-slate-400 self-center">首次复制会生成分享链接</span>
        )}
      </div>
      {copyError ? <p className="text-xs text-amber-700">{copyError}</p> : null}
      {manualUrl ? (
        <input
          type="text"
          readOnly
          value={manualUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono text-slate-700 bg-slate-50"
        />
      ) : null}
    </div>
  );
}

function PartnerDetailHeader({
  activeItem,
  phase,
}: {
  activeItem: ReviewItemClient;
  phase: string;
}) {
  return (
    <div className="pb-2 border-b border-slate-100">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{activeItem.partnerName}</h3>
        {activeItem.partnerTier ? (
          <span className="text-[11px] text-slate-500">Tier {activeItem.partnerTier}</span>
        ) : null}
      </div>
      <p className="text-xs text-slate-500 mt-0.5">
        {phase === "done"
          ? "已确认摘要（历史回看）"
          : activeItem.prepBrief?.windowLabel
            ? `简报窗口 ${activeItem.prepBrief.windowLabel}`
            : "尚未拉取近 2 周进展，请点上方「开会准备」"}
      </p>
    </div>
  );
}

function formatRelativeMeetingTime(
  markerInsertedAt: string | null,
  meetingStartedAt: string | null,
): string {
  if (!markerInsertedAt || !meetingStartedAt) return "";
  const at = Date.parse(markerInsertedAt);
  const anchor = Date.parse(meetingStartedAt);
  if (Number.isNaN(at) || Number.isNaN(anchor)) return "";
  const relSec = Math.max(0, Math.round((at - anchor) / 1000));
  const m = Math.floor(relSec / 60);
  const s = relSec % 60;
  return `会议 +${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function DiscussingNowBanner({
  currentDiscussItem,
  meetingStartedAt,
  markJustAt,
}: {
  currentDiscussItem: ReviewItemClient | null;
  meetingStartedAt: string | null;
  markJustAt: number;
}) {
  const justMarked = markJustAt > 0 && Date.now() - markJustAt < 3000;
  if (currentDiscussItem) {
    const rel = formatRelativeMeetingTime(
      currentDiscussItem.markerInsertedAt ?? null,
      meetingStartedAt,
    );
    return (
      <div
        className={`rounded-xl border-2 px-4 py-3 transition-colors ${
          justMarked
            ? "border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-100"
            : "border-emerald-300 bg-emerald-50/80"
        }`}
      >
        <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
          当前讨论伙伴
        </p>
        <p className="text-xl font-bold text-emerald-950 mt-0.5">
          {currentDiscussItem.partnerName}
        </p>
        <p className="text-xs text-emerald-800 mt-1">
          实际讨论在腾讯会议进行 · 此处仅记时间线 · {rel || "刚刚打点"}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-amber-800">
        会议进行中 · 尚未选定伙伴
      </p>
      <p className="text-base font-semibold text-amber-950 mt-0.5">
        开始过某位伙伴时，请点左侧该伙伴名称
      </p>
      <p className="text-xs text-amber-800 mt-1">
        实际讨论在腾讯会议进行；本页只记录讨论顺序与时间线，便于会后与腾讯纪要匹配
      </p>
    </div>
  );
}

function formatAgendaMarkerTime(
  markerInsertedAt: string | null,
  meetingStartedAt: string | null,
): string {
  if (!markerInsertedAt) return "—";
  const rel = formatRelativeMeetingTime(markerInsertedAt, meetingStartedAt);
  if (rel) return rel;
  const at = Date.parse(markerInsertedAt);
  if (Number.isNaN(at)) return "—";
  return new Date(at).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function LiveAgendaPanel({
  items,
  currentDiscussItemId,
  meetingStartedAt,
  compact = false,
}: {
  items: ReviewItemClient[];
  currentDiscussItemId: string | null;
  meetingStartedAt: string | null;
  compact?: boolean;
}) {
  const marked = items
    .filter((it) => it.markerInsertedAt || it.discussedAt)
    .sort((a, b) => {
      const ta = Date.parse(a.markerInsertedAt || a.discussedAt || "") || 0;
      const tb = Date.parse(b.markerInsertedAt || b.discussedAt || "") || 0;
      return ta - tb;
    });

  return (
    <div
      className={
        compact
          ? "border-t border-slate-100 bg-slate-50/80 px-3 py-2.5 space-y-2"
          : "rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-3 space-y-3 min-h-[200px]"
      }
    >
      <p className="text-xs font-medium text-slate-700">讨论顺序</p>
      {!compact ? (
        <p className="text-xs text-slate-600 leading-relaxed">
          腾讯会议中进行实际讨论；此处<strong>只记录</strong>你何时开始过哪位伙伴（相对「开始开会」的时刻）。
        </p>
      ) : null}
      {!marked.length ? (
        <p className="text-[11px] text-slate-400">尚未打点 · 点上方伙伴开始</p>
      ) : (
        <ol className="space-y-1.5">
          {marked.map((it, idx) => (
            <li
              key={it.id}
              className={`rounded-md border px-2 py-1.5 text-[11px] ${
                it.id === currentDiscussItemId
                  ? "border-emerald-200 bg-emerald-50/80"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800 truncate">
                  {idx + 1}. {it.partnerName}
                </span>
                <span className="text-slate-500 font-mono shrink-0">
                  {formatAgendaMarkerTime(it.markerInsertedAt ?? it.discussedAt, meetingStartedAt)}
                </span>
              </div>
            </li>
          ))}
        </ol>
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

function PrepBriefOverview({ brief }: { brief: PartnerPrepBrief }) {
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
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-xs font-semibold text-slate-700">
            该伙伴下客户商机
            {brief.customerOpportunities?.length ? (
              <span className="font-normal text-slate-400">
                {" "}
                · {brief.customerOpportunities.reduce((n, g) => n + g.opportunities.length, 0)} 个进行中
              </span>
            ) : null}
          </div>
          <Link
            href={`/partners/${brief.partnerId}`}
            className="text-[11px] text-sky-700 hover:underline shrink-0"
          >
            在伙伴页查看
          </Link>
        </div>
        {brief.customerOpportunities?.length ? (
          <div className="space-y-3">
            {brief.customerOpportunities.map((group) => (
              <div
                key={group.customerId}
                className="rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  {group.customerId !== "__unassigned__" ? (
                    <Link
                      href={`/customers/${group.customerId}`}
                      className="text-sm font-semibold text-slate-900 hover:text-violet-800"
                    >
                      {group.customerName}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold text-slate-900">{group.customerName}</span>
                  )}
                  <span className="text-[11px] text-slate-500">{group.opportunities.length} 个商机</span>
                </div>
                <ul className="space-y-1.5">
                  {group.opportunities.map((o) => (
                    <li
                      key={o.id}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm rounded-md bg-white/80 border border-violet-50 px-2.5 py-1.5"
                    >
                      <span className="font-medium text-slate-800">{o.name}</span>
                      <span className="text-[11px] text-violet-700">{o.statusLabel}</span>
                      {o.stage ? (
                        <span className="text-[11px] text-slate-500">{o.stage}</span>
                      ) : null}
                      {o.amount ? (
                        <span className="text-[11px] text-slate-600 font-mono">{o.amount}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">暂无该伙伴关联客户的进行中商机</p>
        )}
      </div>
    </div>
  );
}

function PrepBriefActivity({ brief }: { brief: PartnerPrepBrief }) {
  const baseTodos =
    brief.todos?.length
      ? brief.todos
      : (brief.openTodos ?? []).map((t) => ({ ...t, done: false }));
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(baseTodos.map((t) => [t.id, t.done])),
  );

  useEffect(() => {
    setDoneMap(Object.fromEntries(baseTodos.map((t) => [t.id, t.done])));
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

function ConfirmedHistoryPanel({ item, part }: { item: ReviewItemClient; part: "left" | "right" }) {
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

  if (part === "left") {
    return (
      <div className="space-y-4 text-sm">
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1">进展总结</div>
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
        {snap.confirmedAt ? (
          <p className="text-[11px] text-slate-400">
            确认于 {new Date(snap.confirmedAt).toLocaleString("zh-CN", { hour12: false })}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
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
    </div>
  );
}

function PostConfirmPanel({
  item,
  draft,
  onChange,
  proposalItem,
  part = "left",
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
  part?: "left" | "right";
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

  if (part === "right") {
    return (
      <div className="space-y-2" onFocus={ensure}>
        <div className="text-xs font-medium text-slate-700">后续待办 · 确认修改</div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">勾选纳入 · 可改/删/加</span>
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

  return (
    <div className="space-y-2" onFocus={ensure}>
      <div className="text-xs font-medium text-slate-700">近两周进展总结 · 确认修改</div>
      {proposalItem ? (
        <details className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
          <summary className="text-[11px] font-medium text-slate-600 cursor-pointer">
            查看原始匹配片段
            <span className="font-normal text-slate-400"> · {segmentChars} 字</span>
          </summary>
          {segmentChars ? (
            <p className="mt-2 text-xs text-slate-600 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
              {segmentPreview}
              {segmentChars > segmentPreview.length ? "…" : ""}
            </p>
          ) : (
            <p className="mt-2 text-xs text-amber-800">
              本段暂无归属内容。请检查会中是否按讨论顺序打标，或重新解析纪要。
            </p>
          )}
        </details>
      ) : null}
      <label className="block space-y-1">
        <span className="text-[11px] text-slate-400">进展总结（将写入商务记录）</span>
        <textarea
          value={d.coreNotes}
          onChange={(e) => {
            const v = e.target.value;
            onChange({
              ...d,
              coreNotes: v,
              businessRecordContent: d.skipBusinessRecord ? d.businessRecordContent : v,
            });
          }}
          rows={6}
          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm leading-relaxed"
          placeholder="AI 提炼的进展总结，可在此修改…"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={!d.skipBusinessRecord}
          onChange={(e) =>
            onChange({
              ...d,
              skipBusinessRecord: !e.target.checked,
              businessRecordContent: e.target.checked ? d.coreNotes : d.businessRecordContent,
            })
          }
        />
        确认后写入商务记录
      </label>
    </div>
  );
}
