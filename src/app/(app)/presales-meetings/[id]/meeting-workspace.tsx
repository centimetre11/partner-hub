"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MeetingAgendaPanel,
  MeetingAssignmentTimeline,
  MeetingLiveRecording,
  MeetingMatchSourceSwitch,
  MeetingPathBPanel,
  MeetingPostStepIndicator,
  MeetingShell,
  PostMinutesDualPath,
  meetingPhaseFromStatus,
  orderAgendaByDiscussTime,
  type MeetingAgendaItemBase,
  type MeetingPostStep,
  type MeetingWorkStage,
} from "@/components/meeting";
import {
  confirmPresalesItemsAction,
  endPresalesMeetingAction,
  extractPresalesOutcomesAction,
  matchPresalesMinutesAction,
  matchPresalesXfyunAction,
  resetPresalesMeetingToPrepAction,
  runPresalesPrepAction,
  savePresalesMatchedNotesAction,
  startPresalesMeetingAction,
  switchPresalesMatchSourceAction,
} from "@/lib/presales-meeting/actions";
import {
  buildPresalesFinalReportMarkdown,
  reportRowFromPresalesItem,
} from "@/lib/presales-meeting/final-report";
import type { MeetingClient, MeetingItemClient } from "@/lib/presales-meeting/meeting-client";
import type { ConfirmItemPayload, PrepFacts } from "@/lib/presales-meeting/types";
import {
  buildLiveNotesFromSegments,
  parseItemSectionsFromLiveNotes,
} from "@/lib/presales-meeting/markers";
import type { SplitProposal } from "@/lib/presales-meeting/split-types";
import { CreateTodoDrawer } from "@/components/create-todo-drawer";
import { CreateProjectWorkLogButton } from "@/components/create-project-work-log-button";
import { BusinessRecordDialogButton } from "@/components/business-records-section";
import { TodoCompleteButton } from "@/components/todo-complete-dialog";
import { encodeTodoOwnerRef } from "@/lib/todo-owner-select";
import type { OwnerRef } from "@/lib/owner";
import { categoryLabel, tidyProgressText } from "@/lib/partner-review/brief-text";
import { Badge } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";
import { useMessages } from "@/lib/i18n/context";
import { formatMsg } from "@/lib/i18n/messages";
import {
  defaultFactsRangeDates,
  formatFactsRangeLabel,
  toDateInputValue,
} from "@/lib/presales-meeting/facts-range";
import { DeletePresalesMeetingButton } from "../delete-meeting-button";

type TodoOption = { id: string; name: string };

function todoDefaultsForItem(item: MeetingItemClient): {
  defaultOwnerRef: string;
  defaultLink: string;
} {
  if (item.subjectKind === "PARTNER" && item.partnerId) {
    return {
      defaultOwnerRef: encodeTodoOwnerRef("partner", item.partnerId),
      defaultLink: "",
    };
  }
  if (item.customerId) {
    return {
      defaultOwnerRef: encodeTodoOwnerRef("customer", item.customerId),
      defaultLink: item.projectId
        ? `proj:${item.projectId}`
        : item.opportunityId
          ? `opp:${item.opportunityId}`
          : "",
    };
  }
  if (item.partnerId) {
    return {
      defaultOwnerRef: encodeTodoOwnerRef("partner", item.partnerId),
      defaultLink: item.opportunityId ? `opp:${item.opportunityId}` : "",
    };
  }
  return { defaultOwnerRef: "", defaultLink: "" };
}

type ConfirmDraft = {
  coreNotes: string;
  businessRecordTitle: string;
  businessRecordContent: string;
  skipBusinessRecord: boolean;
  projectWorkLogContent: string;
  skipProjectWorkLog: boolean;
  todos: {
    id?: string;
    title: string;
    detail: string;
    dueDate: string;
    include: boolean;
  }[];
};

function draftsFromProposal(proposal: SplitProposal): Record<string, ConfirmDraft> {
  const out: Record<string, ConfirmDraft> = {};
  for (const row of proposal.items) {
    out[row.itemId] = {
      coreNotes: row.coreNotes,
      businessRecordTitle: row.businessRecordTitle,
      businessRecordContent: row.businessRecordContent,
      skipBusinessRecord: false,
      projectWorkLogContent: row.projectWorkLogContent,
      skipProjectWorkLog: false,
      todos: row.todos.map((t) => ({
        title: t.title,
        detail: t.detail ?? "",
        dueDate: t.dueDate ?? "",
        include: true,
      })),
    };
  }
  return out;
}

function emptyManualDrafts(items: MeetingItemClient[]): Record<string, ConfirmDraft> {
  const out: Record<string, ConfirmDraft> = {};
  for (const it of items) {
    const subject =
      it.customerName || it.partnerName || it.projectName || it.opportunityName || "售前";
    out[it.id] = {
      coreNotes: "",
      businessRecordTitle: `${subject} 售前讨论`,
      businessRecordContent: "",
      skipBusinessRecord: false,
      projectWorkLogContent: "",
      skipProjectWorkLog: !it.projectId,
      todos: [],
    };
  }
  return out;
}

