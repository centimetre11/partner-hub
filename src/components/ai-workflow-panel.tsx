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
import {
  IntakeClarificationChat,
  hasPendingAiClarifications,
} from "@/components/intake-clarification-chat";

import { prepareChatImagesFromFiles } from "@/lib/ai-images";
import { AutoResizeTextarea } from "@/components/auto-resize-textarea";
import { useMessages } from "@/lib/i18n/context";

type Msg = { role: "user" | "assistant"; content: string; trace?: AiTraceStep[]; images?: ChatImage[] };

const chatBubble = {
  user: "max-w-[86%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed bg-slate-900 text-white",
  assistant:
    "max-w-[86%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed bg-slate-100 text-slate-800",
};

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export function AiWorkflowPanel({
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
  intent?: "prospect" | "active";
  onApplied?: (partnerId: string) => void;
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  pendingImages?: ChatImage[];
  onAddImages?: (images: ChatImage[]) => void;
  onRemoveImage?: (index: number) => void;
  inputPlaceholder?: string;
  sendDisabled?: boolean;
  headerExtra?: ReactNode;
  leftFooter?: ReactNode;
  showDraftPanel?: boolean;
}) {
  const { intakePanel: ip } = useMessages();
  const pendingAiClarify = hasPendingAiClarifications(clarifications ?? []);
  const clarifyBlocked = pendingAiClarify && !loading;

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
    <div className="relative flex flex-col h-full min-h-0 bg-white">
      {(onClose || headerExtra) && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
          {headerExtra}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-xl leading-none flex items-center justify-center"
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>
      )}

      <div className={`flex-1 min-h-0 grid grid-cols-1 ${showDraftPanel ? "xl:grid-cols-5 gap-4 p-3" : "p-3"}`}>
        {/* Left: conversation */}
        <div
          className={`flex flex-col min-h-0 bg-white rounded-lg border border-slate-200/80 shadow-sm ${
            showDraftPanel ? "xl:col-span-3" : ""
          }`}
        >
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}>
                {m.role === "assistant" && m.trace && m.trace.length > 0 && (
                  <AiProcessTrace steps={m.trace} className="w-full max-w-[92%]" />
                )}
                <div className={m.role === "user" ? chatBubble.user : chatBubble.assistant}>
                  {m.images && m.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
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
            {(clarifications?.length ?? 0) > 0 && !loading && (
              <div className="flex justify-start w-full">
                <IntakeClarificationChat
                  clarifications={clarifications!}
                  disabled={loading}
                  onDirectClarify={onDirectClarify}
                  onAiClarify={onAiClarify}
                />
              </div>
            )}
            {loading && (
              <div className="w-full space-y-2">
                <AiProcessTrace
                  steps={liveTrace}
                  loading
                  phase={phase}
                  phaseLabel={phaseLabel}
                  className="max-w-[92%]"
                />
                {replyText && (
                  <div className={`${chatBubble.assistant} border border-slate-200/80`}>
                    {replyText}
                    <span className="inline-block w-1.5 h-4 bg-slate-400 ml-0.5 align-middle" />
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="shrink-0 border-t border-slate-100 p-3">
            {leftFooter ?? (
              <div className="space-y-2">
                {clarifyBlocked && (
                  <div className="text-xs text-sky-700 bg-sky-50 rounded-lg px-3 py-2">{ip.clarifyBlockedHint}</div>
                )}
                {pendingImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pendingImages.map((img, i) => (
                      <div key={i} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={img.name ?? "Pending"}
                          className="h-16 w-16 rounded-lg object-cover border border-slate-200"
                        />
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
                <div className="flex gap-2 items-end">
                  {onAddImages && (
                    <label
                      className="shrink-0 cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-slate-500 hover:border-slate-300 hover:text-sky-600"
                      title={ip.addImageTitle}
                    >
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
                  <AutoResizeTextarea
                    value={input}
                    onChange={(e) => onInputChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !clarifyBlocked) {
                        e.preventDefault();
                        onSend();
                      }
                    }}
                    onPaste={(e) => {
                      if (!onAddImages || clarifyBlocked) return;
                      const files = [...e.clipboardData.items]
                        .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
                        .map((it) => it.getAsFile())
                        .filter((f): f is File => !!f);
                      if (!files.length) return;
                      e.preventDefault();
                      void prepareChatImagesFromFiles(files).then((imgs) => imgs.length && onAddImages(imgs));
                    }}
                    onDrop={(e) => {
                      if (!onAddImages || clarifyBlocked) return;
                      const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
                      if (!files.length) return;
                      e.preventDefault();
                      void prepareChatImagesFromFiles(files).then((imgs) => imgs.length && onAddImages(imgs));
                    }}
                    disabled={clarifyBlocked}
                    placeholder={
                      clarifyBlocked ? ip.clarifyBlockedPlaceholder : (inputPlaceholder ?? ip.inputDefault)
                    }
                    className={`${inputClass} flex-1 resize-none disabled:bg-slate-50 disabled:text-slate-400`}
                  />
                  {loading && onStop ? (
                    <button
                      onClick={onStop}
                      className="rounded-lg bg-red-500 text-white px-4 py-2 text-sm font-medium hover:bg-red-600 shrink-0 flex items-center gap-2"
                      title={ip.stopTitle}
                    >
                      <span className="inline-block w-3 h-3 bg-white rounded-[2px]" />
                      {ip.stop}
                    </button>
                  ) : (
                    <button
                      onClick={onSend}
                      disabled={sendDisabled || clarifyBlocked}
                      className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40 shrink-0"
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
          <div className="xl:col-span-2 flex flex-col min-h-0 space-y-4">
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
              ready={ready}
              loading={loading}
              scope={scope}
              onProposalEdit={onProposalEdit}
              identityBlocked={(clarifications?.length ?? 0) > 0}
            />
          </div>
        )}
      </div>
    </div>
  );
}
