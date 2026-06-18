import type { IntakeClarification, IntakeProposal } from "@/lib/ai-intake";
import { PARTNER_FIELD_LABELS } from "@/lib/constants";
import { fieldKey, mergeProposalPatch, type ProposalChanges } from "@/lib/proposal-merge";

export type ClarificationApplyMode = "direct" | "ai";

/** Profile fields that map 1:1 from clarification id → draft field (no LLM round-trip) */
const DIRECT_CLARIFICATION_IDS = new Set([
  "country",
  "city",
  "headcount",
  "category",
  "industry",
  "industries",
  "pipelineStage",
  "partnerArchetype",
  "valuePattern",
  "companyType",
  "certLevel",
  "currentTools",
  "bestChannel",
  "tier",
  "dedicatedHeadcount",
  "website",
]);

const OPEN_ENDED_OPTION = /^(other|unknown|not sure|tbd|n\/a|不详|其他|未知|待判定|不清楚)/i;

export function isOpenEndedClarificationOption(option: string): boolean {
  return OPEN_ENDED_OPTION.test(option.trim());
}

export function getClarificationMode(c: IntakeClarification): ClarificationApplyMode {
  if (c.apply === "direct" || c.apply === "ai") return c.apply;
  if (DIRECT_CLARIFICATION_IDS.has(c.id) && c.id in PARTNER_FIELD_LABELS) return "direct";
  return "ai";
}

export function partitionClarifications(clarifications: IntakeClarification[]) {
  const direct: IntakeClarification[] = [];
  const ai: IntakeClarification[] = [];
  for (const c of clarifications) {
    (getClarificationMode(c) === "direct" ? direct : ai).push(c);
  }
  return { direct, ai };
}

export function applyDirectClarification(
  proposal: IntakeProposal,
  clarification: IntakeClarification,
  value: string
): { proposal: IntakeProposal; changes: ProposalChanges } {
  const field = clarification.id in PARTNER_FIELD_LABELS ? clarification.id : clarification.id;
  const label = PARTNER_FIELD_LABELS[field] ?? clarification.question;
  const { draft, changes } = mergeProposalPatch(
    proposal,
    [
      {
        op: "upsert_field",
        key: fieldKey(field),
        field,
        label,
        newValue: value.trim(),
        reason: "User selected option",
      },
    ],
    new Set()
  );
  return { proposal: draft, changes };
}

export type ClarificationAnswer = { id: string; question: string; value: string };

export function formatAiClarificationMessage(answers: ClarificationAnswer[]): string {
  return answers.map((a) => `${a.question} ${a.value}`).join("\n");
}
