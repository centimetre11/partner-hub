"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import {
  MeetingAgendaPanel,
  MeetingAssignmentTimeline,
  MeetingBatchRecorder,
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
  confirmLeadReviewItemsAction,
  endLeadReviewMeetingAction,
  getLeadReviewPreviewPathAction,
  matchLeadReviewMinutesAction,
  matchLeadReviewXfyunAction,
  resetLeadReviewToPrepAction,
  runLeadReviewPrepAction,
  saveLeadReviewAssignmentAction,
  saveLeadReviewItemNotesAction,
  saveLeadReviewLiveNotesAction,
  startLeadReviewMeetingAction,
  switchLeadReviewMatchSourceAction,
} from "@/lib/lead-review/actions";
import { LEAD_REVIEW_VERDICTS, type LeadReviewVerdict } from "@/lib/lead-review/types";
import type { LeadPrepBrief } from "@/lib/lead-review/brief";
import { parseLeadSectionsFromLiveNotes } from "@/lib/lead-review/markers";
import { useMessages } from "@/lib/i18n/context";
import { formatMsg } from "@/lib/i18n/messages";

type ItemRow = {
  id: string;
  source: string;
  displayName: string | null;
  status: string;
  verdict: string | null;
  coreNotes: string | null;
  discussedAt: string | null;
  markerInsertedAt: string | null;
  prepBrief: string | null;
  channelId: string | null;
  leadId: string | null;
};

type AgendaItem = ItemRow & MeetingAgendaItemBase;

