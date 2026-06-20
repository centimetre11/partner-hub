"use client";

import type { IntakeClarification } from "@/lib/ai-intake";
import {
  getClarificationMode,
  partitionClarifications,
  type ClarificationAnswer,
} from "@/lib/clarification-apply";
import { hasRequiredClarifications } from "@/lib/ai-clarifications";
import { AiClarificationFlow } from "@/components/ai-clarification-flow";

/** Intake clarifications — unified required gate + optional preferences. */
export function IntakeClarificationChat({
  clarifications,
  disabled,
  onDirectClarify,
  onAiClarify,
  onPreferenceClarify,
}: {
  clarifications: IntakeClarification[];
  disabled?: boolean;
  onDirectClarify?: (id: string, value: string) => void;
  onAiClarify?: (answers: ClarificationAnswer[]) => void;
  onPreferenceClarify?: (answer: ClarificationAnswer) => void;
}) {
  const { identity, direct, ai } = partitionClarifications(clarifications);

  const identityDirect = identity.filter((c) => getClarificationMode(c) === "direct");
  const identityAi = identity.filter((c) => getClarificationMode(c) === "ai");
  const directClarifications = [...identityDirect, ...direct];
  const aiClarifications = [...identityAi, ...ai];

  return (
    <AiClarificationFlow
      clarifications={aiClarifications}
      directClarifications={directClarifications}
      disabled={disabled}
      onDirectPick={onDirectClarify}
      onRequiredContinue={onAiClarify}
      onPreferencePick={onPreferenceClarify}
    />
  );
}

/** Blocks free-form send only when required (AI-batch) clarifications are pending. */
export function hasPendingAiClarifications(clarifications: IntakeClarification[]): boolean {
  const { identity, ai } = partitionClarifications(clarifications);
  const pendingAi = [
    ...identity.filter((c) => getClarificationMode(c) === "ai"),
    ...ai,
  ];
  return hasRequiredClarifications(pendingAi);
}
