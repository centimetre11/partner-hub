"use client";

import type { IntakeClarification } from "@/lib/ai-intake";
import {
  getClarificationMode,
  partitionClarifications,
  type ClarificationAnswer,
} from "@/lib/clarification-apply";
import { AiClarificationCard } from "@/components/ai-clarification-card";
import { useMessages } from "@/lib/i18n";

/** Intake clarifications rendered inline in the left chat — Cursor-style cards, block until AI batch is submitted. */
export function IntakeClarificationChat({
  clarifications,
  disabled,
  onDirectClarify,
  onAiClarify,
}: {
  clarifications: IntakeClarification[];
  disabled?: boolean;
  onDirectClarify?: (id: string, value: string) => void;
  onAiClarify?: (answers: ClarificationAnswer[]) => void;
}) {
  const am = useMessages().assistant;
  const { identity, direct, ai } = partitionClarifications(clarifications);

  const identityDirect = identity.filter((c) => getClarificationMode(c) === "direct");
  const identityAi = identity.filter((c) => getClarificationMode(c) === "ai");
  const allAi = [...identityAi, ...ai];

  if (!identityDirect.length && !direct.length && !allAi.length) return null;

  return (
    <div className="space-y-3 w-full">
      {identityDirect.length > 0 && (
        <AiClarificationCard
          key={identityDirect.map((c) => c.id).join("-")}
          clarifications={identityDirect.map(toItem)}
          title={am.clarifyIdentityTitle}
          variant="identity"
          disabled={disabled}
          showSkip={false}
          onImmediatePick={
            onDirectClarify
              ? (a) => onDirectClarify(a.id, a.value)
              : undefined
          }
        />
      )}
      {direct.length > 0 && (
        <AiClarificationCard
          key={direct.map((c) => c.id).join("-")}
          clarifications={direct.map(toItem)}
          title={am.clarifyDirectTitle}
          variant="direct"
          disabled={disabled}
          showSkip={false}
          onImmediatePick={
            onDirectClarify
              ? (a) => onDirectClarify(a.id, a.value)
              : undefined
          }
        />
      )}
      {allAi.length > 0 && onAiClarify && (
        <AiClarificationCard
          key={allAi.map((c) => c.id).join("-")}
          clarifications={allAi.map(toItem)}
          title={am.clarifyAiTitle}
          disabled={disabled}
          showSkip={false}
          continueLabel={am.clarifyAiSubmit}
          onContinue={onAiClarify}
        />
      )}
    </div>
  );
}

function toItem(c: IntakeClarification) {
  return {
    id: c.id,
    question: c.question,
    options: c.options,
    multi: c.multi,
    allowOther: c.allowOther,
  };
}

/** True when AI-mode clarifications are pending — blocks free-form send until answered. */
export function hasPendingAiClarifications(clarifications: IntakeClarification[]): boolean {
  const { identity, ai } = partitionClarifications(clarifications);
  const identityAi = identity.filter((c) => getClarificationMode(c) === "ai");
  return identityAi.length + ai.length > 0;
}
