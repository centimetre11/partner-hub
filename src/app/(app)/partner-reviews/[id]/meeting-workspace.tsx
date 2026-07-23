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
  matchXfyunMinutesAction,
  switchMatchSourceAction,
  extractMeetingOutcomesAction,
  saveMatchedNotesAction,
  runMeetingPrepAction,
  startPartnerReviewMeetingAction,
  confirmMeetingItemsAction,
  finishPartnerReviewWithoutExtractAction,
} from "@/lib/partner-review/actions";
import {
  MeetingAgendaPanel,
  MeetingLiveRecording,
  MeetingMatchSourceSwitch,
  MeetingPathBPanel,
  MeetingPostStepIndicator,
  MeetingShell,
  PostMinutesDualPath,
} from "@/components/meeting";
import type { MeetingPhase, MeetingPostStep, MeetingWorkStage } from "@/components/meeting";
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
import { MossPrepCustomerBadge } from "@/components/moss/moss-workflow-sections";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";
import { useMessages } from "@/lib/i18n/context";
import { formatMsg } from "@/lib/i18n/messages";

export type { MeetingClient, ReviewItemClient };

const RAPID_CLICK_WINDOW_MS = 12_000;
const RAPID_CLICK_WARN_COUNT = 3;

/** 会后：选路径(paste/assign) → 确认总结(extract) → 会议报告(report) */
type PostStep = MeetingPostStep;
type WorkStage = MeetingWorkStage;

function matchMethodFlash(method: string | undefined, t: ReturnType<typeof useMessages>["partnerReview"]): string {
  switch (method) {
    case "summary_sections":
      return t.matchSummary;
    case "duration":
      return t.matchDuration;
    case "sequential":
      return t.matchSequential;
    case "ai":
      return t.matchAi;
    case "name":
      return t.matchName;
    case "timeline":
      return t.matchTimeline;
    case "timeline_fallback":
      return t.matchTimelineFallback;
    case "ai_fallback":
      return t.matchAiFallback;
    default:
      return t.matchDefault;
  }
}