function initialPresalesPostStep(meeting: MeetingClient): MeetingPostStep {
  if (meeting.items.some((it) => it.coreNotes?.trim() || it.confirmedSnapshot)) {
    return "extract";
  }
  if (meeting.liveNotes?.trim()) return "assign";
  return "paste";
}

export function PresalesMeetingWorkspace({
  initial,
  prepFactsByItemId,
  todoContext,
}: {
  initial: MeetingClient;
  prepFactsByItemId: Record<string, PrepFacts>;
  todoContext: {
    currentUserId: string;
    users: TodoOption[];
    partners: TodoOption[];
    customers: TodoOption[];
  };
}) {
  const m = useMessages().presalesMeeting;
  const router = useRouter();
  const [meeting, setMeeting] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [flashOk, setFlashOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState(initial.items[0]?.id ?? null);
  const [currentDiscussId, setCurrentDiscussId] = useState<string | null>(
    initial.items.find((it) => it.status === "DISCUSSED")?.id ?? null,
  );
  const [markJustAt, setMarkJustAt] = useState(0);
  const [postStep, setPostStep] = useState<MeetingPostStep>(() =>
    initialPresalesPostStep(initial),
  );
  /** paste 阶段：尚未选路径 / 已选录音路径 */
  const [pathMode, setPathMode] = useState<"choose" | "recording">(() =>
    initial.liveNotes?.trim() ? "recording" : "choose",
  );
  const [workStage, setWorkStage] = useState<MeetingWorkStage>("idle");
  const [transcript, setTranscript] = useState(
    initial.tencentTranscriptText ?? initial.transcriptText ?? "",
  );
  const [liveNotes, setLiveNotes] = useState(initial.liveNotes ?? "");
  const [matchDrafts, setMatchDrafts] = useState<Record<string, string>>({});
  const [unassignedDraft, setUnassignedDraft] = useState("");
  const [confirmDrafts, setConfirmDrafts] = useState<Record<string, ConfirmDraft>>({});
  const lockAssign = useRef(false);

  const phase = meetingPhaseFromStatus(meeting.status);
  const active = meeting.items.find((it) => it.id === activeId) ?? meeting.items[0] ?? null;
  const facts = active ? prepFactsByItemId[active.id] : null;
  const activeTodoDefaults = active ? todoDefaultsForItem(active) : null;

  const agendaItems: (MeetingAgendaItemBase & MeetingItemClient)[] = useMemo(
    () => meeting.items.map((it) => ({ ...it, title: it.label })),
    [meeting.items],
  );

  const orderedForTimeline = useMemo(
    () => orderAgendaByDiscussTime(agendaItems),
    [agendaItems],
  );

  function flash(ok?: string, err?: string) {
    setFlashOk(ok ?? null);
    setError(err ?? null);
  }

  function run(fn: () => Promise<{ error?: string } | void>, opts?: { refresh?: boolean }) {
    startTransition(() => {
      void (async () => {
        try {
          const res = await fn();
          if (res && "error" in res && res.error) flash(undefined, res.error);
          else if (opts?.refresh !== false) router.refresh();
        } catch (e) {
          flash(undefined, e instanceof Error ? e.message : String(e));
        }
      })();
    });
  }

  function syncAssignFromNotes(notes: string) {
    const segs = parseItemSectionsFromLiveNotes(
      notes,
      meeting.items.map((it) => ({ itemId: it.id, label: it.label })),
    );
    const drafts: Record<string, string> = {};
    let unassigned = "";
    for (const seg of segs) {
      if (seg.partnerId) drafts[seg.partnerId] = seg.text;
      else if (seg.text.trim()) unassigned = unassigned ? `${unassigned}\n\n${seg.text}` : seg.text;
    }
    setMatchDrafts(drafts);
    setUnassignedDraft(unassigned);
  }

  async function markDiscuss(itemId: string) {
    const res = await fetch(`/api/presales-meetings/${meeting.id}/discuss-item`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    const data = (await res.json()) as { error?: string; label?: string };
    if (!res.ok || data.error) {
      flash(undefined, data.error ?? "discuss failed");
      return;
    }
    setCurrentDiscussId(itemId);
    setMarkJustAt(Date.now());
    setMeeting((prev) => ({
      ...prev,
      status: "LIVE",
      items: prev.items.map((it) =>
        it.id === itemId
          ? {
              ...it,
              status: it.status === "CONFIRMED" ? "CONFIRMED" : "DISCUSSED",
              discussedAt: it.discussedAt ?? new Date().toISOString(),
              markerInsertedAt: it.markerInsertedAt ?? new Date().toISOString(),
            }
          : it,
      ),
    }));
  }

  const onPathStep =
    phase === "post" && (postStep === "paste" || postStep === "assign");
  const onSummaryStep = phase === "post" && postStep === "extract";
  const onReportStep = phase === "post" && postStep === "report";

  function goDirectToSummary() {
    setConfirmDrafts(emptyManualDrafts(meeting.items));
    setPathMode("choose");
    setPostStep("extract");
    flash(m.pathDirectAction);
  }

  const postSlot =
    phase === "post" ? (
      <div className="space-y-3">
        <MeetingPostStepIndicator step={postStep} variant="presales" />

        {onPathStep ? (
          <>
            {postStep === "paste" && pathMode === "choose" ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{m.pathChoiceTitle}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{m.pathChoiceHint}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setPathMode("recording")}
                    className="rounded-xl border-2 border-sky-200 bg-sky-50/50 p-4 text-left hover:border-sky-400 hover:bg-sky-50"
                  >
                    <div className="text-sm font-semibold text-slate-900">
                      {m.pathRecordingTitle}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                      {m.pathRecordingHint}
                    </p>
                    <span className="inline-block mt-3 text-xs font-medium text-sky-800">
                      {m.pathRecordingAction} →
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={goDirectToSummary}
                    className="rounded-xl border-2 border-slate-200 bg-white p-4 text-left hover:border-slate-400 hover:bg-slate-50"
                  >
                    <div className="text-sm font-semibold text-slate-900">
                      {m.pathDirectTitle}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                      {m.pathDirectHint}
                    </p>
                    <span className="inline-block mt-3 text-xs font-medium text-slate-800">
                      {m.pathDirectAction} →
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
                    ← {m.pathBackChoice}
                  </button>
                ) : null}

                {postStep === "assign" ? (
                  <MeetingMatchSourceSwitch
                    tencentReady={Boolean(meeting.tencentLiveNotes)}
                    xfyunReady={Boolean(meeting.xfyunLiveNotes)}
                    matchSource={meeting.matchSource}
                    busy={pending}
                    onSwitch={(source) =>
                      run(async () => {
                        const res = await switchPresalesMatchSourceAction(meeting.id, source);
                        if (res.error) return res;
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
                        setMeeting((prev) => ({
                          ...prev,
                          matchSource: source,
                          liveNotes: notes,
                        }));
                        syncAssignFromNotes(notes);
                        lockAssign.current = true;
                        setPostStep("assign");
                        return res;
                      }, { refresh: false })
                    }
                  />
                ) : null}

                <PostMinutesDualPath
                  phase={phase}
                  postStep={postStep === "assign" ? "assign" : "paste"}
                  transcript={transcript}
                  liveNotes={liveNotes}
                  busy={pending}
                  workStage={workStage}
                  onTranscriptChange={setTranscript}
                  onMatch={() =>
                    run(async () => {
                      setWorkStage("saving");
                      const timer = window.setTimeout(() => setWorkStage("matching"), 400);
                      try {
                        const res = await matchPresalesMinutesAction(meeting.id, transcript);
                        if (res.error) {
                          setWorkStage("idle");
                          return res;
                        }
                        if (res.liveNotes) {
                          setLiveNotes(res.liveNotes);
                          setMeeting((prev) => ({
                            ...prev,
                            matchSource: "tencent",
                            tencentTranscriptText: transcript,
                            tencentLiveNotes: res.liveNotes ?? null,
                            liveNotes: res.liveNotes ?? null,
                          }));
                          syncAssignFromNotes(res.liveNotes);
                        }
                        lockAssign.current = true;
                        setPathMode("recording");
                        setPostStep("assign");
                        setWorkStage("done");
                        flash(formatMsg(m.matchOk, { method: res.matchMethod ?? "match" }));
                        return res;
                      } finally {
                        window.clearTimeout(timer);
                      }
                    }, { refresh: false })
                  }
                  onRematch={() => {
                    lockAssign.current = true;
                    setPathMode("recording");
                    setPostStep("assign");
                    setConfirmDrafts({});
                    setWorkStage("idle");
                  }}
                  pathB={
                    <MeetingPathBPanel title={m.pathBTitle} hint={m.pathBHint}>
                      {meeting.xfyunTranscriptText?.trim() ? (
                        <>
                          <p className="text-xs text-slate-500">
                            {meeting.xfyunTranscriptText.length} chars
                          </p>
                          <button
                            type="button"
                            disabled={pending || workStage === "matching"}
                            onClick={() =>
                              run(async () => {
                                setWorkStage("matching");
                                try {
                                  const res = await matchPresalesXfyunAction(meeting.id);
                                  if (res.error) {
                                    setWorkStage("idle");
                                    return res;
                                  }
                                  if (res.liveNotes) {
                                    setLiveNotes(res.liveNotes);
                                    setTranscript(meeting.xfyunTranscriptText ?? transcript);
                                    setMeeting((prev) => ({
                                      ...prev,
                                      matchSource: "xfyun",
                                      xfyunLiveNotes: res.liveNotes ?? null,
                                      liveNotes: res.liveNotes ?? null,
                                    }));
                                    syncAssignFromNotes(res.liveNotes);
                                  }
                                  lockAssign.current = true;
                                  setPathMode("recording");
                                  setPostStep("assign");
                                  setWorkStage("done");
                                  flash(
                                    formatMsg(m.matchOk, {
                                      method: res.matchMethod ?? "xfyun",
                                    }),
                                  );
                                  return res;
                                } finally {
                                  setWorkStage("idle");
                                }
                              }, { refresh: false })
                            }
                            className="rounded-lg bg-emerald-700 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-800 disabled:opacity-40"
                          >
                            {meeting.xfyunLiveNotes ? m.rematchXfyun : m.matchXfyun}
                          </button>
                        </>
                      ) : (
                        <p className="text-[11px] text-slate-400">{m.pathBEmpty}</p>
                      )}
                      {meeting.transcriptStatus ? (
                        <p className="text-[11px] text-slate-500">
                          {m.status} {meeting.transcriptStatus}
                        </p>
                      ) : null}
                    </MeetingPathBPanel>
                  }
                />

                {postStep === "assign" ? (
                  <MeetingAssignmentTimeline
                    items={orderedForTimeline}
                    matchDrafts={matchDrafts}
                    unassignedDraft={unassignedDraft}
                    busy={pending}
                    workStage={workStage}
                    statusMessage={error ?? flashOk}
                    statusIsError={Boolean(error)}
                    onChangeItem={(itemId, text) =>
                      setMatchDrafts((prev) => ({ ...prev, [itemId]: text }))
                    }
                    onChangeUnassigned={setUnassignedDraft}
                    onSave={() =>
                      run(async () => {
                        const notes = buildLiveNotesFromSegments([
                          ...(unassignedDraft.trim()
                            ? [{ partnerId: null, partnerName: null, text: unassignedDraft }]
                            : []),
                          ...orderedForTimeline.map((it) => ({
                            partnerId: it.id,
                            partnerName: it.label,
                            text: matchDrafts[it.id] ?? "",
                          })),
                        ]);
                        await savePresalesMatchedNotesAction(meeting.id, notes);
                        setLiveNotes(notes);
                        flash("Ownership saved");
                      }, { refresh: false })
                    }
                    onConfirm={() =>
                      run(async () => {
                        setWorkStage("extracting");
                        try {
                          const notes = buildLiveNotesFromSegments([
                            ...(unassignedDraft.trim()
                              ? [
                                  {
                                    partnerId: null,
                                    partnerName: null,
                                    text: unassignedDraft,
                                  },
                                ]
                              : []),
                            ...orderedForTimeline.map((it) => ({
                              partnerId: it.id,
                              partnerName: it.label,
                              text: matchDrafts[it.id] ?? "",
                            })),
                          ]);
                          await savePresalesMatchedNotesAction(meeting.id, notes);
                          setLiveNotes(notes);
                          const res = await extractPresalesOutcomesAction(meeting.id);
                          if (res.error) {
                            setWorkStage("idle");
                            return res;
                          }
                          if (res.proposal) {
                            setConfirmDrafts(draftsFromProposal(res.proposal));
                            setPostStep("extract");
                            flash(m.extracted);
                          }
                          setWorkStage("done");
                          return res;
                        } catch (e) {
                          setWorkStage("idle");
                          return { error: e instanceof Error ? e.message : String(e) };
                        }
                      }, { refresh: false })
                    }
                  />
                ) : null}
              </>
            )}
          </>
        ) : null}

        {onSummaryStep ? (
          <p className="text-[11px] text-slate-500">{m.goToReportHint}</p>
        ) : null}

        {onReportStep ? (
          <p className="text-[11px] text-slate-500">{m.reportStepOnly}</p>
        ) : null}
      </div>
    ) : null;

  const showMain =
    !(phase === "post" && postStep === "assign") &&
    !(phase === "post" && postStep === "report") &&
    !(phase === "post" && postStep === "paste" && pathMode === "choose");

  return (
    <MeetingShell
      phase={phase}
      status={meeting.status}
      busy={pending}
      hasPrep={Boolean(meeting.prepGeneratedAt) || meeting.status !== "DRAFT"}
      currentDiscussTitle={
        currentDiscussId
          ? (meeting.items.find((it) => it.id === currentDiscussId)?.label ?? null)
          : null
      }
      previewToken={null}
      resolvePreviewPath={async () => null}
      shareMode="none"
      onPrep={() =>
        run(async () => {
          const res = await runPresalesPrepAction(meeting.id);
          if (!res.error) {
            setMeeting((prev) => ({
              ...prev,
              status: prev.status === "DRAFT" ? "PREP" : prev.status,
              prepGeneratedAt: new Date().toISOString(),
            }));
            flash(m.prepReady);
          }
          return res;
        })
      }
      onStart={() =>
        run(async () => {
          const res = await startPresalesMeetingAction(meeting.id);
          if (!res.error) {
            setMeeting((prev) => ({
              ...prev,
              status: "LIVE",
              startedAt: prev.startedAt ?? new Date().toISOString(),
            }));
            flash(m.started);
          }
          return res;
        }, { refresh: false })
      }
      onEnd={() =>
        run(async () => {
          const res = await endPresalesMeetingAction(meeting.id);
          if (!res.error) {
            setMeeting((prev) => ({
              ...prev,
              status: "PROCESSING",
              endedAt: new Date().toISOString(),
            }));
            setPostStep("paste");
            setPathMode("choose");
            flash(m.ended);
          }
          return res;
        }, { refresh: false })
      }
      onResetToPrep={
        phase === "post"
          ? () => {
              if (!window.confirm(m.resetConfirm)) return;
              run(async () => {
                const res = await resetPresalesMeetingToPrepAction(meeting.id);
                if (!res.error) {
                  setMeeting((prev) => ({
                    ...prev,
                    status: "PREP",
                    startedAt: null,
                    endedAt: null,
                    liveNotes: null,
                    transcriptText: null,
                    items: prev.items.map((it) => ({
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
                  setPostStep("paste");
                  setPathMode("choose");
                  setConfirmDrafts({});
                  setMatchDrafts({});
                  setUnassignedDraft("");
                  setCurrentDiscussId(null);
                  flash(m.resetDone);
                }
                return res;
              }, { refresh: false });
            }
          : undefined
      }
      flashOk={flashOk}
      flashError={error}
      recordingSlot={
        <MeetingLiveRecording
          phase={phase}
          meetingId={meeting.id}
          apiBase={`/api/presales-meetings/${meeting.id}`}
          transcriptStatus={meeting.transcriptStatus}
          transcriptError={meeting.transcriptError}
          onFlash={flash}
          onRecordingStarted={(at) => {
            setMeeting((prev) => ({
              ...prev,
              status: "LIVE",
              startedAt: prev.startedAt ?? at ?? new Date().toISOString(),
              recordingStartedAt: at ?? new Date().toISOString(),
              transcriptStatus: "recording",
            }));
          }}
          onTranscribed={({ plain, liveNotes: notes, matchMethod }) => {
            setTranscript(plain);
            setMeeting((prev) => ({
              ...prev,
              transcriptText: plain,
              xfyunTranscriptText: plain,
              xfyunLiveNotes: notes,
              matchSource: "xfyun",
              transcriptStatus: "ready",
            }));
            if (notes) {
              setLiveNotes(notes);
              syncAssignFromNotes(notes);
              lockAssign.current = true;
              setPostStep("assign");
            }
            flash(formatMsg(m.matchOk, { method: matchMethod ?? "xfyun" }));
          }}
        />
      }
      postSlot={postSlot}
    >
      {phase === "prep" ? (
        <p className="text-xs text-slate-500 leading-relaxed">
          {formatMsg(m.prepHint, {
            range: formatFactsRangeLabel(
              meeting.factsSince
                ? toDateInputValue(new Date(meeting.factsSince))
                : defaultFactsRangeDates().since,
              meeting.factsUntil
                ? toDateInputValue(new Date(meeting.factsUntil))
                : defaultFactsRangeDates().until,
            ),
          })}
        </p>
      ) : null}

      {showMain ? (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <MeetingAgendaPanel
            phase={phase}
            items={agendaItems}
            activeId={active?.id ?? null}
            currentDiscussId={currentDiscussId}
            markJustAt={markJustAt}
            onSelect={(item) => setActiveId(item.id)}
            onDiscuss={(item) => void markDiscuss(item.id)}
            renderBadges={(item) => (
              <>
                {item.status === "CONFIRMED" ? (
                  <Badge tone="green">{m.confirmed}</Badge>
                ) : null}
              </>
            )}
          />

          {active ? (
            <div className="space-y-4">
              <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{active.label}</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {active.label}
                    {active.projectPhase ? ` · ${active.projectPhase}` : ""}
                  </p>
                </div>

                {(phase === "prep" || phase === "live") && facts ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 space-y-2 flex flex-col">
                      <PrepTodosPanel
                        title={m.openTodos}
                        empty={m.noTodos}
                        todos={facts.openTodos}
                        customerId={active.customerId}
                        partnerId={active.partnerId}
                        bare
                      />
                      {phase === "live" && activeTodoDefaults?.defaultOwnerRef ? (
                        <div className="pt-1 mt-auto">
                          <CreateTodoDrawer
                            key={`${active.id}-${activeTodoDefaults.defaultOwnerRef}-${activeTodoDefaults.defaultLink}`}
                            userId={active.userId || todoContext.currentUserId}
                            users={todoContext.users}
                            partners={todoContext.partners}
                            customers={todoContext.customers}
                            defaultOwnerRef={activeTodoDefaults.defaultOwnerRef}
                            defaultLink={activeTodoDefaults.defaultLink}
                            lockOwner
                            buttonLabel={m.addTodo}
                            buttonClassName="w-full rounded-lg bg-emerald-700 text-white px-3 py-1.5 text-xs hover:bg-emerald-800"
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 space-y-2 flex flex-col">
                      <BusinessRecordsPanel
                        title={m.businessRecords}
                        empty={m.noRecords}
                        records={facts.businessRecords}
                      />
                      {phase === "live" ? (
                        <div className="pt-1 mt-auto">
                          {recordOwnerForItem(active) ? (
                            <BusinessRecordDialogButton
                              owner={recordOwnerForItem(active)!}
                              hideAi
                              label={m.addBusinessRecord}
                              buttonClassName="w-full rounded-lg border border-sky-200 bg-sky-50 text-sky-900 px-3 py-1.5 text-xs hover:bg-sky-100"
                            />
                          ) : (
                            <p className="text-[10px] text-slate-400">{m.noOwnerForRecord}</p>
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 space-y-2 flex flex-col">
                      <WorkLogsPanel
                        title={m.workLogs}
                        empty={m.noLogs}
                        logs={facts.workLogs}
                      />
                      {phase === "live" ? (
                        <div className="pt-1 mt-auto">
                          {active.projectId && recordOwnerForItem(active) ? (
                            <CreateProjectWorkLogButton
                              owner={recordOwnerForItem(active)!}
                              projectId={active.projectId}
                              label={m.addWorkLog}
                              buttonClassName="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                            />
                          ) : (
                            <p className="text-[10px] text-slate-400">{m.noProjectForLog}</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {onSummaryStep ? (
                  <ExtractConfirmPanel
                    item={active}
                    draft={confirmDrafts[active.id]}
                    m={m}
                    busy={pending}
                    onChange={(d) =>
                      setConfirmDrafts((prev) => ({ ...prev, [active.id]: d }))
                    }
                    onConfirm={() => {
                      flash(m.draftSaved);
                    }}
                  />
                ) : null}

                {phase === "done" && (active.confirmedSnapshot || active.coreNotes) ? (
                  <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-sm space-y-2">
                    <p className="text-xs font-medium text-slate-500">{m.coreNotes}</p>
                    <p className="text-slate-800 whitespace-pre-wrap text-xs leading-relaxed">
                      {active.confirmedSnapshot?.coreNotes || active.coreNotes || "—"}
                    </p>
                  </div>
                ) : null}
              </section>

              {onSummaryStep ? (
                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    type="button"
                    disabled={!Object.keys(confirmDrafts).length}
                    onClick={() => setPostStep("report")}
                    className="rounded-lg bg-violet-700 text-white px-4 py-2 text-sm font-medium hover:bg-violet-800 disabled:opacity-40"
                  >
                    {m.goToReport}
                  </button>
                  <button
                    type="button"
                    className="text-[11px] text-sky-700 hover:underline"
                    onClick={() => {
                      setPostStep("paste");
                      setPathMode("choose");
                    }}
                  >
                    ← {m.pathBackChoice}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-400">{m.noItem}</p>
          )}
        </div>
      ) : null}

      {onReportStep ? (
        <PresalesFinalReportPanel
          meeting={meeting}
          confirmDrafts={confirmDrafts}
          prepFactsByItemId={prepFactsByItemId}
          busy={pending}
          onConfirmAll={() => {
            const drafts =
              Object.keys(confirmDrafts).length > 0
                ? confirmDrafts
                : emptyManualDrafts(meeting.items);
            run(async () => {
              const items: ConfirmItemPayload[] = meeting.items.map((it) => {
                const d = drafts[it.id] ?? emptyManualDrafts([it])[it.id]!;
                return {
                  itemId: it.id,
                  coreNotes: d.coreNotes,
                  businessRecordTitle: d.businessRecordTitle,
                  businessRecordContent: d.businessRecordContent,
                  skipBusinessRecord: d.skipBusinessRecord,
                  projectWorkLogContent: d.projectWorkLogContent,
                  skipProjectWorkLog: d.skipProjectWorkLog,
                  todos: d.todos.map((t) => ({
                    id: t.id,
                    title: t.title,
                    detail: t.detail,
                    dueDate: t.dueDate || null,
                    include: t.include,
                  })),
                };
              });
              const res = await confirmPresalesItemsAction(meeting.id, items);
              if (!res.error) {
                setMeeting((prev) => ({
                  ...prev,
                  status: "DONE",
                  endedAt: prev.endedAt ?? new Date().toISOString(),
                  items: prev.items.map((it) => {
                    const d = drafts[it.id];
                    if (!d) return { ...it, status: "CONFIRMED" as const };
                    return {
                      ...it,
                      status: "CONFIRMED" as const,
                      coreNotes: d.coreNotes,
                      confirmedSnapshot: {
                        confirmedAt: new Date().toISOString(),
                        coreNotes: d.coreNotes,
                        businessRecordTitle: d.businessRecordTitle,
                        businessRecordContent: d.businessRecordContent,
                        skipBusinessRecord: d.skipBusinessRecord,
                        wroteBusinessRecord:
                          !d.skipBusinessRecord && !!d.businessRecordTitle.trim(),
                        projectWorkLogContent: d.projectWorkLogContent,
                        skipProjectWorkLog: d.skipProjectWorkLog,
                        wroteProjectWorkLog:
                          !d.skipProjectWorkLog && !!d.projectWorkLogContent.trim(),
                        todos: d.todos
                          .filter((todo) => todo.include && todo.title.trim())
                          .map((todo) => ({
                            title: todo.title.trim(),
                            detail: todo.detail?.trim() || null,
                            dueDate: todo.dueDate || null,
                            todoItemId: null,
                          })),
                      },
                    };
                  }),
                }));
                flash(m.confirmed);
              }
              return res;
            }, { refresh: false });
          }}
          onFlash={flash}
        />
      ) : null}

      {onReportStep ? (
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            className="text-[11px] text-sky-700 hover:underline"
            onClick={() => setPostStep("extract")}
          >
            ← {m.extractTitle}
          </button>
        </div>
      ) : null}

      {phase === "done" ? (
        <PresalesFinalReportPanel
          meeting={meeting}
          confirmDrafts={confirmDrafts}
          prepFactsByItemId={prepFactsByItemId}
          busy={pending}
          readonly
          onFlash={flash}
        />
      ) : null}

      <div className="flex justify-end pt-2">
        <DeletePresalesMeetingButton
          meetingId={meeting.id}
          meetingTitle={meeting.title}
          redirectTo="/presales-meetings?tab=history"
        />
      </div>
    </MeetingShell>
  );
}

function PresalesFinalReportPanel({
  meeting,
  confirmDrafts,
  prepFactsByItemId,
  busy,
  readonly,
  onConfirmAll,
  onFlash,
}: {
  meeting: MeetingClient;
  confirmDrafts: Record<string, ConfirmDraft>;
  prepFactsByItemId: Record<string, PrepFacts>;
  busy: boolean;
  readonly?: boolean;
  onConfirmAll?: () => void;
  onFlash: (ok?: string, err?: string) => void;
}) {
  const m = useMessages().presalesMeeting;

  const reportMd = useMemo(() => {
    const items = meeting.items.map((it) => {
      const draft = readonly || meeting.status === "DONE" ? null : confirmDrafts[it.id] ?? null;
      return reportRowFromPresalesItem({
        label: it.label,
        snapshot: it.confirmedSnapshot,
        coreNotes: it.coreNotes,
        draft,
        prepFacts: prepFactsByItemId[it.id] ?? null,
      });
    });
    return buildPresalesFinalReportMarkdown({
      title: meeting.title,
      endedAt: meeting.endedAt,
      items,
    });
  }, [meeting, confirmDrafts, prepFactsByItemId, readonly]);

  async function copyReport() {
    const ok = await copyTextToClipboard(reportMd);
    onFlash(ok ? m.reportCopied : undefined, ok ? undefined : m.copyFailed);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">
            {readonly ? m.reportSaved : m.reportTitle}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">{m.reportHint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyReport()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50"
          >
            {m.copyReport}
          </button>
          {!readonly && onConfirmAll ? (
            <button
              type="button"
              disabled={busy || !Object.keys(confirmDrafts).length}
              onClick={onConfirmAll}
              className="rounded-lg bg-emerald-700 text-white px-3 py-1.5 text-xs font-medium hover:bg-emerald-800 disabled:opacity-40"
            >
              {m.saveHistory}
            </button>
          ) : null}
        </div>
      </div>
      <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3 max-h-[420px] overflow-y-auto space-y-4 text-sm">
        {meeting.items.map((it, idx) => {
          const d = confirmDrafts[it.id];
          const notes =
            d?.coreNotes ||
            it.confirmedSnapshot?.coreNotes ||
            it.coreNotes ||
            "";
          const todos = d
            ? d.todos.filter((t) => t.include !== false && t.title.trim())
            : it.confirmedSnapshot?.todos ?? [];
          return (
            <div key={it.id} className="space-y-1.5">
              <div className="text-sm font-semibold text-slate-900">
                {idx + 1}. {it.label}
              </div>
              <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                {notes.trim() || "（未做会后总结）"}
              </p>
              {todos.length ? (
                <ul className="text-xs text-slate-600 list-disc pl-4 space-y-0.5">
                  {todos.map((t, i) => (
                    <li key={i}>
                      {"title" in t ? t.title : ""}
                      {"dueDate" in t && t.dueDate
                        ? `（截止 ${String(t.dueDate).slice(0, 10)}）`
                        : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-slate-400">后续待办：（无）</p>
              )}
            </div>
          );
        })}
      </div>
      <pre className="hidden">{reportMd}</pre>
    </section>
  );
}

function recordOwnerForItem(item: MeetingItemClient): OwnerRef | null {
  if (item.customerId) return { kind: "customer", id: item.customerId };
  if (item.partnerId) return { kind: "partner", id: item.partnerId };
  return null;
}

function BusinessRecordsPanel({
  title,
  empty,
  records,
}: {
  title: string;
  empty: string;
  records: PrepFacts["businessRecords"];
}) {
  return (
    <div className="space-y-1.5 min-h-0">
      <div className="text-[11px] font-medium text-slate-600">{title}</div>
      {!records.length ? (
        <p className="text-[11px] text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {records.slice(0, 8).map((r) => {
            const label = categoryLabel(r.category);
            const body = tidyProgressText(r.content || "");
            const dateLabel = r.occurredAt
              ? new Date(r.occurredAt).toLocaleDateString("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                })
              : "";
            return (
              <li
                key={r.id}
                className="rounded-lg border border-slate-100 bg-white px-2.5 py-2 space-y-1"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
                    {label}
                  </span>
                  {dateLabel ? (
                    <span className="text-[10px] text-slate-400">{dateLabel}</span>
                  ) : null}
                </div>
                <div className="text-xs font-medium text-slate-900 leading-snug">{r.title}</div>
                {body && body !== r.title ? (
                  <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {body}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function WorkLogsPanel({
  title,
  empty,
  logs,
}: {
  title: string;
  empty: string;
  logs: PrepFacts["workLogs"];
}) {
  const badge = useMessages().presalesMeeting.workLogs;
  return (
    <div className="space-y-1.5 min-h-0">
      <div className="text-[11px] font-medium text-slate-600">{title}</div>
      {!logs.length ? (
        <p className="text-[11px] text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {logs.slice(0, 8).map((l) => {
            const dateLabel = l.createdAt
              ? new Date(l.createdAt).toLocaleDateString("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                })
              : "";
            const body = tidyProgressText(l.content, 200);
            return (
              <li
                key={l.id}
                className="rounded-lg border border-slate-100 bg-white px-2.5 py-2 space-y-1"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
                    {badge}
                  </span>
                  {dateLabel ? (
                    <span className="text-[10px] text-slate-400">{dateLabel}</span>
                  ) : null}
                  {l.authorName ? (
                    <span className="text-[10px] text-sky-700">{l.authorName}</span>
                  ) : null}
                </div>
                <p className="text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {body || l.content}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PrepTodosPanel({
  title,
  empty,
  todos,
  customerId,
  partnerId,
  bare = false,
}: {
  title: string;
  empty: string;
  todos: PrepFacts["openTodos"];
  customerId: string | null;
  partnerId: string | null;
  bare?: boolean;
}) {
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(todos.map((t) => [t.id, false])),
  );

  useEffect(() => {
    setDoneMap(Object.fromEntries(todos.map((t) => [t.id, false])));
  }, [todos.map((t) => t.id).join("|")]);

  const inner = (
    <>
      <div className="text-[11px] font-medium text-slate-600">{title}</div>
      {!todos.length ? (
        <p className="text-[11px] text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {todos.slice(0, 12).map((t) => {
            const done = doneMap[t.id] ?? false;
            return (
              <li key={t.id} className="flex items-start gap-2 text-sm">
                <TodoCompleteButton
                  todoId={t.id}
                  title={t.title}
                  status={done ? "DONE" : "OPEN"}
                  customerId={customerId}
                  partnerId={partnerId}
                  size="sm"
                  onStatusChange={(next) =>
                    setDoneMap((prev) => ({ ...prev, [t.id]: next === "DONE" }))
                  }
                />
                <div className="min-w-0 flex-1">
                  <span
                    className={
                      done
                        ? "text-[11px] text-slate-400 line-through decoration-slate-400"
                        : "text-[11px] text-slate-800"
                    }
                  >
                    {t.title}
                  </span>
                  {(t.assigneeName || t.dueDate) && !done ? (
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      {[t.assigneeName, t.dueDate ? t.dueDate.slice(0, 10) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  if (bare) return <div className="space-y-1.5 min-h-0">{inner}</div>;
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 space-y-1.5">
      {inner}
    </div>
  );
}

function ExtractConfirmPanel({
  item,
  draft,
  m,
  busy,
  onChange,
  onConfirm,
}: {
  item: MeetingItemClient;
  draft?: ConfirmDraft;
  m: ReturnType<typeof useMessages>["presalesMeeting"];
  busy: boolean;
  onChange: (d: ConfirmDraft) => void;
  onConfirm: () => void;
}) {
  if (!draft) {
    return (
      <div className="rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2 text-xs text-violet-900">
        {m.extractHint}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-violet-950">{m.extractTitle}</p>
        <p className="text-[11px] text-violet-900/80 mt-1">{m.extractHint}</p>
      </div>
      <label className="block space-y-1">
        <span className="text-[11px] text-slate-600">{m.coreNotes}</span>
        <textarea
          value={draft.coreNotes}
          onChange={(e) => onChange({ ...draft, coreNotes: e.target.value })}
          rows={4}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-slate-600">{m.businessTitle}</span>
        <input
          value={draft.businessRecordTitle}
          onChange={(e) => onChange({ ...draft, businessRecordTitle: e.target.value })}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-slate-600">{m.businessContent}</span>
        <textarea
          value={draft.businessRecordContent}
          onChange={(e) => onChange({ ...draft, businessRecordContent: e.target.value })}
          rows={3}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={draft.skipBusinessRecord}
          onChange={(e) => onChange({ ...draft, skipBusinessRecord: e.target.checked })}
        />
        {m.skipBusiness}
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-slate-600">{m.workLogContent}</span>
        <textarea
          value={draft.projectWorkLogContent}
          onChange={(e) => onChange({ ...draft, projectWorkLogContent: e.target.value })}
          rows={3}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={draft.skipProjectWorkLog}
          onChange={(e) => onChange({ ...draft, skipProjectWorkLog: e.target.checked })}
        />
        {m.skipWorkLog}
      </label>
      <div className="space-y-2">
        {draft.todos.map((todo, idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-[11px] text-slate-500">
              <input
                type="checkbox"
                checked={todo.include}
                onChange={(e) => {
                  const todos = [...draft.todos];
                  todos[idx] = { ...todo, include: e.target.checked };
                  onChange({ ...draft, todos });
                }}
              />
            </label>
            <input
              value={todo.title}
              onChange={(e) => {
                const todos = [...draft.todos];
                todos[idx] = { ...todo, title: e.target.value };
                onChange({ ...draft, todos });
              }}
              className="flex-1 min-w-[140px] rounded border border-slate-200 px-2 py-1 text-xs"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={busy || item.status === "CONFIRMED"}
        onClick={onConfirm}
        className="rounded-lg bg-violet-700 text-white px-4 py-2 text-sm hover:bg-violet-800 disabled:opacity-40"
      >
        {item.status === "CONFIRMED" ? m.confirmed : m.confirmItem}
      </button>
    </div>
  );
}
