"use client";

import type { AiClarification, ClarificationAnswer } from "@/lib/ai-clarifications";
import { partitionClarificationsByTier, shouldBlockChatInput } from "@/lib/ai-clarifications";
import { AiClarificationCard } from "@/components/ai-clarification-card";
import { useMessages } from "@/lib/i18n";

/**
 * Unified clarification UI — required gate + optional preferences in one flow.
 * Required: blocks chat until batch submitted.
 * Preference: compact chips; AI already continued with defaults.
 */
export function AiClarificationFlow({
  clarifications,
  disabled,
  onRequiredContinue,
  onRequiredSkip,
  onPreferencePick,
  onDirectPick,
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
  const cf = useMessages().clarifications;
  const { required, preference } = partitionClarificationsByTier(clarifications);

  const requiredAi = required.filter((c) => c.apply !== "direct");
  const requiredDirect = required.filter((c) => c.apply === "direct");
  const allDirect = [...(directClarifications ?? []), ...requiredDirect];

  if (!requiredAi.length && !allDirect.length && !preference.length) return null;

  return (
    <div className="space-y-3 w-full">
      {allDirect.length > 0 && onDirectPick && (
        <AiClarificationCard
          key={allDirect.map((c) => c.id).join("-")}
          clarifications={allDirect.map(toItem)}
          title={cf.directTitle}
          variant="direct"
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

      {preference.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-white/80">
            <div className="text-xs font-semibold text-slate-600">{cf.preferenceTitle}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{cf.preferenceHint}</div>
          </div>
          <div className="p-4 space-y-4">
            {preference.map((c) => (
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

export { shouldBlockChatInput };

function toItem(c: AiClarification) {
  return {
    id: c.id,
    question: c.question,
    options: c.options,
    multi: c.multi,
    allowOther: c.allowOther,
  };
}
