"use client";

import { useEffect, useRef } from "react";
import type { AiClarification, ClarificationAnswer } from "@/lib/ai-clarifications";
import { getClarificationTier, partitionClarificationsByTier, shouldBlockChatInput } from "@/lib/ai-clarifications";
import { getClarificationMode } from "@/lib/clarification-apply";
import { AiClarificationCard } from "@/components/ai-clarification-card";
import { useMessages } from "@/lib/i18n";

/**
 * Unified clarification UI — required gate + optional preferences in one flow.
 * Required (tier:"required"): blocks chat until answered — direct picks apply immediately; AI-batch uses Continue.
 * Preference (tier:"preference"): optional chips / quick confirm; does not block.
 */
export function AiClarificationFlow({
  clarifications,
  disabled,
  onRequiredContinue,
  onRequiredSkip,
  onPreferencePick,
  onDirectPick,
  /** @deprecated Pass all items via clarifications; merged when provided for backward compat */
  directClarifications,
}: {
  clarifications: AiClarification[];
  disabled?: boolean;
  onRequiredContinue?: (answers: ClarificationAnswer[]) => void;
  onRequiredSkip?: () => void;
  onPreferencePick?: (answer: ClarificationAnswer) => void;
  onDirectPick?: (id: string, value: string) => void;
  directClarifications?: AiClarification[];
}) {
  const { assistant: am, clarifications: cf } = useMessages();
  const anchorRef = useRef<HTMLDivElement>(null);
  const all = mergeClarifications(clarifications, directClarifications);
  const { required, preference } = partitionClarificationsByTier(all);
  const scrollKey = all.map((c) => c.id).join("-");

  useEffect(() => {
    if (!all.length) return;
    const t = window.setTimeout(() => {
      anchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [scrollKey, all.length]);

  const requiredDirect = required.filter((c) => getClarificationMode(c) === "direct");
  const requiredAi = required.filter((c) => getClarificationMode(c) !== "direct");
  const requiredIdentityDirect = requiredDirect.filter((c) => c.kind === "identity");
  const requiredOtherDirect = requiredDirect.filter((c) => c.kind !== "identity");

  const preferenceDirect = preference.filter((c) => getClarificationMode(c) === "direct");
  const preferenceAi = preference.filter((c) => getClarificationMode(c) !== "direct");

  if (
    !requiredIdentityDirect.length &&
    !requiredOtherDirect.length &&
    !requiredAi.length &&
    !preferenceDirect.length &&
    !preferenceAi.length
  ) {
    return null;
  }

  return (
    <div ref={anchorRef} className="space-y-3 w-full scroll-mt-4">
      {requiredIdentityDirect.length > 0 && onDirectPick && (
        <AiClarificationCard
          key={requiredIdentityDirect.map((c) => c.id).join("-")}
          clarifications={requiredIdentityDirect.map(toItem)}
          title={am.clarifyIdentityTitle}
          hint={am.clarifyIdentityHint}
          variant="identity"
          disabled={disabled}
          showSkip={false}
          onImmediatePick={(a) => onDirectPick(a.id, a.value)}
        />
      )}

      {requiredOtherDirect.length > 0 && onDirectPick && (
        <AiClarificationCard
          key={requiredOtherDirect.map((c) => c.id).join("-")}
          clarifications={requiredOtherDirect.map(toItem)}
          title={cf.requiredTitle}
          variant="required"
          disabled={disabled}
          showSkip={false}
          onImmediatePick={(a) => onDirectPick(a.id, a.value)}
        />
      )}

      {requiredAi.length > 0 && onRequiredContinue && (
        <AiClarificationCard
          key={requiredAi.map((c) => c.id).join("-")}
          clarifications={requiredAi.map(toItem)}
          title={cf.requiredTitle}
          variant="required"
          disabled={disabled}
          showSkip={!!onRequiredSkip}
          continueLabel={cf.requiredContinue}
          onContinue={onRequiredContinue}
          onSkip={onRequiredSkip}
        />
      )}

      {preferenceDirect.length > 0 && onDirectPick && (
        <AiClarificationCard
          key={preferenceDirect.map((c) => c.id).join("-")}
          clarifications={preferenceDirect.map(toItem)}
          title={cf.directTitle}
          variant="direct"
          disabled={disabled}
          showSkip={false}
          onImmediatePick={(a) => onDirectPick(a.id, a.value)}
        />
      )}

      {preferenceAi.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-white/80">
            <div className="text-xs font-semibold text-slate-600">{cf.preferenceTitle}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{cf.preferenceHint}</div>
          </div>
          <div className="p-4 space-y-4">
            {preferenceAi.map((c) => (
              <div key={c.id} className="space-y-2">
                <div className="text-sm text-slate-700">{c.question}</div>
                <div className="flex flex-wrap gap-2">
                  {c.options.map((opt, idx) => (
                    <button
                      key={`${c.id}-${idx}`}
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        onPreferencePick?.({ id: c.id, question: c.question, value: opt })
                      }
                      className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors disabled:opacity-40 ${
                        idx === 0
                          ? "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {opt}
                      {idx === 0 && (
                        <span className="ml-1 text-[10px] opacity-70">({cf.recommended})</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { shouldBlockChatInput, getClarificationTier };

function mergeClarifications(
  clarifications: AiClarification[],
  directClarifications?: AiClarification[]
): AiClarification[] {
  const out = [...clarifications];
  const seen = new Set(out.map((c) => c.id));
  for (const c of directClarifications ?? []) {
    if (!seen.has(c.id)) out.push(c);
  }
  return out;
}

function toItem(c: AiClarification) {
  return {
    id: c.id,
    question: c.question,
    options: c.options,
    multi: c.multi,
    allowOther: c.allowOther,
    control: c.control,
    placeholder: c.placeholder,
  };
}