type ItemDraft = {
  verdict: LeadReviewVerdict | "";
  coreNotes: string;
  todoTitle: string;
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

function applySegmentsToDrafts(
  segments: ReturnType<typeof parseLeadSectionsFromLiveNotes>,
  items: ItemRow[],
): { drafts: Record<string, string>; unassigned: string } {
  const drafts: Record<string, string> = {};
  for (const item of items) drafts[item.id] = "";
  let unassigned = "";
  for (const segment of segments) {
    if (!segment.itemId) {
      unassigned = [unassigned, segment.text].filter(Boolean).join("\n\n");
      continue;
    }
    drafts[segment.itemId] = [drafts[segment.itemId], segment.text]
      .filter(Boolean)
      .join("\n\n");
  }
  return { drafts, unassigned };
}

export function LeadReviewWorkspace({
  meetingId,
  status: initialStatus,
  previewToken: initialPreviewToken,
  liveNotes,
  transcriptStatus: initialTranscriptStatus,
  transcriptError: initialTranscriptError,
  transcriptText: initialTranscriptText,
  tencentTranscriptText,
  tencentLiveNotes,
  xfyunTranscriptText,
  xfyunLiveNotes,
  matchSource: initialMatchSource,
  startedAt: initialStartedAt,
  items: initialItems,
  facts,
  stats,
}: {
  meetingId: string;
  status: string;
  previewToken: string | null;
  liveNotes: string | null;
  transcriptStatus: string | null;
  transcriptError: string | null;
  transcriptText: string | null;
  tencentTranscriptText: string | null;
  tencentLiveNotes: string | null;
  xfyunTranscriptText: string | null;
  xfyunLiveNotes: string | null;
  matchSource: string | null;
  startedAt: string | null;
  items: ItemRow[];
  facts: Record<string, LeadPrepBrief>;
  stats: {
    CHANNEL: Record<string, number>;
    NURTURE: Record<string, number>;
    ALL: Record<string, number>;
  } | null;
}) {
  const m = useMessages().leadReview;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState(liveNotes ?? "");
  const [transcript, setTranscript] = useState(
    tencentTranscriptText || initialTranscriptText || "",
  );
  const [transcriptStatus, setTranscriptStatus] = useState(initialTranscriptStatus);
  const [transcriptError, setTranscriptError] = useState(initialTranscriptError);
  const [tencentNotes, setTencentNotes] = useState(tencentLiveNotes);
  const [xfyunNotes, setXfyunNotes] = useState(xfyunLiveNotes);
  const [xfyunText, setXfyunText] = useState(xfyunTranscriptText);
  const [matchSource, setMatchSource] = useState(initialMatchSource);
  const [startedAt, setStartedAt] = useState(initialStartedAt);
  const [items, setItems] = useState(initialItems);
  const [activeId, setActiveId] = useState(initialItems[0]?.id ?? "");
  const [currentDiscussItemId, setCurrentDiscussItemId] = useState<string | null>(
    () => initialItems.find((item) => item.status === "DISCUSSED" && !item.verdict)?.id ?? null,
  );
  const [markJustAt, setMarkJustAt] = useState(0);
  const [postStep, setPostStep] = useState<MeetingPostStep>(() => {
    if (initialStatus !== "PROCESSING" && initialStatus !== "DONE") return "paste";
    return liveNotes?.trim() ? "assign" : "paste";
  });
  const [workStage, setWorkStage] = useState<MeetingWorkStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [flashOk, setFlashOk] = useState<string | null>(null);

  const initialAssign = useMemo(
    () => applySegmentsToDrafts(parseLeadSectionsFromLiveNotes(liveNotes, initialItems), initialItems),
    // Initial server state only; later state changes use syncAssignFromNotes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [matchDrafts, setMatchDrafts] = useState<Record<string, string>>(initialAssign.drafts);
  const [unassignedDraft, setUnassignedDraft] = useState(initialAssign.unassigned);
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>(() => {
    const next: Record<string, ItemDraft> = {};
    for (const item of initialItems) {
      next[item.id] = {
        verdict: (item.verdict as LeadReviewVerdict) || "",
        coreNotes: item.coreNotes ?? "",
        todoTitle: "",
      };
    }
    return next;
  });

  const phase = meetingPhaseFromStatus(status);
  const active = items.find((item) => item.id === activeId) ?? items[0];
  const currentDiscuss = items.find((item) => item.id === currentDiscussItemId) ?? null;
  const brief = active ? facts[active.id] : null;
  const agendaItems = useMemo<AgendaItem[]>(
    () => items.map((item) => ({ ...item, title: item.displayName || "—" })),
    [items],
  );
  const orderedItems = useMemo(() => orderAgendaByDiscussTime(agendaItems), [agendaItems]);
  const verdictLabel: Record<LeadReviewVerdict, string> = {
    QUALITY: m.verdictQuality,
    DIGESTION: m.verdictDigestion,
    NORMAL: m.verdictNormal,
    WATCH: m.verdictWatch,
  };

  function flash(ok?: string, err?: string) {
    setFlashOk(ok ?? null);
    setError(err ?? null);
  }

  function run(
    fn: () => Promise<{ error?: string; ok?: boolean }>,
    options?: { refresh?: boolean },
  ) {
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (result.error) setError(result.error);
      else if (options?.refresh !== false) router.refresh();
    });
  }

  function updateDraft(itemId: string, patch: Partial<ItemDraft>) {
    setDrafts((previous) => ({
      ...previous,
      [itemId]: { ...previous[itemId]!, ...patch },
    }));
  }

  function syncAssignFromNotes(nextNotes: string | null) {
    const applied = applySegmentsToDrafts(parseLeadSectionsFromLiveNotes(nextNotes, items), items);
    setMatchDrafts(applied.drafts);
    setUnassignedDraft(applied.unassigned);
  }

  function markLeadDiscuss(itemId: string, displayName: string) {
    if (phase !== "live") return;
    const nowIso = new Date().toISOString();
    setActiveId(itemId);
    setCurrentDiscussItemId(itemId);
    setMarkJustAt(Date.now());
    setItems((previous) =>
      previous.map((item) => {
        if (item.id !== itemId) return item;
        const priorMarker = item.markerInsertedAt ? Date.parse(item.markerInsertedAt) : Number.NaN;
        const meetingStart = startedAt ? Date.parse(startedAt) : Number.NaN;
        const keepMarker = Number.isFinite(priorMarker) && Number.isFinite(meetingStart) && priorMarker >= meetingStart;
        return {
          ...item,
          status: item.status === "CONFIRMED" ? item.status : "DISCUSSED",
          discussedAt: item.discussedAt ?? nowIso,
          markerInsertedAt: keepMarker ? item.markerInsertedAt : nowIso,
        };
      }),
    );
    flash(formatMsg(m.markedDiscuss, { name: displayName }));

    void (async () => {
      try {
        const response = await fetch(`/api/lead-reviews/${meetingId}/discuss-item`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
          markerInsertedAt?: string;
          discussedAt?: string;
          liveNotes?: string;
        };
        if (!response.ok || result.error) {
          flash(undefined, result.error || m.needStartFirst);
          return;
        }
        if (result.markerInsertedAt || result.discussedAt) {
          setItems((previous) => previous.map((item) => item.id === itemId ? {
            ...item,
            markerInsertedAt: result.markerInsertedAt ?? item.markerInsertedAt,
            discussedAt: result.discussedAt ?? item.discussedAt,
          } : item));
        }
        if (result.liveNotes != null) setNotes(result.liveNotes);
      } catch (caught) {
        flash(undefined, caught instanceof Error ? caught.message : String(caught));
      }
    })();
  }

  function matchTencent() {
    run(async () => {
      setWorkStage("matching");
      try {
        const result = await matchLeadReviewMinutesAction(meetingId, transcript);
        if (result.error) return result;
        if (result.liveNotes) {
          setNotes(result.liveNotes);
          setTencentNotes(result.liveNotes);
          setMatchSource("tencent");
          syncAssignFromNotes(result.liveNotes);
        }
        setPostStep("assign");
        flash(formatMsg(m.postMatchOk, { method: result.matchMethod ?? "ok" }));
        return result;
      } catch (caught) {
        return { error: caught instanceof Error ? caught.message : String(caught) };
      } finally {
        setWorkStage("idle");
      }
    }, { refresh: false });
  }

  function matchXfyun() {
    run(async () => {
      setWorkStage("matching");
      try {
        const result = await matchLeadReviewXfyunAction(meetingId);
        if (result.error) return result;
        if (result.liveNotes) {
          setNotes(result.liveNotes);
          setXfyunNotes(result.liveNotes);
          setMatchSource("xfyun");
          setTranscript(xfyunText ?? transcript);
          syncAssignFromNotes(result.liveNotes);
        }
        setPostStep("assign");
        flash(formatMsg(m.postMatchOk, { method: result.matchMethod ?? "xfyun" }));
        return result;
      } catch (caught) {
        return { error: caught instanceof Error ? caught.message : String(caught) };
      } finally {
        setWorkStage("idle");
      }
    }, { refresh: false });
  }

  function switchSource(source: "tencent" | "xfyun") {
    run(async () => {
      const result = await switchLeadReviewMatchSourceAction(meetingId, source);
      if (result.error) return result;
      const nextNotes = source === "tencent" ? tencentNotes ?? "" : xfyunNotes ?? "";
      setNotes(nextNotes);
      setTranscript(source === "tencent" ? tencentTranscriptText ?? transcript : xfyunText ?? transcript);
      setMatchSource(source);
      syncAssignFromNotes(nextNotes);
      setPostStep("assign");
      flash(source === "tencent" ? m.postSwitchedTencent : m.postSwitchedXfyun);
      return result;
    }, { refresh: false });
  }

  function saveAssignment(applyToCoreNotes: boolean) {
    run(async () => {
      setWorkStage(applyToCoreNotes ? "extracting" : "saving");
      try {
        const result = await saveLeadReviewAssignmentAction(meetingId, {
          drafts: matchDrafts,
          unassigned: unassignedDraft,
          applyToCoreNotes,
        });
        if (result.error) return result;
        if (result.liveNotes) setNotes(result.liveNotes);
        if (applyToCoreNotes) {
          setDrafts((previous) => {
            const next = { ...previous };
            for (const item of items) {
              const text = (matchDrafts[item.id] ?? "").trim();
              if (text && next[item.id] && !next[item.id]!.coreNotes.trim()) {
                next[item.id] = { ...next[item.id]!, coreNotes: text };
              }
            }
            return next;
          });
          setPostStep("extract");
          flash(m.postApplied);
        } else {
          flash(m.postSaveAssign);
        }
        return result;
      } finally {
        setWorkStage("idle");
      }
    }, { refresh: false });
  }

  const postSlot = phase === "post" || phase === "done" ? (
    <div className="space-y-3">
      <MeetingMatchSourceSwitch
        tencentReady={Boolean(tencentNotes)}
        xfyunReady={Boolean(xfyunNotes)}
        matchSource={matchSource}
        busy={pending}
        onSwitch={switchSource}
      />
      <PostMinutesDualPath
        phase={phase}
        postStep={postStep}
        transcript={transcript}
        liveNotes={notes}
        busy={pending}
        workStage={workStage}
        onTranscriptChange={setTranscript}
        onMatch={matchTencent}
        onRematch={() => setPostStep("assign")}
        pathB={
          <MeetingPathBPanel title={m.postXfyunTitle} hint={m.postXfyunHint}>
            {xfyunText?.trim() ? (
              <>
                <p className="text-xs text-slate-500">{xfyunText.length} chars</p>
                {phase === "post" ? (
                  <button type="button" disabled={pending || workStage === "matching"} onClick={matchXfyun} className="rounded-lg bg-emerald-700 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-800 disabled:opacity-40">
                    {workStage === "matching" ? m.postMatching : m.postXfyunMatch}
                  </button>
                ) : null}
              </>
            ) : <p className="text-[11px] text-slate-400">{m.postXfyunEmpty}</p>}
            {phase === "post" ? (
              <MeetingBatchRecorder
                meetingId={meetingId}
                apiBase={`/api/lead-reviews/${meetingId}`}
                transcriptStatus={transcriptStatus}
                transcriptError={transcriptError}
                onFlash={flash}
                onRecordingStarted={(at) => {
                  setStartedAt((current) => current ?? at ?? new Date().toISOString());
                  setTranscriptStatus("recording");
                }}
                onTranscribed={({ plain, liveNotes: nextNotes }) => {
                  setXfyunText(plain);
                  setTranscriptStatus("ready");
                  setMatchSource("xfyun");
                  if (nextNotes) {
                    setNotes(nextNotes);
                    setXfyunNotes(nextNotes);
                    syncAssignFromNotes(nextNotes);
                    setPostStep("assign");
                  }
                }}
              />
            ) : null}
          </MeetingPathBPanel>
        }
      />
      {phase === "post" ? <MeetingPostStepIndicator step={postStep} /> : null}
      {phase === "post" && postStep === "assign" ? (
        <MeetingAssignmentTimeline
          items={orderedItems}
          matchDrafts={matchDrafts}
          unassignedDraft={unassignedDraft}
          busy={pending}
          workStage={workStage}
          statusMessage={error ?? flashOk}
          statusIsError={Boolean(error)}
          onChangeItem={(itemId, text) => setMatchDrafts((previous) => ({ ...previous, [itemId]: text }))}
          onChangeUnassigned={setUnassignedDraft}
          onSave={() => saveAssignment(false)}
          onConfirm={() => saveAssignment(true)}
          confirmLabel={m.postApplyNotes}
        />
      ) : null}
    </div>
  ) : null;

  const showMain = !(phase === "post" && postStep === "assign");

  return (
    <MeetingShell
      phase={phase}
      status={status}
      busy={pending}
      hasPrep={status !== "DRAFT"}
      currentDiscussTitle={currentDiscuss?.displayName ?? null}
      previewToken={initialPreviewToken}
      resolvePreviewPath={async () => {
        if (initialPreviewToken) return `/lead-reviews/preview/${initialPreviewToken}`;
        const result = await getLeadReviewPreviewPathAction(meetingId);
        return result.path ?? null;
      }}
      onPrep={() => run(async () => {
        const result = await runLeadReviewPrepAction(meetingId);
        if (!result.error) setStatus("PREP");
        return result;
      })}
      onStart={() => run(async () => {
        const result = await startLeadReviewMeetingAction(meetingId);
        if (!result.error) {
          setStatus("LIVE");
          setStartedAt((current) => current ?? new Date().toISOString());
        }
        return result;
      })}
      onEnd={() => run(async () => {
        const result = await endLeadReviewMeetingAction(meetingId);
        if (!result.error) {
          setStatus("PROCESSING");
          setPostStep("paste");
          flash(m.endMeetingHint);
        }
        return result;
      }, { refresh: false })}
      onResetToPrep={
        phase === "post"
          ? () => run(async () => {
              const result = await resetLeadReviewToPrepAction(meetingId);
              if (!result.error) setStatus("PREP");
              return result;
            })
          : undefined
      }
      shareMode="prep-and-later"
      flashOk={flashOk}
      flashError={error}
      recordingSlot={
        <MeetingLiveRecording
          phase={phase}
          meetingId={meetingId}
          apiBase={`/api/lead-reviews/${meetingId}`}
          transcriptStatus={transcriptStatus}
          transcriptError={transcriptError}
          onFlash={flash}
          onRecordingStarted={(at) => {
            setStatus("LIVE");
            setStartedAt((current) => current ?? at ?? new Date().toISOString());
            setTranscriptStatus("recording");
          }}
          onTranscribed={({ plain, liveNotes: nextNotes }) => {
            setXfyunText(plain);
            setTranscriptStatus("ready");
            setMatchSource("xfyun");
            if (nextNotes) {
              setNotes(nextNotes);
              setXfyunNotes(nextNotes);
              syncAssignFromNotes(nextNotes);
            }
          }}
        />
      }
      postSlot={postSlot}
    >
      {showMain ? (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <MeetingAgendaPanel
            phase={phase}
            items={agendaItems}
            activeId={active?.id ?? null}
            currentDiscussId={currentDiscussItemId}
            markJustAt={markJustAt}
            onSelect={(item) => setActiveId(item.id)}
            onDiscuss={(item) => markLeadDiscuss(item.id, item.displayName ?? item.id.slice(0, 8))}
            renderBadges={(item) => <>
              <Badge tone={item.source === "CHANNEL" ? "amber" : "blue"}>
                {item.source === "CHANNEL" ? m.sourceChannel : m.sourceNurture}
              </Badge>
              {item.status === "DISCUSSED" || item.status === "CONFIRMED" ? <Badge tone="green">{m.doneBadge}</Badge> : null}
              {item.verdict ? <Badge tone="zinc">{verdictLabel[item.verdict as LeadReviewVerdict] ?? item.verdict}</Badge> : null}
            </>}
          />
          {active ? <LeadDetail
            meetingId={meetingId}
            status={status}
            item={active}
            brief={brief}
            notes={notes}
            pending={pending}
            draft={drafts[active.id]}
            verdictLabel={verdictLabel}
            m={m}
            onUpdateDraft={(patch) => updateDraft(active.id, patch)}
            onSaveNotes={() => run(() => saveLeadReviewLiveNotesAction(meetingId, notes))}
            onNotesChange={setNotes}
            onConfirm={() => {
              const draft = drafts[active.id];
              if (!draft?.verdict) return;
              run(() => confirmLeadReviewItemsAction(meetingId, [{
                itemId: active.id,
                verdict: draft.verdict as LeadReviewVerdict,
                coreNotes: draft.coreNotes,
                todos: draft.todoTitle.trim() ? [{ title: draft.todoTitle.trim(), include: true }] : [],
              }]));
            }}
          /> : null}
        </div>
      ) : null}
      {stats && phase === "done" ? <Card title={m.statsTitle}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          {([ ["ALL", m.statsAll], ["CHANNEL", m.statsChannel], ["NURTURE", m.statsNurture] ] as const).map(([key, label]) => (
            <div key={key} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <div className="text-xs text-slate-500 mb-2">{label}</div>
              <ul className="space-y-1">{LEAD_REVIEW_VERDICTS.map((verdict) => <li key={verdict} className="flex justify-between"><span>{verdictLabel[verdict]}</span><span className="font-medium">{stats[key][verdict] ?? 0}</span></li>)}</ul>
            </div>
          ))}
        </div>
      </Card> : null}
    </MeetingShell>
  );
}

