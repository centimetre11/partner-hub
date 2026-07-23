"use client";

import { useMemo, useRef, useState, useTransition } from "react";
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
  finishPresalesMeetingWithoutExtractAction,
  matchPresalesMinutesAction,
  matchPresalesXfyunAction,
  resetPresalesMeetingToPrepAction,
  runPresalesPrepAction,
  savePresalesMatchedNotesAction,
  startPresalesMeetingAction,
  switchPresalesMatchSourceAction,
} from "@/lib/presales-meeting/actions";
import type { MeetingClient, MeetingItemClient } from "@/lib/presales-meeting/meeting-client";
import type { ConfirmItemPayload, PrepFacts } from "@/lib/presales-meeting/types";
import {
  buildLiveNotesFromSegments,
  parseItemSectionsFromLiveNotes,
} from "@/lib/presales-meeting/markers";
import type { SplitProposal } from "@/lib/presales-meeting/split-types";
import { CreateTodoDrawer } from "@/components/create-todo-drawer";
import { encodeTodoOwnerRef } from "@/lib/todo-owner-select";
import { Badge } from "@/components/ui";
import { useMessages } from "@/lib/i18n/context";
import { formatMsg } from "@/lib/i18n/messages";

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
  const [postStep, setPostStep] = useState<MeetingPostStep>(
    initial.liveNotes?.trim() ? "assign" : "paste",
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

  const postSlot =
    phase === "post" || phase === "done" ? (
      <div className="space-y-3">
        {phase === "post" ? (
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
                setMeeting((prev) => ({ ...prev, matchSource: source, liveNotes: notes }));
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
          postStep={postStep}
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
                  {phase === "post" ? (
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
                            setPostStep("assign");
                            setWorkStage("done");
                            flash(formatMsg(m.matchOk, { method: res.matchMethod ?? "xfyun" }));
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
                  ) : null}
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

        {phase === "post" ? (
          <MeetingPostStepIndicator step={postStep} extractOptional />
        ) : null}

        {phase === "post" && postStep === "assign" ? (
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
            finishWithoutExtractLabel={m.finishWithoutExtract}
            onFinishWithoutExtract={() =>
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
                const res = await finishPresalesMeetingWithoutExtractAction(meeting.id);
                if (!res.error) {
                  setMeeting((prev) => ({
                    ...prev,
                    status: "DONE",
                    items: prev.items.map((it) =>
                      it.status === "CONFIRMED" ? it : { ...it, status: "CONFIRMED" },
                    ),
                  }));
                  flash(m.finishedNoExtract);
                  router.push("/presales-meetings?tab=history");
                }
                return res;
              })
            }
          />
        ) : null}
      </div>
    ) : null;

  const showMain = !(phase === "post" && postStep === "assign");

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
        <p className="text-xs text-slate-500 leading-relaxed">{m.prepHint}</p>
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
                    <FactList
                      title={m.openTodos}
                      empty={m.noTodos}
                      lines={facts.openTodos.map(
                        (t) =>
                          `${t.title}${t.assigneeName ? ` · ${t.assigneeName}` : ""}${
                            t.dueDate ? ` · ${t.dueDate.slice(0, 10)}` : ""
                          }`,
                      )}
                    />
                    <FactList
                      title={m.businessRecords}
                      empty={m.noRecords}
                      lines={facts.businessRecords.map(
                        (r) => `${r.title} · ${r.occurredAt.slice(0, 10)}`,
                      )}
                    />
                    <FactList
                      title={m.workLogs}
                      empty={m.noLogs}
                      lines={facts.workLogs.map(
                        (l) =>
                          `${l.content.slice(0, 80)}${l.content.length > 80 ? "…" : ""}`,
                      )}
                    />
                  </div>
                ) : null}

                {phase === "live" || phase === "post" || phase === "prep" ? (
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-medium text-emerald-900">{m.addTodo}</div>
                    {activeTodoDefaults ? (
                      <CreateTodoDrawer
                        userId={
                          active.userId || todoContext.currentUserId
                        }
                        users={todoContext.users}
                        partners={todoContext.partners}
                        customers={todoContext.customers}
                        defaultOwnerRef={activeTodoDefaults.defaultOwnerRef}
                        defaultLink={activeTodoDefaults.defaultLink}
                        lockOwner={Boolean(activeTodoDefaults.defaultOwnerRef)}
                        buttonLabel={m.addTodo}
                        buttonClassName="rounded-lg bg-emerald-700 text-white px-3 py-1.5 text-sm hover:bg-emerald-800"
                      />
                    ) : null}
                  </div>
                ) : null}

                {phase === "post" && postStep === "extract" ? (
                  <ExtractConfirmPanel
                    item={active}
                    draft={confirmDrafts[active.id]}
                    m={m}
                    busy={pending}
                    onChange={(d) =>
                      setConfirmDrafts((prev) => ({ ...prev, [active.id]: d }))
                    }
                    onConfirm={() => {
                      const d = confirmDrafts[active.id];
                      if (!d) return;
                      run(async () => {
                        const payload: ConfirmItemPayload = {
                          itemId: active.id,
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
                        const res = await confirmPresalesItemsAction(meeting.id, [payload]);
                        if (!res.error) {
                          setMeeting((prev) => ({
                            ...prev,
                            items: prev.items.map((it) =>
                              it.id === active.id
                                ? { ...it, status: "CONFIRMED", coreNotes: d.coreNotes }
                                : it,
                            ),
                            status: prev.items.every(
                              (it) => it.id === active.id || it.status === "CONFIRMED",
                            )
                              ? "DONE"
                              : prev.status,
                          }));
                          flash(m.confirmed);
                        }
                        return res;
                      });
                    }}
                  />
                ) : null}

                {phase === "done" && active.confirmedSnapshot ? (
                  <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-sm space-y-2">
                    <p className="text-xs font-medium text-slate-500">{m.coreNotes}</p>
                    <p className="text-slate-800 whitespace-pre-wrap text-xs leading-relaxed">
                      {active.confirmedSnapshot.coreNotes || active.coreNotes || "—"}
                    </p>
                  </div>
                ) : null}
              </section>

              {phase === "post" && postStep === "extract" ? (
                <div className="flex flex-wrap gap-2 items-center">
                  {Object.keys(confirmDrafts).length ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          const items: ConfirmItemPayload[] = Object.entries(confirmDrafts).map(
                            ([itemId, d]) => ({
                              itemId,
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
                            }),
                          );
                          const res = await confirmPresalesItemsAction(meeting.id, items);
                          if (!res.error) {
                            setMeeting((prev) => ({
                              ...prev,
                              status: "DONE",
                              items: prev.items.map((it) => ({
                                ...it,
                                status: "CONFIRMED",
                              })),
                            }));
                            flash(m.confirmed);
                          }
                          return res;
                        })
                      }
                      className="rounded-lg bg-violet-700 text-white px-4 py-2 text-sm font-medium hover:bg-violet-800 disabled:opacity-40"
                    >
                      {m.confirmAll}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        const res = await finishPresalesMeetingWithoutExtractAction(meeting.id);
                        if (!res.error) {
                          setMeeting((prev) => ({
                            ...prev,
                            status: "DONE",
                            items: prev.items.map((it) =>
                              it.status === "CONFIRMED"
                                ? it
                                : { ...it, status: "CONFIRMED" },
                            ),
                          }));
                          flash(m.finishedNoExtract);
                          router.push("/presales-meetings?tab=history");
                        }
                        return res;
                      })
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    {m.finishWithoutExtract}
                  </button>
                  <span className="text-[11px] text-slate-400">{m.finishWithoutExtractHint}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-400">{m.noItem}</p>
          )}
        </div>
      ) : null}
    </MeetingShell>
  );
}

function FactList({
  title,
  empty,
  lines,
}: {
  title: string;
  empty: string;
  lines: string[];
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 space-y-1.5">
      <div className="text-[11px] font-medium text-slate-600">{title}</div>
      {!lines.length ? (
        <p className="text-[11px] text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {lines.slice(0, 8).map((line, i) => (
            <li key={`${i}-${line.slice(0, 12)}`} className="text-[11px] text-slate-700 leading-snug">
              · {line}
            </li>
          ))}
        </ul>
      )}
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