function workStageLabel(stage: WorkStage, t: ReturnType<typeof useMessages>["partnerReview"]): string {
  switch (stage) {
    case "saving":
      return t.workSaving;
    case "matching":
      return t.workMatching;
    case "extracting":
      return t.workExtracting;
    case "done":
      return t.workDone;
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

function emptyManualDrafts(items: ReviewItemClient[]): Record<string, ConfirmDraft> {
  const drafts: Record<string, ConfirmDraft> = {};
  for (const item of items) {
    drafts[item.id] = {
      coreNotes: "",
      businessRecordTitle: `${item.partnerName} 过伙伴讨论`,
      businessRecordContent: "",
      skipBusinessRecord: false,
      todos: [],
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
      businessRecordTitle: `${item.partnerName} partner review discussion`,
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
  mossConfigured = false,
}: {
  meeting: MeetingClient;
  allPartners: { id: string; name: string; tier: string | null }[];
  mossConfigured?: boolean;
}) {
  const t = useMessages().partnerReview;
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
    if (initial.status === "DONE") return "report";
    if (initial.items.some((it) => it.coreNotes || it.todoDrafts.length)) return "extract";
    if (initial.liveNotes?.trim() || initial.transcriptText?.trim()) return "assign";
    return "paste";
  });
  /** paste 阶段：尚未选路径 / 已选录音路径 */
  const [pathMode, setPathMode] = useState<"choose" | "recording">(() =>
    initial.liveNotes?.trim() || initial.transcriptText?.trim() ? "recording" : "choose",
  );
  const [workStage, setWorkStage] = useState<WorkStage>("idle");
  /** 用户主动停留在归属确认时，禁止 refresh 用旧 coreNotes 把步骤打回 extract */
  const lockAssignStep = useRef(false);

  useEffect(() => {
    setMeeting(initial);
    setLiveNotes(initial.liveNotes ?? "");
    setTranscript(initial.transcriptText ?? "");
    if (initial.status === "DONE") {
      lockAssignStep.current = false;
      return;
    }
    if (lockAssignStep.current) return;
    if (initial.items.some((it) => it.coreNotes || it.todoDrafts.length)) {
      setPostStep((s) => (s === "report" ? s : "extract"));
    } else if (initial.liveNotes?.trim() || initial.transcriptText?.trim()) {
      setPathMode("recording");
      setPostStep((s) => (s === "extract" || s === "report" ? s : "assign"));
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
    flash(formatMsg(t.markedDiscuss, { name: partnerName, relative: relLabel ? ` · ${relLabel}` : "" }));

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
          flash(undefined, data.error || `Partner marker failed (HTTP ${res.status})`);
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
      flash(undefined, "Click partners in discussion order. Do not mark the full agenda before discussing it, or the transcript cannot be reliably split by partner.");
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
        flash(res.message ?? t.prepDone);
        setMeeting((m) => ({
          ...m,
          status: m.status === "DRAFT" ? "PREP" : m.status,
        }));
        router.refresh();
      }
    });
  }


  const agendaItems = useMemo(
    () =>
      meeting.items.map((it) => ({
        ...it,
        title: it.partnerName,
      })),
    [meeting.items],
  );

  const onPathStep =
    phase === "post" && (postStep === "paste" || postStep === "assign");
  const onSummaryStep = phase === "post" && postStep === "extract";
  const onReportStep = phase === "post" && postStep === "report";
  const showMain =
    !(phase === "post" && postStep === "assign") &&
    !(phase === "post" && postStep === "report") &&
    !(phase === "post" && postStep === "paste" && pathMode === "choose");

  function goDirectToSummary() {
    setConfirmDrafts(emptyManualDrafts(meeting.items));
    setPathMode("choose");
    setPostStep("extract");
    flash(t.pathDirectAction);
  }

  function finishWithoutSummary() {
    run(async () => {
      const res = await finishPartnerReviewWithoutExtractAction(meeting.id);
      if (res.error) flash(undefined, res.error);
      else {
        setMeeting((m) => ({
          ...m,
          status: "DONE",
          endedAt: m.endedAt ?? new Date().toISOString(),
          items: m.items.map((it) =>
            it.status === "CONFIRMED" ? it : { ...it, status: "CONFIRMED" as const },
          ),
        }));
        flash(t.finishedNoExtract);
      }
    }, { refresh: false });
  }

  const recordingSlot =
    phase === "live" ? (
      <>
        <DiscussingNowBanner
          currentDiscussItem={currentDiscussItem}
          meetingStartedAt={meeting.startedAt}
          markJustAt={markJustAt}
        />
        <MeetingLiveRecording
          phase={phase as MeetingPhase}
          meetingId={meeting.id}
          apiBase={`/api/partner-reviews/${meeting.id}`}
          transcriptStatus={meeting.transcriptStatus}
          transcriptError={meeting.transcriptError}
          onFlash={flash}
          onRecordingStarted={(startedAt) => {
            setMeeting((m) => ({
              ...m,
              status: "LIVE",
              startedAt: m.startedAt ?? startedAt ?? new Date().toISOString(),
              recordingStartedAt: startedAt ?? new Date().toISOString(),
              transcriptStatus: "recording",
            }));
          }}
          onTranscribed={({ plain, liveNotes: notes, matchMethod }) => {
            setTranscript(plain);
            setMeeting((m) => ({
              ...m,
              transcriptText: plain,
              xfyunTranscriptText: plain,
              xfyunLiveNotes: notes,
              matchSource: "xfyun",
              transcriptStatus: "ready",
            }));
            if (notes) {
              setLiveNotes(notes);
              applySegmentsToDrafts(
                parsePartnerSectionsFromLiveNotes(notes, meeting.items),
                setMatchDrafts,
                setUnassignedDraft,
              );
              lockAssignStep.current = true;
              setPathMode("recording");
              setPostStep("assign");
            }
            flash(`${matchMethodFlash(matchMethod, t)} (${t.sourceXfyun}) · ${t.sourceHint}`);
          }}
        />
      </>
    ) : null;

  const postSlot =
    phase === "post" ? (
      <div className="space-y-3">
        <MeetingPostStepIndicator step={postStep} variant="presales" />

        {onPathStep ? (
          <>
            {postStep === "paste" && pathMode === "choose" ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{t.pathChoiceTitle}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{t.pathChoiceHint}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setPathMode("recording")}
                    className="rounded-xl border-2 border-sky-200 bg-sky-50/50 p-4 text-left hover:border-sky-400 hover:bg-sky-50"
                  >
                    <div className="text-sm font-semibold text-slate-900">
                      {t.pathRecordingTitle}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                      {t.pathRecordingHint}
                    </p>
                    <span className="inline-block mt-3 text-xs font-medium text-sky-800">
                      {t.pathRecordingAction} →
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={goDirectToSummary}
                    className="rounded-xl border-2 border-slate-200 bg-white p-4 text-left hover:border-slate-400 hover:bg-slate-50"
                  >
                    <div className="text-sm font-semibold text-slate-900">
                      {t.pathDirectTitle}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                      {t.pathDirectHint}
                    </p>
                    <span className="inline-block mt-3 text-xs font-medium text-slate-800">
                      {t.pathDirectAction} →
                    </span>
                  </button>
                </div>
              </div>
            ) : null}

            {(postStep === "assign" ||
              (postStep === "paste" && pathMode === "recording")) && (
              <>
                {postStep === "paste" && pathMode === "recording" ? (
                  <button
                    type="button"
                    className="text-[11px] text-sky-700 hover:underline"
                    onClick={() => setPathMode("choose")}
                  >
                    ← {t.pathBackChoice}
                  </button>
                ) : null}

                {postStep === "assign" ? (
                  <MeetingMatchSourceSwitch
                    tencentReady={Boolean(meeting.tencentLiveNotes)}
                    xfyunReady={Boolean(meeting.xfyunLiveNotes)}
                    matchSource={meeting.matchSource}
                    busy={busy}
                    onSwitch={(source) =>
                      run(async () => {
                        const res = await switchMatchSourceAction(meeting.id, source);
                        if (res.error) {
                          flash(undefined, res.error);
                          return;
                        }
                        const notes =
                          source === "tencent"
                            ? (meeting.tencentLiveNotes ?? "")
                            : (meeting.xfyunLiveNotes ?? "");
                        setLiveNotes(notes);
                        setTranscript(
                          source === "tencent"
                            ? (meeting.tencentTranscriptText ?? transcript)
                            : (meeting.xfyunTranscriptText ?? transcript),
                        );
                        setMeeting((m) => ({ ...m, matchSource: source, liveNotes: notes }));
                        applySegmentsToDrafts(
                          parsePartnerSectionsFromLiveNotes(notes, meeting.items),
                          setMatchDrafts,
                          setUnassignedDraft,
                        );
                        lockAssignStep.current = true;
                        setPathMode("recording");
                        setPostStep("assign");
                        flash(source === "tencent" ? t.switchedTencent : t.switchedXfyun);
                      }, { refresh: false })
                    }
                  />
                ) : null}

                <PostMinutesDualPath
                  phase={phase}
                  postStep={postStep === "assign" ? "assign" : "paste"}
                  transcript={
                    meeting.matchSource === "xfyun" && meeting.tencentTranscriptText
                      ? meeting.tencentTranscriptText
                      : transcript
                  }
                  liveNotes={liveNotes}
                  busy={busy}
                  workStage={workStage}
                  onTranscriptChange={setTranscript}
                  onMatch={() =>
                    run(async () => {
                      setWorkStage("saving");
                      const matchingTimer = window.setTimeout(
                        () => setWorkStage("matching"),
                        400,
                      );
                      try {
                        const res = await matchMeetingMinutesAction(meeting.id, transcript);
                        if (res.error) {
                          setWorkStage("idle");
                          flash(undefined, res.error);
                          return;
                        }
                        if (res.liveNotes) {
                          setLiveNotes(res.liveNotes);
                          setMeeting((m) => ({
                            ...m,
                            matchSource: "tencent",
                            tencentTranscriptText: transcript,
                            tencentLiveNotes: res.liveNotes ?? null,
                            liveNotes: res.liveNotes ?? null,
                          }));
                          applySegmentsToDrafts(
                            parsePartnerSectionsFromLiveNotes(res.liveNotes, meeting.items),
                            setMatchDrafts,
                            setUnassignedDraft,
                          );
                        }
                        setProposal(null);
                        setConfirmDrafts({});
                        lockAssignStep.current = true;
                        setPathMode("recording");
                        setPostStep("assign");
                        setWorkStage("done");
                        flash(`${matchMethodFlash(res.matchMethod, t)} (${t.sourceTencent})`);
                        requestAnimationFrame(() => {
                          document.getElementById("assignment-timeline")?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        });
                      } finally {
                        window.clearTimeout(matchingTimer);
                      }
                    }, { refresh: false })
                  }
                  onRematch={() => {
                    lockAssignStep.current = true;
                    setPathMode("recording");
                    setPostStep("assign");
                    setProposal(null);
                    setConfirmDrafts({});
                    setWorkStage("idle");
                    flash(t.postAssignHint);
                    requestAnimationFrame(() => {
                      document.getElementById("assignment-timeline")?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    });
                  }}
                  pathB={
                    <MeetingPathBPanel title={t.pathBTitle} hint={t.pathBHint}>
                      <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2 text-[11px] text-slate-600 space-y-1">
                        <p>
                          {t.status}{" "}
                          <span className="font-medium text-slate-800">
                            {meeting.transcriptStatus || "idle"}
                          </span>
                          {meeting.recordingBytes
                            ? ` · ${formatMsg(t.recordingSize, {
                                n: (meeting.recordingBytes / 1024 / 1024).toFixed(1),
                              })}`
                            : ""}
                        </p>
                        {meeting.recordingStartedAt ? (
                          <p>
                            {formatMsg(t.recordingStarted, {
                              time: new Date(meeting.recordingStartedAt).toLocaleString(),
                            })}
                          </p>
                        ) : (
                          <p className="text-amber-800">{t.noRecordingHint}</p>
                        )}
                        {meeting.transcriptError ? (
                          <p className="text-red-600">{meeting.transcriptError}</p>
                        ) : null}
                      </div>
                      {(meeting.xfyunTranscriptText || "").trim() ? (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                            {formatMsg(t.pathBPreview, {
                              n: (meeting.xfyunTranscriptText || "").trim().length,
                            })}
                          </summary>
                          <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-100 bg-white px-2 py-1.5 font-mono text-[11px]">
                            {(meeting.xfyunTranscriptText || "").trim().slice(0, 4000)}
                            {(meeting.xfyunTranscriptText || "").trim().length > 4000
                              ? "…"
                              : ""}
                          </pre>
                        </details>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={
                            busy ||
                            !(
                              meeting.xfyunTranscriptText?.trim() ||
                              meeting.transcriptStatus === "ready"
                            )
                          }
                          onClick={() =>
                            run(async () => {
                              setWorkStage("matching");
                              try {
                                const res = await matchXfyunMinutesAction(meeting.id);
                                if (res.error) {
                                  setWorkStage("idle");
                                  flash(undefined, res.error);
                                  return;
                                }
                                if (res.liveNotes) {
                                  setLiveNotes(res.liveNotes);
                                  setTranscript(meeting.xfyunTranscriptText ?? transcript);
                                  setMeeting((m) => ({
                                    ...m,
                                    matchSource: "xfyun",
                                    xfyunLiveNotes: res.liveNotes ?? null,
                                    liveNotes: res.liveNotes ?? null,
                                  }));
                                  applySegmentsToDrafts(
                                    parsePartnerSectionsFromLiveNotes(
                                      res.liveNotes,
                                      meeting.items,
                                    ),
                                    setMatchDrafts,
                                    setUnassignedDraft,
                                  );
                                }
                                setProposal(null);
                                setConfirmDrafts({});
                                lockAssignStep.current = true;
                                setPathMode("recording");
                                setPostStep("assign");
                                setWorkStage("done");
                                flash(
                                  `${matchMethodFlash(res.matchMethod, t)} (${t.sourceXfyun})`,
                                );
                                requestAnimationFrame(() => {
                                  document
                                    .getElementById("assignment-timeline")
                                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                                });
                              } catch (e) {
                                setWorkStage("idle");
                                flash(undefined, e instanceof Error ? e.message : String(e));
                              }
                            }, { refresh: false })
                          }
                          className="rounded-lg bg-emerald-700 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-800 disabled:opacity-40"
                        >
                          {meeting.xfyunLiveNotes ? t.rematchXfyun : t.matchXfyun}
                        </button>
                        {!(
                          meeting.xfyunTranscriptText?.trim() ||
                          meeting.transcriptStatus === "ready"
                        ) ? (
                          <span className="text-[11px] text-slate-400 self-center">
                            {t.needRecording}
                          </span>
                        ) : null}
                      </div>
                    </MeetingPathBPanel>
                  }
                />
              </>
            )}
          </>
        ) : null}

        {onSummaryStep ? (
          <p className="text-[11px] text-slate-500">{t.goToReportHint}</p>
        ) : null}

        {onReportStep ? (
          <p className="text-[11px] text-slate-500">{t.reportStepOnly}</p>
        ) : null}
      </div>
    ) : null;

  return (
    <MeetingShell
      phase={phase as MeetingPhase}
      status={meeting.status}
      busy={busy}
      hasPrep={!needsPrep}
      currentDiscussTitle={
        currentDiscussItem
          ? formatMsg(t.currentPartner, { name: currentDiscussItem.partnerName })
          : null
      }
      previewToken={meeting.previewToken}
      resolvePreviewPath={async () => {
        if (meeting.previewToken) return `/partner-reviews/preview/${meeting.previewToken}`;
        const res = await getMeetingPreviewPathAction(meeting.id);
        if (!res.ok || !res.path) return null;
        return res.path;
      }}
      shareMode="prep-only"
      onPrep={runPrep}
      onStart={() =>
        run(async () => {
          const res = await startPartnerReviewMeetingAction(meeting.id);
          if (res.error) flash(undefined, res.error);
          else {
            setMeeting((m) => ({ ...m, status: "LIVE", startedAt: new Date().toISOString() }));
            flash(t.started);
          }
        }, { refresh: false })
      }
      onEnd={() =>
        run(async () => {
          const res = await endPartnerReviewMeetingAction(meeting.id);
          if (res.error) flash(undefined, res.error);
          else {
            setMeeting((m) => ({ ...m, status: "PROCESSING", endedAt: new Date().toISOString() }));
            setPostStep("paste");
            setPathMode("choose");
            flash(t.ended);
          }
        }, { refresh: false })
      }
      onResetToPrep={
        phase === "post" && meeting.status === "PROCESSING"
          ? () => {
              if (!window.confirm(t.resetConfirm)) return;
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
                  setPathMode("choose");
                  setWorkStage("idle");
                  lockAssignStep.current = false;
                  setMatchDrafts({});
                  setUnassignedDraft("");
                  setCurrentDiscussItemId(null);
                  setConfirmDrafts({});
                  flash(t.resetDone);
                }
              }, { refresh: false });
            }
          : undefined
      }
      flashOk={message}
      flashError={error}
      recordingSlot={recordingSlot}
      postSlot={postSlot}
    >
      {phase === "prep" ? (
        <p className="text-xs text-slate-500 leading-relaxed">{t.prepHint}</p>
      ) : null}

      {phase === "post" && postStep === "assign" ? (
        <AssignmentTimelinePanel
          items={orderedForTimeline}
          matchDrafts={matchDrafts}
          unassignedDraft={unassignedDraft}
          busy={busy}
          workStage={workStage}
          statusMessage={error || message}
          statusIsError={!!error}
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
                segmentsFromDrafts(orderedForTimeline, matchDrafts, unassignedDraft),
              );
              await saveMatchedNotesAction(meeting.id, notes);
              setLiveNotes(notes);
              flash("Ownership saved (not extracted yet)");
            }, { refresh: false })
          }
          onConfirmExtract={() =>
            run(async () => {
              setWorkStage("extracting");
              flash(t.workExtracting);
              try {
                const notes = buildLiveNotesFromSegments(
                  segmentsFromDrafts(orderedForTimeline, matchDrafts, unassignedDraft),
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
                  const proposal = res.proposal;
                  setProposal(proposal);
                  setConfirmDrafts(draftsFromProposal(proposal));
                  setMeeting((m) => ({
                    ...m,
                    status: "PROCESSING",
                    items: m.items.map((it) => {
                      const row = proposal.items.find((p) => p.itemId === it.id);
                      if (!row) return it;
                      return {
                        ...it,
                        coreNotes: row.coreNotes || null,
                        todoDrafts: row.todos.map((todo, i) => ({
                          id: `local-${it.id}-${i}`,
                          title: todo.title,
                          detail: todo.detail ?? null,
                          dueDate: todo.dueDate ?? null,
                          confirmed: false,
                        })),
                      };
                    }),
                  }));
                  lockAssignStep.current = false;
                  setPostStep("extract");
                  const first =
                    proposal.items.find((it) => it.coreNotes.trim() || it.todos.length) ??
                    proposal.items[0];
                  if (first) setActiveItemId(first.itemId);
                }
                setWorkStage("done");
                flash("Partner progress and todo drafts are ready. Review them in both panels, then save.");
                requestAnimationFrame(() => {
                  document.getElementById("post-extract-workspace")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                });
                router.refresh();
              } catch (e) {
                setWorkStage("idle");
                flash(undefined, e instanceof Error ? e.message : String(e));
              }
            }, { refresh: false })
          }
        />
      ) : null}

      {showMain ? (
        <div id="post-extract-workspace" className="space-y-3">
          {onSummaryStep ? (
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3">
              <p className="text-sm font-semibold text-violet-950">{t.extractTitle}</p>
              <p className="mt-1 text-[11px] text-violet-900/80 leading-relaxed">
                {t.extractHint}
              </p>
            </div>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]">
            <MeetingAgendaPanel
              phase={phase as MeetingPhase}
              items={agendaItems}
              activeId={activeItemId}
              currentDiscussId={currentDiscussItemId}
              markJustAt={markJustAt}
              onSelect={(item) => setActiveItemId(item.id)}
              onDiscuss={(item) => markPartnerDiscuss(item.id, item.partnerName)}
              renderMeta={(item) => (
                <>
                  {item.partnerTier ? ` · Tier ${item.partnerTier}` : ""}
                  {currentDiscussItemId === item.id &&
                  phase === "live" &&
                  item.markerInsertedAt &&
                  meeting.startedAt ? (
                    <span className="ml-1 font-mono text-emerald-700">
                      · {formatRelativeMeetingTime(item.markerInsertedAt, meeting.startedAt)}
                    </span>
                  ) : null}
                </>
              )}
              footer={
                <>
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
                        flash(formatMsg(t.addedPartners, { n: items.length }));
                      }}
                      onError={(err) => flash(undefined, err)}
                    />
                  )}
                </>
              }
            />

            <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 min-h-[320px] max-h-[78vh] overflow-y-auto">
              {!activeItem ? (
                <p className="text-sm text-slate-400">{t.noPartnerSelected}</p>
              ) : (
                <>
                  <PartnerDetailHeader activeItem={activeItem} phase={phase} />
                  {phase === "done" ? (
                    <ConfirmedHistoryPanel item={activeItem} part="left" />
                  ) : (
                    <>
                      {!activeItem.prepBrief && canRunPrep ? (
                        <div className="rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-3 space-y-2">
                          <p className="text-sm text-slate-700">{t.briefExplain}</p>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={runPrep}
                            className="rounded-lg bg-sky-700 text-white px-3 py-1.5 text-sm hover:bg-sky-800 disabled:opacity-40"
                          >
                            {t.generateBrief}
                          </button>
                        </div>
                      ) : null}
                      {postConfirmReady ? (
                        <PostConfirmPanel
                          item={activeItem}
                          draft={confirmDrafts[activeItem.id]}
                          onChange={(d) =>
                            setConfirmDrafts((prev) => ({ ...prev, [activeItem.id]: d }))
                          }
                          proposalItem={proposal?.items.find((p) => p.itemId === activeItem.id)}
                          part="left"
                        />
                      ) : activeItem.prepBrief ? (
                        <PrepBriefOverview
                          brief={activeItem.prepBrief}
                          mossConfigured={mossConfigured}
                        />
                      ) : phase === "post" && postStep === "assign" ? (
                        <p className="text-xs text-slate-400">{t.needAssignProgress}</p>
                      ) : phase === "post" ? (
                        <p className="text-xs text-slate-400">{t.needMatchProgress}</p>
                      ) : null}
                    </>
                  )}
                </>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 min-h-[320px] max-h-[78vh] overflow-y-auto">
              {!activeItem ? (
                <p className="text-sm text-slate-400">{t.noBriefActivity}</p>
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
                          onChange={(d) =>
                            setConfirmDrafts((prev) => ({ ...prev, [activeItem.id]: d }))
                          }
                          proposalItem={proposal?.items.find((p) => p.itemId === activeItem.id)}
                          part="right"
                        />
                      ) : activeItem.prepBrief ? (
                        <PrepBriefActivity brief={activeItem.prepBrief} />
                      ) : phase === "post" && postStep === "assign" ? (
                        <p className="text-xs text-slate-400">{t.needAssignTodos}</p>
                      ) : phase === "post" ? (
                        <p className="text-xs text-slate-400">{t.needMatchTodos}</p>
                      ) : (
                        <p className="text-xs text-slate-400">{t.noBriefActivity}</p>
                      )}
                    </>
                  )}
                </>
              )}
            </section>
          </div>

          {onSummaryStep ? (
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                disabled={!Object.keys(confirmDrafts).length}
                onClick={() => setPostStep("report")}
                className="rounded-lg bg-violet-700 text-white px-4 py-2 text-sm font-medium hover:bg-violet-800 disabled:opacity-40"
              >
                {t.goToReport}
              </button>
              <button
                type="button"
                className="text-[11px] text-sky-700 hover:underline"
                onClick={() => {
                  setPostStep("paste");
                  setPathMode("choose");
                }}
              >
                ← {t.pathBackChoice}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {onReportStep ? (
        <>
          <FinalReportPanel
            meeting={meeting}
            confirmDrafts={
              Object.keys(confirmDrafts).length
                ? confirmDrafts
                : emptyManualDrafts(meeting.items)
            }
            proposal={proposal}
            busy={busy}
            onConfirmAll={() =>
              run(async () => {
                const drafts =
                  Object.keys(confirmDrafts).length > 0
                    ? confirmDrafts
                    : emptyManualDrafts(meeting.items);
                const items: ConfirmItemPayload[] = meeting.items.map((it) => {
                  const d = drafts[it.id] ?? emptyManualDrafts([it])[it.id]!;
                  return {
                    itemId: it.id,
                    coreNotes: d.coreNotes,
                    businessRecordTitle: d.businessRecordTitle,
                    businessRecordContent: d.skipBusinessRecord
                      ? d.coreNotes
                      : d.businessRecordContent || d.coreNotes,
                    skipBusinessRecord: d.skipBusinessRecord,
                    todos: d.todos.map((todo) => ({
                      id: todo.id,
                      title: todo.title,
                      detail: todo.detail,
                      dueDate: todo.dueDate || null,
                      include: todo.include,
                    })),
                  };
                });
                const res = await confirmMeetingItemsAction(meeting.id, items);
                if (res.error) flash(undefined, res.error);
                else {
                  flash(
                    `Saved ${res.results?.length ?? 0} partners · meeting report added to history`,
                  );
                  setMeeting((m) => ({
                    ...m,
                    status: "DONE",
                    items: m.items.map((it) => {
                      const d = drafts[it.id];
                      if (!d) return { ...it, status: "CONFIRMED" };
                      const todos = d.todos
                        .filter((todo) => todo.include && todo.title.trim())
                        .map((todo) => ({
                          title: todo.title.trim(),
                          detail: todo.detail?.trim() || null,
                          dueDate: todo.dueDate || null,
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
          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="button"
              className="text-[11px] text-sky-700 hover:underline"
              onClick={() => setPostStep("extract")}
            >
              ← {t.extractTitle}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={finishWithoutSummary}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {t.finishWithoutExtract}
            </button>
            <p className="text-[11px] text-slate-400">{t.finishWithoutExtractHint}</p>
          </div>
        </>
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
    </MeetingShell>
  );
}

function AssignmentTimelinePanel({
  items,
  matchDrafts,
  unassignedDraft,
  busy,
  workStage,
  statusMessage,
  statusIsError,
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
  statusMessage?: string | null;
  statusIsError?: boolean;
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
  const t = useMessages().partnerReview;
  const extracting = busy && workStage === "extracting";
  const [editRaw, setEditRaw] = useState<Record<string, boolean>>({});
  const [activeNavId, setActiveNavId] = useState<string | null>(items[0]?.id ?? null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const unassignedTurns = splitTranscriptTurns(unassignedDraft);

  function jumpToPartner(itemId: string) {
    setActiveNavId(itemId);
    setMobileNavOpen(false);
    document.getElementById(`assign-partner-${itemId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  // 滚动时高亮侧栏当前伙伴（fixed 侧栏不受页面 overflow 影响）
  useEffect(() => {
    const nodes = items
      .map((it) => document.getElementById(`assign-partner-${it.id}`))
      .filter((el): el is HTMLElement => !!el);
    if (!nodes.length) return;
    const ratios = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          ratios.set(e.target.id.replace("assign-partner-", ""), e.intersectionRatio);
        }
        let bestId: string | null = null;
        let best = 0;
        for (const [id, r] of ratios) {
          if (r > best) {
            best = r;
            bestId = id;
          }
        }
        if (bestId) setActiveNavId(bestId);
      },
      { root: null, rootMargin: "-15% 0px -55% 0px", threshold: [0, 0.15, 0.35, 0.55, 0.75] },
    );
    for (const n of nodes) io.observe(n);
    return () => io.disconnect();
  }, [items]);

  const navList = (
    <ul className="space-y-0.5">
      {items.map((it, idx) => {
        const hasText = !!(matchDrafts[it.partnerId] ?? "").trim();
        const active = activeNavId === it.id;
        return (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => jumpToPartner(it.id)}
              className={`flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] leading-snug transition-colors ${
                active
                  ? "bg-sky-100 text-sky-950 ring-1 ring-sky-300"
                  : hasText
                    ? "text-slate-800 hover:bg-slate-50"
                    : "text-slate-400 hover:bg-slate-50"
              }`}
              title={it.partnerName}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                  active ? "bg-sky-600 text-white" : hasText ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-400"
                }`}
              >
                {idx + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 font-medium">{it.partnerName}</span>
                {!hasText ? (
                  <span className="mt-0.5 block text-[10px] text-slate-400">{t.noContent}</span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section
      id="assignment-timeline"
      className="rounded-xl border-2 border-amber-300 bg-amber-50/30 p-4 pb-28 space-y-4 shadow-sm lg:pr-52"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">{t.assignTitle}</div>
          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
            {t.assignHint}
          </p>
        </div>
        {extracting ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-800">
            <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
            {workStageLabel("extracting", t)}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-amber-900 bg-amber-100 border border-amber-200 rounded-full px-2.5 py-1">
            {t.requiredStep}
          </span>
        )}
      </div>

      {/* 桌面：视口固定侧栏（不受页面 overflow 影响） */}
      <aside
        className="fixed right-3 top-20 z-40 hidden w-44 flex-col rounded-xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur lg:flex"
        style={{ maxHeight: "calc(100vh - 9.5rem)" }}
        aria-label={t.partnerDirectory}
      >
        <div className="shrink-0 border-b border-slate-100 px-3 py-2">
          <p className="text-[11px] font-semibold text-slate-800">{t.partnerDirectory}</p>
          <p className="text-[10px] text-slate-400">{formatMsg(t.directoryVisible, { n: items.length })}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">{navList}</div>
      </aside>

      {/* 移动：底部唤起目录 */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileNavOpen((v) => !v)}
          className="fixed bottom-[4.75rem] right-3 z-40 rounded-full border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-800 shadow-lg"
        >
          {mobileNavOpen ? t.collapseDirectory : t.partnerDirectory}
        </button>
        {mobileNavOpen ? (
          <div className="fixed inset-x-3 bottom-[7.5rem] z-40 max-h-[50vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            <p className="px-2 py-1 text-[11px] font-semibold text-slate-700">{t.jumpPartner}</p>
            {navList}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-900">
              —
            </span>
            <p className="text-xs font-medium text-amber-900">{t.unassigned}</p>
          </div>
          <button
            type="button"
            disabled={extracting}
            onClick={() => setEditRaw((p) => ({ ...p, __unassigned: !p.__unassigned }))}
            className="text-[11px] text-slate-500 underline-offset-2 hover:underline disabled:opacity-40"
          >
            {editRaw.__unassigned ? t.adjustTurns : t.editFull}
          </button>
        </div>
        {editRaw.__unassigned ? (
          <textarea
            value={unassignedDraft}
            onChange={(e) => onChangeUnassigned(e.target.value)}
            rows={3}
            disabled={extracting}
            placeholder={t.unassignedPh}
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
          <p className="text-[11px] text-amber-800/70 px-1">{t.noOpening}</p>
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
            <li
              key={it.id}
              id={`assign-partner-${it.id}`}
              className="relative flex scroll-mt-28 gap-3 pb-5 last:pb-0"
            >
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
                      {formatMsg(t.discussOrder, { n: idx + 1 })}
                      {it.partnerTier ? ` · Tier ${it.partnerTier}` : ""}
                      {hasText ? ` · ${formatMsg(t.turns, { n: turns.length || 1 })}` : ` · ${t.noContent}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={extracting || !hasText || idx === 0}
                      onClick={() => onMergeAdjacent(idx, "up")}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                      title={t.mergePrevious}
                    >
                      {t.mergeUp}
                    </button>
                    <button
                      type="button"
                      disabled={extracting || !hasText || idx === items.length - 1}
                      onClick={() => onMergeAdjacent(idx, "down")}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                      title={t.mergeNext}
                    >
                      {t.mergeDown}
                    </button>
                    <label className="flex items-center gap-1 text-[11px] text-slate-500">
                      {t.reassign}
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
                      {showRaw ? t.adjustTurns : t.editFull}
                    </button>
                  </div>
                </div>
                {showRaw ? (
                  <textarea
                    value={text}
                    onChange={(e) => onChangePartner(it.partnerId, e.target.value)}
                    rows={5}
                    disabled={extracting}
                    placeholder={t.segmentPh}
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
                  <p className="text-[11px] text-slate-400 px-1">{t.noSegment}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-amber-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur lg:left-56">
        {statusMessage ? (
          <p
            className={`mb-2 text-xs ${statusIsError ? "text-red-600" : extracting ? "text-violet-700" : "text-emerald-700"}`}
          >
            {extracting ? (
              <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500 align-middle" />
            ) : null}
            {statusMessage}
          </p>
        ) : null}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onConfirmExtract}
            className="rounded-lg bg-violet-700 text-white px-5 py-2.5 text-sm font-semibold hover:bg-violet-800 disabled:opacity-40"
          >
            {extracting ? workStageLabel("extracting", t) : t.confirmExtract}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onSave}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
          >
            {t.saveOwnership}
          </button>
          <span className="text-[11px] text-slate-500">
            {t.extractHelp}
          </span>
        </div>
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
  const t = useMessages().partnerReview;
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
              onClick={() => onMoveTurns(segmentIdx, 0, ti, "up")}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50 disabled:opacity-25"
              title={t.mergePrevious}
            >
              {t.movePrevious}
            </button>
            <button
              type="button"
              disabled={disabled || !canMoveDown}
              onClick={() => onMoveTurns(segmentIdx, ti, turns.length - 1, "down")}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50 disabled:opacity-25"
              title={t.mergeNext}
            >
              {t.moveNext}
            </button>
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
  const t = useMessages().partnerReview;
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
    onFlash(ok ? t.reportCopied : undefined, ok ? undefined : t.copyFailed);
  }

  async function shareReport() {
    setSharing(true);
    try {
      const res = await getMeetingPreviewPathAction(meeting.id);
      if (!res.path) {
        onFlash(undefined, t.shareUnavailable);
        return;
      }
      const url = `${window.location.origin}${res.path}`;
      setShareUrl(url);
      const ok = await copyTextToClipboard(url);
      onFlash(ok ? t.shareCopied : undefined, ok ? undefined : t.shareManual);
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            {readonly ? t.reportSaved : t.reportTitle}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {t.reportHint}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyReport()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50"
          >
            {t.copyReport}
          </button>
          <button
            type="button"
            disabled={sharing}
            onClick={() => void shareReport()}
            className="rounded-lg border border-sky-200 bg-sky-50 text-sky-900 px-3 py-1.5 text-xs hover:bg-sky-100 disabled:opacity-40"
          >
            {sharing ? t.creatingLink : t.shareLink}
          </button>
          {!readonly && onConfirmAll ? (
            <button
              type="button"
              disabled={busy || !Object.keys(confirmDrafts).length}
              onClick={onConfirmAll}
              className="rounded-lg bg-emerald-700 text-white px-3 py-1.5 text-xs font-medium hover:bg-emerald-800 disabled:opacity-40"
            >
              {t.saveHistory}
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
                  <div className="text-[11px] font-medium text-slate-400">{t.preMeetingSummary}</div>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{it.prepBrief.summaryLine}</p>
                </div>
              ) : null}
              <div className="mt-2">
                <div className="text-[11px] font-medium text-slate-400">{t.progressSummary}</div>
                <p className="text-xs text-slate-800 mt-0.5 leading-relaxed whitespace-pre-wrap">
                  {progress.trim() || t.none}
                </p>
              </div>
              <div className="mt-2">
                <div className="text-[11px] font-medium text-slate-400">{t.followUpTodos}</div>
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
                  <p className="text-xs text-slate-400 mt-0.5">{t.none}</p>
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
  const t = useMessages().partnerReview;
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
          {t.addPartners}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700">{t.addPartnersTitle}</span>
            <button
              type="button"
              className="text-[11px] text-slate-400 hover:text-slate-700"
              onClick={() => {
                setOpen(false);
                setSelected([]);
                setQuery("");
              }}
            >
              {t.close}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {t.addPartnersHint}
          </p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPartnersPh}
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
              <p className="px-2 py-3 text-[11px] text-slate-400">{t.noAvailablePartners}</p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={adding || busy || !selected.length}
            onClick={submit}
            className="w-full rounded-lg bg-sky-700 text-white px-2 py-1.5 text-xs hover:bg-sky-800 disabled:opacity-40"
          >
            {adding ? formatMsg(t.addingPartners, { n: selected.length }) : formatMsg(t.addToAgenda, { n: selected.length || 0 })}
          </button>
        </div>
      )}
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
  const t = useMessages().partnerReview;
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
          ? t.historyConfirmed
          : activeItem.prepBrief?.windowLabel
            ? formatMsg(t.briefWindow, { label: activeItem.prepBrief.windowLabel })
            : t.noBriefYet}
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
  return `+${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
  const t = useMessages().partnerReview;
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
          {t.currentPartnerBanner}
        </p>
        <p className="text-xl font-bold text-emerald-950 mt-0.5">
          {currentDiscussItem.partnerName}
        </p>
        <p className="text-xs text-emerald-800 mt-1">
          {t.timelineOnly} · {rel || t.justMarked}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-amber-800">
        {t.noPartnerBanner}
      </p>
      <p className="text-base font-semibold text-amber-950 mt-0.5">
        {t.markPartnerHint}
      </p>
      <p className="text-xs text-amber-800 mt-1">
        {t.timelineOnly}
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
  const t = useMessages().partnerReview;
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
      <p className="text-xs font-medium text-slate-700">{t.discussionOrder}</p>
      {!compact ? (
        <p className="text-xs text-slate-600 leading-relaxed">
          {t.timelineHint}
        </p>
      ) : null}
      {!marked.length ? (
        <p className="text-[11px] text-slate-400">{t.noMarkers}</p>
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
  VISIT: "Visit",
  TRAINING: "Training",
  NEGOTIATION: "Negotiation",
  DELIVERY: "Delivery",
  RELATIONSHIP: "Relationship",
  OTHER: "Progress",
};

function tidyClientText(text: string) {
  let flat = text.replace(/\s+/g, " ").trim();
  for (let len = 8; len <= 40; len++) {
    flat = flat.replace(new RegExp(`(.{${len}})(\\1)+`, "g"), "$1");
  }
  return flat.replace(/【联系人\s*[^】]+】\s*/g, "").trim();
}

function PrepBriefOverview({
  brief,
  mossConfigured = false,
}: {
  brief: PartnerPrepBrief;
  mossConfigured?: boolean;
}) {
  const t = useMessages().partnerReview;
  return (
    <div className="space-y-4 text-sm">
      {brief.summaryLine ? (
        <p className="text-slate-700 leading-relaxed">{brief.summaryLine}</p>
      ) : null}

      <div>
        <div className="text-xs font-medium text-slate-500 mb-1.5">{t.topics}</div>
        <ul className="list-disc pl-5 space-y-1 text-slate-700">
          {brief.aiTopics.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-xs font-semibold text-slate-700">
            {t.customerOpportunities}
            {brief.customerOpportunities?.length ? (
              <span className="font-normal text-slate-400">
                {" "}
                · {formatMsg(t.activeCount, { n: brief.customerOpportunities.reduce((n, g) => n + g.opportunities.length, 0) })}
              </span>
            ) : null}
          </div>
          <Link
            href={`/partners/${brief.partnerId}`}
            className="text-[11px] text-sky-700 hover:underline shrink-0"
          >
            {t.viewPartner}
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
                  <div className="flex items-center gap-2 shrink-0">
                    {group.customerId !== "__unassigned__" ? (
                      <MossPrepCustomerBadge
                        customerId={group.customerId}
                        customerName={group.customerName}
                        creditCode={group.creditCode}
                        mossFitLevel={group.mossFitLevel}
                        mossSyncedAt={group.mossSyncedAt}
                        configured={mossConfigured}
                      />
                    ) : null}
                    <span className="text-[11px] text-slate-500">{formatMsg(t.opportunityCount, { n: group.opportunities.length })}</span>
                  </div>
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
          <p className="text-xs text-slate-400">{t.noOpportunities}</p>
        )}
      </div>
    </div>
  );
}

function PrepBriefActivity({ brief }: { brief: PartnerPrepBrief }) {
  const t = useMessages().partnerReview;
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
            {t.todoExcerpt}
            {todos.length ? (
              <span className="font-normal text-slate-400">
                {" "}
                · {formatMsg(t.openCount, { n: openCount })}
                {doneCount ? ` · ${formatMsg(t.doneCount, { n: doneCount })}` : ""}
              </span>
            ) : null}
          </div>
          <Link
            href={`/partners/${brief.partnerId}`}
            className="text-[11px] text-sky-700 hover:underline shrink-0"
          >
            {t.managePartner}
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
                    <span className="ml-1.5 text-[11px] text-red-600">{t.overdue}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">{t.noTodos}</p>
        )}
      </div>

      <div>
        <div className="text-xs font-medium text-slate-500 mb-1.5">{t.recentProgress}</div>
        {brief.progress.length ? (
          <ul className="space-y-2.5">
            {brief.progress.slice(0, 8).map((p, i) => {
              const label = p.categoryLabel || CATEGORY_LABEL[p.category] || t.recentProgress;
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
                      <span className="text-[11px] text-sky-700">{formatMsg(t.contact, { name: p.contactName })}</span>
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
          <p className="text-xs text-slate-400">{t.noRecords}</p>
        )}
      </div>
    </div>
  );
}

function ConfirmedHistoryPanel({ item, part }: { item: ReviewItemClient; part: "left" | "right" }) {
  const t = useMessages().partnerReview;
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
          <div className="text-xs font-medium text-slate-500 mb-1">{t.progressSummary}</div>
          <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">
            {snap.coreNotes.trim() || t.none}
          </p>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1">{t.businessRecord}</div>
          {snap.skipBusinessRecord || !snap.wroteBusinessRecord ? (
            <p className="text-xs text-slate-400">{t.noBusinessRecord}</p>
          ) : (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 space-y-1">
              <div className="font-medium text-slate-900">{snap.businessRecordTitle || t.untitled}</div>
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
            {formatMsg(t.confirmedAt, { time: new Date(snap.confirmedAt).toLocaleString() })}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="text-xs font-medium text-slate-500 mb-1">{t.savedTodos}</div>
        {snap.todos.length ? (
          <ul className="space-y-2">
            {snap.todos.map((t, i) => (
              <li key={`${t.title}-${i}`} className="rounded-lg border border-slate-100 px-3 py-2">
                <div className="font-medium text-slate-800">{t.title}</div>
                {t.detail ? <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">{t.detail}</p> : null}
                {t.dueDate ? <p className="text-[11px] text-slate-400 mt-1">{formatMsg(t.dueDate, { date: t.dueDate.slice(0, 10) })}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">{t.none}</p>
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
  const t = useMessages().partnerReview;
  const d =
    draft ??
    ({
      coreNotes: proposalItem?.coreNotes || item.coreNotes || "",
      businessRecordTitle: proposalItem?.businessRecordTitle || `${item.partnerName} partner review discussion`,
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
        <div className="text-xs font-medium text-slate-700">{t.todoEditTitle}</div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">{t.todoEditHint}</span>
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
              {t.addTodo}
            </button>
          </div>
          {d.todos.map((todo, idx) => (
            <div key={todo.id ?? idx} className="rounded-lg border border-slate-100 p-2 space-y-1">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={todo.include}
                  onChange={(e) => {
                    const todos = [...d.todos];
                    todos[idx] = { ...todo, include: e.target.checked };
                    onChange({ ...d, todos });
                  }}
                />
                {t.include}
              </label>
              <input
                value={todo.title}
                onChange={(e) => {
                  const todos = [...d.todos];
                  todos[idx] = { ...todo, title: e.target.value };
                  onChange({ ...d, todos });
                }}
                placeholder={t.todoTitlePh}
                className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
              />
              <input
                value={todo.detail}
                onChange={(e) => {
                  const todos = [...d.todos];
                  todos[idx] = { ...todo, detail: e.target.value };
                  onChange({ ...d, todos });
                }}
                placeholder={t.todoDetailPh}
                className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
              />
              <input
                type="date"
                value={todo.dueDate}
                onChange={(e) => {
                  const todos = [...d.todos];
                  todos[idx] = { ...todo, dueDate: e.target.value };
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
      <div className="text-xs font-medium text-slate-700">{t.progressEditTitle}</div>
      {proposalItem ? (
        <details className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
          <summary className="text-[11px] font-medium text-slate-600 cursor-pointer">
            {t.viewMatched}
            <span className="font-normal text-slate-400"> · {segmentChars}</span>
          </summary>
          {segmentChars ? (
            <p className="mt-2 text-xs text-slate-600 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
              {segmentPreview}
              {segmentChars > segmentPreview.length ? "…" : ""}
            </p>
          ) : (
            <p className="mt-2 text-xs text-amber-800">
              {t.noAssignedSegment}
            </p>
          )}
        </details>
      ) : null}
      <label className="block space-y-1">
        <span className="text-[11px] text-slate-400">{t.progressRecordHint}</span>
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
          placeholder={t.progressPh}
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
        {t.writeBusinessRecord}
      </label>
    </div>
  );
}
