import type { IntakeClarification, IntakeProposal } from "@/lib/ai-intake";
import { PARTNER_FIELD_LABELS } from "@/lib/constants";
import { fieldKey, businessRecordKey, mergeProposalPatch, type ProposalChanges } from "@/lib/proposal-merge";

export type ClarificationApplyMode = "direct" | "ai";

/** Identity anchor fields — shown as blocking checkpoints before deep research continues */
const IDENTITY_CLARIFICATION_IDS = new Set(["partnerName", "name", "website", "dedupe"]);

/** Profile fields that map 1:1 from clarification id → draft field (no LLM round-trip) */
const DIRECT_CLARIFICATION_IDS = new Set([
  "partnerName",
  "name",
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

export function isIdentityClarification(c: IntakeClarification): boolean {
  return c.kind === "identity" || IDENTITY_CLARIFICATION_IDS.has(c.id);
}

export function hasBlockingClarifications(clarifications: IntakeClarification[]): boolean {
  return clarifications.some((c) => c.blocking);
}

export function getClarificationMode(c: IntakeClarification): ClarificationApplyMode {
  if (c.apply === "direct" || c.apply === "ai") return c.apply;
  if (/^br-\d+-(nature|action)$/.test(c.id)) return "direct";
  if (c.id === "dedupe") return "ai";
  if (c.id === "partnerName" || c.id === "name" || c.id === "website") return "direct";
  if (DIRECT_CLARIFICATION_IDS.has(c.id) && c.id in PARTNER_FIELD_LABELS) return "direct";
  return "ai";
}

export function partitionClarifications(clarifications: IntakeClarification[]) {
  const identity: IntakeClarification[] = [];
  const direct: IntakeClarification[] = [];
  const ai: IntakeClarification[] = [];
  for (const c of clarifications) {
    if (isIdentityClarification(c)) identity.push(c);
    else if (getClarificationMode(c) === "direct") direct.push(c);
    else ai.push(c);
  }
  return { identity, direct, ai };
}

export function applyDirectClarification(
  proposal: IntakeProposal,
  clarification: IntakeClarification,
  value: string
): { proposal: IntakeProposal; changes: ProposalChanges } {
  const trimmed = value.trim();
  const brMatch = clarification.id.match(/^br-(\d+)-(nature|action)$/);
  if (brMatch) {
    const index = Number(brMatch[1]);
    const field = brMatch[2] === "nature" ? "traceNature" : "traceAction";
    return applyProposalEdit(proposal, { type: "businessRecord", index, field, value: trimmed });
  }

  if (clarification.id === "partnerName" || clarification.id === "name") {
    const { draft, changes } = mergeProposalPatch(
      proposal,
      [{ op: "set_partner", name: trimmed }],
      new Set()
    );
    return { proposal: draft, changes };
  }

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
        newValue: trimmed,
        reason: "User selected option",
      },
    ],
    new Set()
  );
  return { proposal: draft, changes };
}

export type ProposalEditPatch =
  | { type: "partnerName"; value: string }
  | { type: "field"; field: string; value: string }
  | { type: "businessRecord"; index: number; field: "traceNature" | "traceAction"; value: string };

export function applyProposalEdit(
  proposal: IntakeProposal,
  patch: ProposalEditPatch
): { proposal: IntakeProposal; changes: ProposalChanges } {
  if (patch.type === "businessRecord") {
    const records = [...proposal.businessRecords];
    const row = records[patch.index];
    if (!row) return { proposal, changes: { added: [], updated: [], removed: [], aiReupdates: [] } };
    records[patch.index] = {
      ...row,
      [patch.field]: patch.value.trim(),
    };
    const key = businessRecordKey(row.title) || `br${patch.index}`;
    return {
      proposal: { ...proposal, businessRecords: records },
      changes: { added: [], updated: [key], removed: [], aiReupdates: [] },
    };
  }
  if (patch.type === "partnerName") {
    const { draft, changes } = mergeProposalPatch(
      proposal,
      [{ op: "set_partner", name: patch.value.trim() }],
      new Set()
    );
    return { proposal: draft, changes };
  }
  const field = patch.field;
  const label = PARTNER_FIELD_LABELS[field] ?? field;
  const { draft, changes } = mergeProposalPatch(
    proposal,
    [
      {
        op: "upsert_field",
        key: fieldKey(field),
        field,
        label,
        newValue: patch.value.trim(),
        reason: "User edited",
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
