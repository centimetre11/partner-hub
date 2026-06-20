"use client";

import type { ReactNode } from "react";
import type { IntakeProposal, IntakeScope, IntakeClarification } from "@/lib/ai-intake";
import type { ClarificationAnswer, ProposalEditPatch } from "@/lib/clarification-apply";
import type { AiTraceStep } from "@/lib/ai-trace";
import type { ChatImage } from "@/lib/ai";
import type { ProposalChanges } from "@/lib/proposal-merge";
import { normalizedToIntake } from "@/lib/proposal-normalize";
import type { NormalizedProposal } from "@/lib/proposal-normalize";
import { AiProcessTrace } from "@/components/ai-process-trace";
import { LiveProposalDraft } from "@/components/live-proposal-draft";

import { prepareChatImagesFromFiles } from "@/lib/ai-images";
import { useMessages } from "@/lib/i18n/context";

type Msg = { role: "user" | "assistant"; content: string; trace?: AiTraceStep[]; images?: ChatImage[] };

export function AiWorkflowPanel({
  title,
  subtitle,
  onClose,
  messages,
  loading,
  liveTrace,
  replyText,
  phase,
  phaseLabel,
  proposal,
  patchChanges,
  questions,
  clarifications,
  onDirectClarify,
  onAiClarify,
  onProposalEdit,
  ready,
  scope,
  partnerId,
  sourceText,
  intent,
  onApplied,
  input,
  onInputChange,
  onSend,
  onStop,
  pendingImages = [],
  onAddImages,
  onRemoveImage,
  inputPlaceholder,
  sendDisabled,
  headerExtra,
  leftFooter,
  showDraftPanel = true,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  messages: Msg[];
  loading: boolean;
  liveTrace: AiTraceStep[];
  replyText: string;
  phase?: string;
  phaseLabel?: string;
  proposal: IntakeProposal | null;
  patchChanges?: ProposalChanges | null;
  questions?: string[];
  clarifications?: IntakeClarification[];
  onDirectClarify?: (id: string, value: string) => void;
  onAiClarify?: (answers: ClarificationAnswer[]) => void;
  onProposalEdit?: (patch: ProposalEditPatch) => void;
  ready?: boolean;
  scope?: IntakeScope;
  partnerId?: string;
  sourceText?: string;
  /** new_partner: active = create as a formal partner immediately */
  intent?: "prospect" | "active";
  onApplied?: (partnerId: string) => void;
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  /** Stop the current AI stream */
  onStop?: () => void;
  pendingImages?: ChatImage[];
  onAddImages?: (images: ChatImage[]) => void;
  onRemoveImage?: (index: number) => void;
  inputPlaceholder?: string;
  sendDisabled?: boolean;
  headerExtra?: ReactNode;
  leftFooter?: ReactNode;
  /** Whether to show the right-hand live draft panel (can hide in query mode) */
  showDraftPanel?: boolean;
}) {
  const { intakePanel: ip } = useMessages();

  async function apply(filtered: NormalizedProposal) {
    const res = await fetch("/api/ai/intake/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: scope ?? "new_partner",
        partnerId,
        proposal: normalizedToIntake(filtered),
        sourceText,
        intent,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to save");
    onApplied?.(data.partnerId);
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-b flex items-center justify-between bg-slate-900 text-white">
        <div className="min-w-0 flex-1 pr-2">
          <div className="text-sm sm:text-base font-semibold truncate">✦ {title}</div>
          {subtitle && <div className="text-[11px] sm:text-xs text-slate-400 mt-0.5 line-clamp-2">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {headerExtra}
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none px-1">
              ×
            </button>
          )}
        </div>
      </div>

      <div
        className={`flex-1 min-h-0 grid grid-cols-1 ${showDraftPanel ? "md:grid-cols-[38%_62%]" : ""}`}
      >
        {/* Left: research */}
        <div className="flex flex-col min-h-0 border-r border-slate-100">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}>
                {m.role === "assistant" && m.trace && m.trace.length > 0 && (
                  <AiProcessTrace steps={m.trace} className="w-full" />
                )}
                <div
                  className={`max-w-[96%] rounded-lg px-4 py-3 text-[15px] whitespace-pre-wrap leading-relaxed ${
                    m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {m.images && m.images.length > 0 && (
                    <div className={`flex flex-wrap gap-2 mb-2 ${m.role === "user" ? "" : ""}`}>
                      {m.images.map((img, j) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={j}
                          src={img.url}
                          alt={img.name ?? "Image"}
                          className="max-h-28 max-w-[140px] rounded-lg border border-white/20 object-cover"
                        />
                      ))}
                    </div>
                  )}
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="w-full space-y-2">
                <AiProcessTrace steps={liveTrace} loading phase={phase} phaseLabel={phaseLabel} />
                {replyText && (
                  <div className="rounded-lg px-4 py-3 text-[15px] whitespace-pre-wrap leading-relaxed bg-slate-100 text-slate-800 border border-slate-200">
                    {replyText}
                    <span className="inline-block w-1.5 h-4 bg-slate-400 ml-0.5 align-middle" />
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="shrink-0 border-t p-4">
            {leftFooter ?? (
              <div className="space-y-2">
                {pendingImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pendingImages.map((img, i) => (
                      <div key={i} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt={img.name ?? "Pending"} className="h-16 w-16 rounded-lg object-cover border border-slate-200" />
                        {onRemoveImage && (
                          <button
                            type="button"
                            onClick={() => onRemoveImage(i)}
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-slate-800 text-white text-xs leading-none"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-3 items-end">
                {onAddImages && (
                  <label className="shrink-0 cursor-pointer rounded-lg border border-slate-200 px-3 py-3 text-slate-500 hover:border-slate-300 hover:text-sky-600" title={ip.addImageTitle}>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = [...(e.target.files ?? [])];
                        if (!files.length) return;
                        void prepareChatImagesFromFiles(files).then((imgs) => imgs.length && onAddImages(imgs));
                        e.target.value = "";
                      }}
                    />
                    📷
                  </label>
                )}
                <textarea
                  value={input}
                  onChange={(e) => onInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      onSend();
                    }
                  }}
                  onPaste={(e) => {
                    if (!onAddImages) return;
                    const files = [...e.clipboardData.items]
                      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
                      .map((it) => it.getAsFile())
                      .filter((f): f is File => !!f);
                    if (!files.length) return;
                    e.preventDefault();
                    void prepareChatImagesFromFiles(files).then((imgs) => imgs.length && onAddImages(imgs));
                  }}
                  onDrop={(e) => {
                    if (!onAddImages) return;
                    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
                    if (!files.length) return;
                    e.preventDefault();
                    void prepareChatImagesFromFiles(files).then((imgs) => imgs.length && onAddImages(imgs));
                  }}
                  rows={3}
                  placeholder={inputPlaceholder ?? ip.inputDefault}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-3 text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                {loading && onStop ? (
                  <button
                    onClick={onStop}
                    className="rounded-lg bg-red-500 text-white px-6 py-3 text-[15px] font-medium hover:bg-red-600 shrink-0 flex items-center gap-2"
                    title={ip.stopTitle}
                  >
                    <span className="inline-block w-3 h-3 bg-white rounded-[2px]" />
                    {ip.stop}
                  </button>
                ) : (
                  <button
                    onClick={onSend}
                    disabled={sendDisabled}
                    className="rounded-lg bg-slate-900 text-white px-6 py-3 text-[15px] font-medium hover:bg-slate-800 disabled:opacity-50 shrink-0"
                  >
                    {ip.send}
                  </button>
                )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: live draft */}
        {showDraftPanel && (
        <div className="flex flex-col min-h-0 p-5 md:p-6 bg-slate-50/50">
          <LiveProposalDraft
            proposal={proposal}
            changes={patchChanges}
            onConfirm={apply}
          confirmLabel={
            scope === "business_record"
              ? ready
                ? ip.confirmSyncReady
                : ip.confirmSyncDraft
              : ready
                ? ip.confirmReady
                : ip.confirmDraft
          }
            questions={questions}
            clarifications={clarifications}
            onDirectClarify={onDirectClarify}
            onAiClarify={onAiClarify}
            onProposalEdit={onProposalEdit}
            ready={ready}
            loading={loading}
            scope={scope}
          />
        </div>
        )}
      </div>
    </div>
  );
}
