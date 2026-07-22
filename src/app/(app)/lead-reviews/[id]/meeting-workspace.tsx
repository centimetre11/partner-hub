"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import {
  confirmLeadReviewItemsAction,
  endLeadReviewMeetingAction,
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
import { MeetingBatchRecorder } from "@/components/partner-review/meeting-batch-recorder";
import { useMessages } from "@/lib/i18n/context";
import { formatMsg } from "@/lib/i18n/messages";

type PostStep = "paste" | "assign" | "tag";

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
  for (const it of items) drafts[it.id] = "";
  let unassigned = "";
  for (const seg of segments) {
    if (!seg.itemId) {
      unassigned = [unassigned, seg.text].filter(Boolean).join("\n\n");
      continue;
    }
    drafts[seg.itemId] = [drafts[seg.itemId], seg.text].filter(Boolean).join("\n\n");
  }
  return { drafts, unassigned };
}

export function LeadReviewWorkspace({
  meetingId,
  status: initialStatus,
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
  const [error, setError] = useState<string | null>(null);
  const [flashOk, setFlashOk] = useState<string | null>(null);
  const [notes, setNotes] = useState(liveNotes ?? "");
  const [status, setStatus] = useState(initialStatus);
  const [startedAt, setStartedAt] = useState(initialStartedAt);
  const [transcriptStatus, setTranscriptStatus] = useState(initialTranscriptStatus);
  const [transcriptError, setTranscriptError] = useState(initialTranscriptError);
  const [transcript, setTranscript] = useState(
    tencentTranscriptText || initialTranscriptText || "",
  );
  const [matchSource, setMatchSource] = useState(initialMatchSource);
  const [tencentNotes, setTencentNotes] = useState(tencentLiveNotes);
  const [xfyunNotes, setXfyunNotes] = useState(xfyunLiveNotes);
  const [xfyunText, setXfyunText] = useState(xfyunTranscriptText);
  const [items, setItems] = useState(initialItems);
  const [activeId, setActiveId] = useState(initialItems[0]?.id ?? "");
  const [currentDiscussItemId, setCurrentDiscussItemId] = useState<string | null>(
    () => initialItems.find((i) => i.status === "DISCUSSED" && !i.verdict)?.id ?? null,
  );
  const [markJustAt, setMarkJustAt] = useState(0);
  const [postStep, setPostStep] = useState<PostStep>(() => {
    if (initialStatus !== "PROCESSING" && initialStatus !== "DONE") return "paste";
    if (liveNotes?.trim()) return "assign";
    if (initialTranscriptText?.trim() || tencentTranscriptText?.trim()) return "paste";
    return "paste";
  });
  const [workStage, setWorkStage] = useState<"idle" | "matching" | "saving">("idle");
  const initialAssign = useMemo(
    () => applySegmentsToDrafts(parseLeadSectionsFromLiveNotes(liveNotes, initialItems), initialItems),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [matchDrafts, setMatchDrafts] = useState<Record<string, string>>(initialAssign.drafts);
  const [unassignedDraft, setUnassignedDraft] = useState(initialAssign.unassigned);
  const [drafts, setDrafts] = useState<
    Record<string, { verdict: LeadReviewVerdict | ""; coreNotes: string; todoTitle: string }>
  >(() => {
    const init: Record<
      string,
      { verdict: LeadReviewVerdict | ""; coreNotes: string; todoTitle: string }
    > = {};
    for (const it of initialItems) {
      init[it.id] = {
        verdict: (it.verdict as LeadReviewVerdict) || "",
        coreNotes: it.coreNotes ?? "",
        todoTitle: "",
      };
    }
    return init;
  });

  const verdictLabel: Record<LeadReviewVerdict, string> = {
    QUALITY: m.verdictQuality,
    DIGESTION: m.verdictDigestion,
    NORMAL: m.verdictNormal,
    WATCH: m.verdictWatch,
  };

  const active = items.find((i) => i.id === activeId) ?? items[0];
  const brief = active ? facts[active.id] : null;
  const isLive = status === "LIVE";
  const isPost = status === "PROCESSING" || status === "DONE";
  const orderedItems = useMemo(() => {
    const discussed = items
      .filter((it) => it.markerInsertedAt || it.discussedAt)
      .sort((a, b) => {
        const ta = Date.parse(a.markerInsertedAt ?? a.discussedAt ?? "") || 0;
        const tb = Date.parse(b.markerInsertedAt ?? b.discussedAt ?? "") || 0;
        return ta - tb;
      });
    if (discussed.length) return discussed;
    return items;
  }, [items]);

  function flash(ok?: string, err?: string) {
    setFlashOk(ok ?? null);
    setError(err ?? null);
  }

  function run(fn: () => Promise<{ error?: string; ok?: boolean }>, opts?: { refresh?: boolean }) {
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
      else if (opts?.refresh !== false) router.refresh();
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

  function syncAssignFromNotes(nextNotes: string | null) {
    const applied = applySegmentsToDrafts(
      parseLeadSectionsFromLiveNotes(nextNotes, items),
      items,
    );
    setMatchDrafts(applied.drafts);
    setUnassignedDraft(applied.unassigned);
  }

  function markLeadDiscuss(itemId: string, displayName: string) {
    if (!isLive) return;
    const nowIso = new Date().toISOString();
    setActiveId(itemId);
    setCurrentDiscussItemId(itemId);
    setMarkJustAt(Date.now());
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const prevMarker = it.markerInsertedAt ? Date.parse(it.markerInsertedAt) : NaN;
        const anchorMs = startedAt ? Date.parse(startedAt) : NaN;
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
    );
    flash(formatMsg(m.markedDiscuss, { name: displayName }));

    void (async () => {
      try {
        const res = await fetch(`/api/lead-reviews/${meetingId}/discuss-item`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          markerInsertedAt?: string;
          discussedAt?: string;
          liveNotes?: string;
        };
        if (!res.ok || data.error) {
          flash(undefined, data.error || m.needStartFirst);
          return;
        }
        if (data.markerInsertedAt || data.discussedAt) {
          setItems((prev) =>
            prev.map((it) =>
              it.id === itemId
                ? {
                    ...it,
                    markerInsertedAt: data.markerInsertedAt ?? it.markerInsertedAt,
                    discussedAt: data.discussedAt ?? it.discussedAt,
                  }
                : it,
            ),
          );
        }
        if (data.liveNotes != null) setNotes(data.liveNotes);
      } catch (e) {
        flash(undefined, e instanceof Error ? e.message : String(e));
      }
    })();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(status === "DRAFT" || status === "PREP") && (
          <button
            type="button"
            disabled={pending}
            className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm disabled:opacity-40"
            onClick={() =>
              run(async () => {
                const r = await runLeadReviewPrepAction(meetingId);
                if (!r.error) setStatus("PREP");
                return r;
              })
            }
          >
            {status === "DRAFT" ? m.prep : m.refreshBrief}
          </button>
        )}
        {(status === "DRAFT" || status === "PREP") && (
          <button
            type="button"
            disabled={pending}
            className="rounded-lg bg-emerald-700 text-white px-3 py-1.5 text-sm disabled:opacity-40"
            onClick={() =>
              run(async () => {
                const r = await startLeadReviewMeetingAction(meetingId);
                if (!r.error) {
                  setStatus("LIVE");
                  setStartedAt((s) => s ?? new Date().toISOString());
                }
                return r;
              })
            }
          >
            {m.startMeeting}
          </button>
        )}
        {status === "LIVE" && (
          <button
            type="button"
            disabled={pending}
            className="rounded-lg bg-amber-700 text-white px-3 py-1.5 text-sm disabled:opacity-40"
            onClick={() =>
              run(async () => {
                const r = await endLeadReviewMeetingAction(meetingId);
                if (!r.error) {
                  setStatus("PROCESSING");
                  setPostStep("paste");
                  flash(m.endMeetingHint);
                }
                return r;
              }, { refresh: false })
            }
          >
            {m.endMeeting}
          </button>
        )}
        {(status === "LIVE" || status === "PROCESSING") && (
          <button
            type="button"
            disabled={pending}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40"
            onClick={() => run(() => resetLeadReviewToPrepAction(meetingId))}
          >
            {m.backToPrep}
          </button>
        )}
      </div>

      {status !== "DONE" && status !== "PROCESSING" && (
        <Card title={m.recordingTitle}>
          <MeetingBatchRecorder
            meetingId={meetingId}
            apiBase={`/api/lead-reviews/${meetingId}`}
            transcriptStatus={transcriptStatus}
            transcriptError={transcriptError}
            disabled={false}
            onFlash={flash}
            onRecordingStarted={(at) => {
              setStatus("LIVE");
              setStartedAt((s) => s ?? at ?? new Date().toISOString());
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
        </Card>
      )}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {flashOk ? <p className="text-sm text-emerald-700">{flashOk}</p> : null}

      {/* 会后：路径 A 粘贴 + 路径 B 讯飞 */}
      {isPost ? (
        <div className="space-y-3">
          {(tencentNotes || xfyunNotes) && status === "PROCESSING" ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px]">
              <span className="font-medium text-slate-700">{m.postActiveSource}</span>
              <button
                type="button"
                disabled={pending || !tencentNotes}
                onClick={() =>
                  run(async () => {
                    const res = await switchLeadReviewMatchSourceAction(meetingId, "tencent");
                    if (res.error) return res;
                    const next = tencentNotes ?? "";
                    setNotes(next);
                    setTranscript(tencentTranscriptText ?? transcript);
                    setMatchSource("tencent");
                    syncAssignFromNotes(next);
                    setPostStep("assign");
                    flash(m.postSwitchedTencent);
                    return res;
                  }, { refresh: false })
                }
                className={`rounded-full border px-2.5 py-1 ${
                  matchSource === "tencent"
                    ? "border-sky-400 bg-sky-50 font-semibold text-sky-900"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                } disabled:opacity-40`}
              >
                {m.postSourceTencent}
              </button>
              <button
                type="button"
                disabled={pending || !xfyunNotes}
                onClick={() =>
                  run(async () => {
                    const res = await switchLeadReviewMatchSourceAction(meetingId, "xfyun");
                    if (res.error) return res;
                    const next = xfyunNotes ?? "";
                    setNotes(next);
                    setTranscript(xfyunText ?? transcript);
                    setMatchSource("xfyun");
                    syncAssignFromNotes(next);
                    setPostStep("assign");
                    flash(m.postSwitchedXfyun);
                    return res;
                  }, { refresh: false })
                }
                className={`rounded-full border px-2.5 py-1 ${
                  matchSource === "xfyun"
                    ? "border-emerald-400 bg-emerald-50 font-semibold text-emerald-900"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                } disabled:opacity-40`}
              >
                {m.postSourceXfyun}
              </button>
              <span className="text-slate-400">{m.postSourceHint}</span>
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            <section className="rounded-xl border-2 border-sky-200 bg-sky-50/40 p-4 space-y-3">
              <div className="text-sm font-semibold text-slate-900">
                {postStep === "assign" ? m.postPasteTitleMatched : m.postPasteTitle}
              </div>
              {status === "PROCESSING" ? (
                <p className="text-[11px] text-slate-600 leading-relaxed">{m.postPasteHint}</p>
              ) : null}
              {status === "PROCESSING" && postStep !== "assign" ? (
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={7}
                  disabled={pending || workStage === "matching"}
                  placeholder={m.postPastePh}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono leading-relaxed disabled:opacity-60"
                />
              ) : (
                <details className="text-xs">
                  <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                    {transcript.length} chars
                  </summary>
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    rows={4}
                    disabled={status === "DONE" || pending}
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono disabled:opacity-60"
                  />
                </details>
              )}
              {status === "PROCESSING" ? (
                <button
                  type="button"
                  disabled={pending || !transcript.trim() || workStage === "matching"}
                  onClick={() =>
                    run(async () => {
                      setWorkStage("matching");
                      try {
                        const res = await matchLeadReviewMinutesAction(meetingId, transcript);
                        if (res.error) {
                          setWorkStage("idle");
                          return res;
                        }
                        if (res.liveNotes) {
                          setNotes(res.liveNotes);
                          setTencentNotes(res.liveNotes);
                          setMatchSource("tencent");
                          syncAssignFromNotes(res.liveNotes);
                        }
                        setPostStep("assign");
                        setWorkStage("idle");
                        flash(
                          formatMsg(m.postMatchOk, {
                            method: res.matchMethod ?? "ok",
                          }),
                        );
                        return res;
                      } catch (e) {
                        setWorkStage("idle");
                        return { error: e instanceof Error ? e.message : String(e) };
                      }
                    }, { refresh: false })
                  }
                  className="rounded-lg bg-sky-700 text-white px-4 py-2 text-sm font-medium hover:bg-sky-800 disabled:opacity-40"
                >
                  {workStage === "matching"
                    ? m.postMatching
                    : postStep === "paste"
                      ? m.postMatch
                      : m.postRematch}
                </button>
              ) : null}
            </section>

            <section className="rounded-xl border-2 border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
              <div className="text-sm font-semibold text-slate-900">{m.postXfyunTitle}</div>
              <p className="text-[11px] text-slate-600 leading-relaxed">{m.postXfyunHint}</p>
              {xfyunText?.trim() ? (
                <>
                  <p className="text-xs text-slate-500">{xfyunText.length} chars</p>
                  {status === "PROCESSING" ? (
                    <button
                      type="button"
                      disabled={pending || workStage === "matching"}
                      onClick={() =>
                        run(async () => {
                          setWorkStage("matching");
                          try {
                            const res = await matchLeadReviewXfyunAction(meetingId);
                            if (res.error) {
                              setWorkStage("idle");
                              return res;
                            }
                            if (res.liveNotes) {
                              setNotes(res.liveNotes);
                              setXfyunNotes(res.liveNotes);
                              setMatchSource("xfyun");
                              setTranscript(xfyunText);
                              syncAssignFromNotes(res.liveNotes);
                            }
                            setPostStep("assign");
                            setWorkStage("idle");
                            flash(
                              formatMsg(m.postMatchOk, {
                                method: res.matchMethod ?? "xfyun",
                              }),
                            );
                            return res;
                          } catch (e) {
                            setWorkStage("idle");
                            return { error: e instanceof Error ? e.message : String(e) };
                          }
                        }, { refresh: false })
                      }
                      className="rounded-lg bg-emerald-700 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-800 disabled:opacity-40"
                    >
                      {workStage === "matching" ? m.postMatching : m.postXfyunMatch}
                    </button>
                  ) : null}
                </>
              ) : (
                <p className="text-[11px] text-slate-400">{m.postXfyunEmpty}</p>
              )}
              {status === "PROCESSING" ? (
                <MeetingBatchRecorder
                  meetingId={meetingId}
                  apiBase={`/api/lead-reviews/${meetingId}`}
                  transcriptStatus={transcriptStatus}
                  transcriptError={transcriptError}
                  onFlash={flash}
                  onRecordingStarted={(at) => {
                    setStartedAt((s) => s ?? at ?? new Date().toISOString());
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
            </section>
          </div>

          {status === "PROCESSING" ? (
            <div className="flex flex-wrap gap-2 text-[11px]">
              {(
                [
                  ["paste", m.postStepPaste],
                  ["assign", m.postStepAssign],
                  ["tag", m.postStepTag],
                ] as const
              ).map(([key, label]) => {
                const order = { paste: 0, assign: 1, tag: 2 } as const;
                const activeStep = order[postStep] === order[key];
                const done = order[postStep] > order[key];
                return (
                  <span
                    key={key}
                    className={`rounded-full border px-2.5 py-1 ${
                      activeStep
                        ? "border-violet-400 bg-violet-50 text-violet-900 font-medium"
                        : done
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 bg-white text-slate-400"
                    }`}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          ) : null}

          {status === "PROCESSING" && postStep === "assign" ? (
            <section
              id="assignment-timeline"
              className="rounded-xl border-2 border-amber-300 bg-amber-50/30 p-4 space-y-4"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900">{m.postAssignTitle}</div>
                <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{m.postAssignHint}</p>
              </div>
              <div className="rounded-lg border border-amber-100 bg-white p-3 space-y-2">
                <p className="text-xs font-medium text-amber-900">{m.postUnassigned}</p>
                <textarea
                  value={unassignedDraft}
                  onChange={(e) => setUnassignedDraft(e.target.value)}
                  rows={3}
                  placeholder={m.postUnassignedPh}
                  className="w-full rounded border border-amber-100 px-2 py-1.5 text-xs font-mono"
                />
              </div>
              <ol className="space-y-3">
                {orderedItems.map((it, idx) => (
                  <li key={it.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-sky-500 text-[11px] font-semibold text-sky-800">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {it.displayName ?? "—"}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {(matchDrafts[it.id] ?? "").trim() ? "" : m.postNoContent}
                        </p>
                      </div>
                    </div>
                    <textarea
                      value={matchDrafts[it.id] ?? ""}
                      onChange={(e) =>
                        setMatchDrafts((prev) => ({ ...prev, [it.id]: e.target.value }))
                      }
                      rows={4}
                      className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs font-mono"
                    />
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      setWorkStage("saving");
                      const res = await saveLeadReviewAssignmentAction(meetingId, {
                        drafts: matchDrafts,
                        unassigned: unassignedDraft,
                        applyToCoreNotes: false,
                      });
                      setWorkStage("idle");
                      if (res.error) return res;
                      if (res.liveNotes) setNotes(res.liveNotes);
                      flash(m.postSaveAssign);
                      return res;
                    }, { refresh: false })
                  }
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                >
                  {m.postSaveAssign}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      setWorkStage("saving");
                      const res = await saveLeadReviewAssignmentAction(meetingId, {
                        drafts: matchDrafts,
                        unassigned: unassignedDraft,
                        applyToCoreNotes: true,
                      });
                      setWorkStage("idle");
                      if (res.error) return res;
                      if (res.liveNotes) setNotes(res.liveNotes);
                      setDrafts((prev) => {
                        const next = { ...prev };
                        for (const it of items) {
                          const text = (matchDrafts[it.id] ?? "").trim();
                          if (!text || !next[it.id]) continue;
                          if (!next[it.id]!.coreNotes.trim()) {
                            next[it.id] = { ...next[it.id]!, coreNotes: text };
                          }
                        }
                        return next;
                      });
                      setPostStep("tag");
                      flash(m.postApplied);
                      return res;
                    }, { refresh: false })
                  }
                  className="rounded-lg bg-violet-700 text-white px-4 py-2 text-sm font-medium hover:bg-violet-800 disabled:opacity-40"
                >
                  {m.postApplyNotes}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {stats && status === "DONE" ? (
        <Card title={m.statsTitle}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            {(
              [
                ["ALL", m.statsAll],
                ["CHANNEL", m.statsChannel],
                ["NURTURE", m.statsNurture],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <div className="text-xs text-slate-500 mb-2">{label}</div>
                <ul className="space-y-1">
                  {LEAD_REVIEW_VERDICTS.map((v) => (
                    <li key={v} className="flex justify-between">
                      <span>{verdictLabel[v]}</span>
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
        <Card
          title={
            <>
              {m.agenda}
              {isLive ? <span className="font-normal text-slate-400">{m.agendaHint}</span> : null}
            </>
          }
        >
          <ul className="divide-y divide-slate-50 -mx-1">
            {items.map((it) => {
              const isDiscussing = currentDiscussItemId === it.id && isLive;
              const justMarked =
                isDiscussing && markJustAt > 0 && Date.now() - markJustAt < 2500;
              const activeRow = it.id === active?.id;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(it.id);
                      if (isLive) {
                        markLeadDiscuss(it.id, it.displayName ?? it.id.slice(0, 8));
                      }
                    }}
                    className={`w-full text-left px-2 py-2 rounded-lg text-sm transition-colors ${
                      isDiscussing
                        ? "bg-emerald-50/90 text-emerald-950 ring-1 ring-emerald-200"
                        : activeRow
                          ? "bg-sky-50 text-sky-900"
                          : "hover:bg-slate-50"
                    } ${justMarked ? "ring-2 ring-emerald-400" : ""}`}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge tone={it.source === "CHANNEL" ? "amber" : "blue"}>
                        {it.source === "CHANNEL" ? m.sourceChannel : m.sourceNurture}
                      </Badge>
                      {isDiscussing ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          {m.discussing}
                        </span>
                      ) : it.status === "DISCUSSED" || it.status === "CONFIRMED" ? (
                        <Badge tone="green">{m.doneBadge}</Badge>
                      ) : null}
                      {it.verdict ? (
                        <Badge tone="zinc">
                          {verdictLabel[it.verdict as LeadReviewVerdict] ?? it.verdict}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 font-medium truncate">{it.displayName ?? "—"}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {it.status === "CONFIRMED"
                        ? m.confirmed
                        : it.status === "DISCUSSED"
                          ? isDiscussing
                            ? m.nowDiscussing
                            : m.discussed
                          : isLive
                            ? m.pendingDiscuss
                            : m.pending}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {active ? (
          <div className="space-y-4">
            <Card title={brief?.name || active.displayName || "—"}>
              {brief ? (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                  <Fact label={m.factsType} value={brief.typeDetail} />
                  <Fact
                    label={m.factsRankStatus}
                    value={[brief.rank, brief.status].filter(Boolean).join(" · ")}
                  />
                  <Fact label={m.factsSales} value={brief.salesman} />
                  <Fact label={m.factsPrevSales} value={brief.staSalesOld} />
                  <Fact label={brief.dateLabel} value={brief.dateValue} />
                  <Fact label={m.factsKpi} value={brief.jzDate} />
                  <Fact label={m.factsRegion} value={brief.region} />
                  <Fact label={m.factsProvince} value={brief.province} />
                  <Fact label={m.factsSource} value={brief.sourceLabel} />
                  <Fact label={m.factsSourceDetail} value={brief.sourceDetail} />
                  <Fact label={m.factsContact} value={brief.contName} />
                  <Fact label={m.factsTitle} value={brief.contDuty} />
                  <Fact label={m.factsPhone} value={brief.phone} />
                  <Fact label={m.factsEmail} value={brief.contEmail} />
                  <Fact label={m.factsAgent} value={brief.overseaAgent} />
                  <Fact label={m.factsZone} value={brief.zone} />
                  <Fact label={m.factsCompanyId} value={brief.companyId} />
                  <Fact label={m.factsClueId} value={brief.clueId} />
                </dl>
              ) : (
                <p className="text-sm text-slate-500">{m.noSource}</p>
              )}
            </Card>

            <Card title={m.bizRecords}>
              {brief?.traceDetail || brief?.detail ? (
                <dl className="space-y-4 text-sm">
                  {brief.traceDetail ? (
                    <div>
                      <dt className="text-xs text-slate-500 mb-1">{m.bizRecord1}</dt>
                      <dd className="text-slate-800 whitespace-pre-wrap break-words rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 max-h-64 overflow-y-auto">
                        {brief.traceDetail}
                      </dd>
                    </div>
                  ) : null}
                  {brief.detail ? (
                    <div>
                      <dt className="text-xs text-slate-500 mb-1">{m.bizRecord2}</dt>
                      <dd className="text-slate-800 whitespace-pre-wrap break-words rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 max-h-64 overflow-y-auto">
                        {brief.detail}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p className="text-sm text-slate-500">
                  {m.noBizRecords}
                  {active.source === "CHANNEL" ? m.noBizChannelHint : ""}
                </p>
              )}
            </Card>

            {brief?.topics?.length ? (
              <Card title={m.topics}>
                <ul className="list-disc pl-5 space-y-0.5 text-sm text-slate-700">
                  {brief.topics.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {(status === "LIVE" ||
              status === "PROCESSING" ||
              status === "DONE" ||
              postStep === "tag") && (
              <Card title={m.verdictTitle}>
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
                          {verdictLabel[v]}
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
                    placeholder={m.notesPh}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  {status === "PROCESSING" && active.status !== "CONFIRMED" ? (
                    <>
                      <input
                        value={drafts[active.id]?.todoTitle ?? ""}
                        onChange={(e) => updateDraft(active.id, { todoTitle: e.target.value })}
                        placeholder={m.todoPh}
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
                        {m.confirmItem}
                      </button>
                    </>
                  ) : null}
                  {active.status === "CONFIRMED" ? (
                    <p className="text-sm text-emerald-700">{m.itemConfirmed}</p>
                  ) : null}
                </div>
              </Card>
            )}

            {(status === "LIVE" || status === "PROCESSING") && (
              <Card title={m.meetingNotes}>
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
                  {m.saveNotes}
                </button>
              </Card>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
