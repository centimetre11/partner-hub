"use client";

import type { IntakeClarification } from "@/lib/ai-intake";
import { shouldBlockChatInput } from "@/lib/ai-clarifications";
import type { ClarificationAnswer } from "@/lib/clarification-apply";
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
  return (
    <AiClarificationFlow
      clarifications={clarifications}
      disabled={disabled}
      onDirectPick={onDirectClarify}
      onRequiredContinue={onAiClarify}
      onPreferencePick={onPreferenceClarify}
    />
  );
}

/** Blocks free-form chat until tier:"required" clarifications are answered (direct or AI-batch). */
export function hasPendingRequiredClarifications(clarifications: IntakeClarification[]): boolean {
  return shouldBlockChatInput(clarifications);
}