function LeadDetail({
  meetingId, status, item, brief, notes, pending, draft, verdictLabel, m,
  onUpdateDraft, onSaveNotes, onNotesChange, onConfirm,
}: {
  meetingId: string;
  status: string;
  item: ItemRow;
  brief: LeadPrepBrief | null;
  notes: string;
  pending: boolean;
  draft: ItemDraft | undefined;
  verdictLabel: Record<LeadReviewVerdict, string>;
  m: ReturnType<typeof useMessages>["leadReview"];
  onUpdateDraft: (patch: Partial<ItemDraft>) => void;
  onSaveNotes: () => void;
  onNotesChange: (value: string) => void;
  onConfirm: () => void;
}) {
  const editable = status !== "DONE" && item.status !== "CONFIRMED";
  return <div className="space-y-4">
    <Card title={brief?.name || item.displayName || "—"}>
      {brief ? <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
        <Fact label={m.factsType} value={brief.typeDetail} /><Fact label={m.factsRankStatus} value={[brief.rank, brief.status].filter(Boolean).join(" · ")} />
        <Fact label={m.factsSales} value={brief.salesman} /><Fact label={m.factsPrevSales} value={brief.staSalesOld} />
        <Fact label={brief.dateLabel} value={brief.dateValue} /><Fact label={m.factsKpi} value={brief.jzDate} />
        <Fact label={m.factsRegion} value={brief.region} /><Fact label={m.factsProvince} value={brief.province} />
        <Fact label={m.factsSource} value={brief.sourceLabel} /><Fact label={m.factsSourceDetail} value={brief.sourceDetail} />
        <Fact label={m.factsContact} value={brief.contName} /><Fact label={m.factsTitle} value={brief.contDuty} />
        <Fact label={m.factsPhone} value={brief.phone} /><Fact label={m.factsEmail} value={brief.contEmail} />
        <Fact label={m.factsAgent} value={brief.overseaAgent} /><Fact label={m.factsZone} value={brief.zone} />
        <Fact label={m.factsCompanyId} value={brief.companyId} /><Fact label={m.factsClueId} value={brief.clueId} />
      </dl> : <p className="text-sm text-slate-500">{m.noSource}</p>}
    </Card>
    <Card title={m.bizRecords}>
      {brief?.traceDetail || brief?.detail ? <dl className="space-y-4 text-sm">
        {brief.traceDetail ? <div><dt className="text-xs text-slate-500 mb-1">{m.bizRecord1}</dt><dd className="text-slate-800 whitespace-pre-wrap break-words rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 max-h-64 overflow-y-auto">{brief.traceDetail}</dd></div> : null}
        {brief.detail ? <div><dt className="text-xs text-slate-500 mb-1">{m.bizRecord2}</dt><dd className="text-slate-800 whitespace-pre-wrap break-words rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 max-h-64 overflow-y-auto">{brief.detail}</dd></div> : null}
      </dl> : <p className="text-sm text-slate-500">{m.noBizRecords}{item.source === "CHANNEL" ? m.noBizChannelHint : ""}</p>}
    </Card>
    {brief?.topics?.length ? <Card title={m.topics}><ul className="list-disc pl-5 space-y-0.5 text-sm text-slate-700">{brief.topics.map((topic) => <li key={topic}>{topic}</li>)}</ul></Card> : null}
    {(status === "LIVE" || status === "PROCESSING" || status === "DONE") ? <Card title={m.verdictTitle}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">{LEAD_REVIEW_VERDICTS.map((verdict) => <button key={verdict} type="button" disabled={!editable} onClick={() => onUpdateDraft({ verdict })} className={`rounded-lg px-3 py-1.5 text-sm border ${draft?.verdict === verdict ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-700 hover:bg-slate-50"} disabled:opacity-50`}>{verdictLabel[verdict]}</button>)}</div>
        <textarea value={draft?.coreNotes ?? ""} disabled={!editable} onChange={(event) => onUpdateDraft({ coreNotes: event.target.value })} onBlur={() => void saveLeadReviewItemNotesAction(meetingId, item.id, draft?.coreNotes ?? "")} rows={4} placeholder={m.notesPh} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        {status === "PROCESSING" && item.status !== "CONFIRMED" ? <><input value={draft?.todoTitle ?? ""} onChange={(event) => onUpdateDraft({ todoTitle: event.target.value })} placeholder={m.todoPh} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /><button type="button" disabled={pending || !draft?.verdict} onClick={onConfirm} className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm disabled:opacity-40">{m.confirmItem}</button></> : null}
        {item.status === "CONFIRMED" ? <p className="text-sm text-emerald-700">{m.itemConfirmed}</p> : null}
      </div>
    </Card> : null}
    {(status === "LIVE" || status === "PROCESSING") ? <Card title={m.meetingNotes}><textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} rows={6} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" /><button type="button" disabled={pending} onClick={onSaveNotes} className="mt-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm">{m.saveNotes}</button></Card> : null}
  </div>;
}
