import type { IntakeClarification, IntakeProposal, IntakeScope, IntakeTurn } from "@/lib/ai-intake";
import type { AiClarification } from "@/lib/ai-clarifications";
import {
  formatClarificationAnswers,
  getClarificationTier,
  hasRequiredClarifications,
  shouldBlockChatInput,
} from "./ai-clarifications";
import { PARTNER_FIELD_LABELS } from "@/lib/constants";
import {
  isConfirmUnlinkedTodoOption,
  TODO_PARTNER_NOT_FOUND_ID,
} from "@/lib/intake-partner-binding";
import { fieldKey, businessRecordKey, mergeProposalPatch, type ProposalChanges } from "@/lib/proposal-merge";

export type ClarificationApplyMode = "direct" | "ai";

/** Identity anchor fields — shown as blocking checkpoints before deep research continues */
const IDENTITY_CLARIFICATION_IDS = new Set(["partnerName", "name", "customerName", "website", "dedupe", TODO_PARTNER_NOT_FOUND_ID]);

/** Profile fields that map 1:1 from clarification id → draft field (no LLM round-trip) */
const DIRECT_CLARIFICATION_IDS = new Set([
  "partnerName",
  "name",
  "country",
  "city",
  "headcount",
  "category",
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
const NO_WEBSITE_OPTION = /^(no website|暂无官网|没有官网|无官网|未发现官网|website unknown)/i;

export function isOpenEndedClarificationOption(option: string): boolean {
  const t = option.trim();
  return OPEN_ENDED_OPTION.test(t) || NO_WEBSITE_OPTION.test(t);
}

function concreteClarificationOptions(options: string[]): string[] {
  return options.map((o) => o.trim()).filter(Boolean).filter((o) => !isOpenEndedClarificationOption(o));
}

function draftIdentityValue(id: string, proposal: IntakeProposal): string | undefined {
  if (id === "website") {
    return proposal.fields.find((f) => f.field === "website")?.newValue?.trim() || undefined;
  }
  if (id === "partnerName" || id === "name") {
    return (
      proposal.partnerName?.trim() ||
      proposal.fields.find((f) => f.field === "name")?.newValue?.trim() ||
      undefined
    );
  }
  return undefined;
}

/** True when partnerName/website clarification adds no real disambiguation (e.g. KMS already gave one clear answer). */
export function isRedundantIdentityClarification(c: IntakeClarification, proposal: IntakeProposal): boolean {
  if (c.id !== "partnerName" && c.id !== "name" && c.id !== "website") return false;

  const draft = draftIdentityValue(c.id, proposal);
  if (!draft) return false;

  const concrete = concreteClarificationOptions(c.options);
  if (!concrete.length) return true;
  if (concrete.length === 1 && concrete[0]!.toLowerCase() === draft.toLowerCase()) return true;

  if (c.id === "website") {
    const urls = concrete.filter((o) => /https?:\/\//i.test(o) || /^[\w.-]+\.[a-z]{2,}/i.test(o));
    const norm = (s: string) => s.toLowerCase().replace(/\/+$/, "");
    if (urls.length === 1 && norm(urls[0]!) === norm(draft)) return true;
  }

  return false;
}

/** Drop partnerName/website checkpoints when the draft already has a single confident answer. */
export function pruneRedundantIdentityClarifications(turn: IntakeTurn, scope: IntakeScope): IntakeTurn {
  if (scope !== "new_partner") return turn;

  const clarifications = turn.clarifications.filter(
    (c) => !isRedundantIdentityClarification(c, turn.proposal)
  );
  if (clarifications.length === turn.clarifications.length) return turn;

  const noBlocking = !hasRequiredClarifications(clarifications);
  const hasName = !!draftIdentityValue("partnerName", turn.proposal);

  return {
    ...turn,
    clarifications,
    ready: noBlocking && hasName ? true : turn.ready,
  };
}

export function isIdentityClarification(c: IntakeClarification): boolean {
  return c.kind === "identity" || IDENTITY_CLARIFICATION_IDS.has(c.id);
}

export function hasBlockingClarifications(clarifications: IntakeClarification[]): boolean {
  return hasRequiredClarifications(clarifications as AiClarification[]);
}

export { shouldBlockChatInput, hasRequiredClarifications, getClarificationTier };

export function getClarificationMode(c: IntakeClarification): ClarificationApplyMode {
  if (c.apply === "direct" || c.apply === "ai") return c.apply;
  if (/^br-\d+-(nature|action)$/.test(c.id)) return "direct";
  if (c.id === "dedupe") return "ai";
  if (c.id === "partnerName" || c.id === "name" || c.id === "website" || c.id === "customerName" || c.id === TODO_PARTNER_NOT_FOUND_ID) return "direct";
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

  if (clarification.id === TODO_PARTNER_NOT_FOUND_ID) {
    if (isConfirmUnlinkedTodoOption(trimmed)) {
      const next = { ...proposal, partnerName: undefined };
      return {
        proposal: next,
        changes: proposal.partnerName
          ? { added: [], updated: ["partner"], removed: [], aiReupdates: [] }
          : { added: [], updated: [], removed: [], aiReupdates: [] },
      };
    }
    const { draft, changes } = mergeProposalPatch(
      proposal,
      [{ op: "set_partner", name: trimmed }],
      new Set()
    );
    return { proposal: draft, changes };
  }

  if (clarification.id === "partnerName" || clarification.id === "name") {
    const { draft, changes } = mergeProposalPatch(
      proposal,
      [{ op: "set_partner", name: trimmed }],
      new Set()
    );
    return { proposal: draft, changes };
  }

  if (clarification.id === "customerName") {
    const next = { ...proposal, customerName: trimmed, partnerName: undefined };
    return {
      proposal: next,
      changes: proposal.customerName !== trimmed
        ? { added: proposal.customerName ? [] : ["customer"], updated: proposal.customerName ? ["customer"] : [], removed: [], aiReupdates: [] }
        : { added: [], updated: [], removed: [], aiReupdates: [] },
    };
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
  | { type: "businessRecord"; index: number; field: "traceNature" | "traceAction"; value: string }
  | { type: "crmRecorders"; ids: string[] };

export function applyProposalEdit(
  proposal: IntakeProposal,
  patch: ProposalEditPatch
): { proposal: IntakeProposal; changes: ProposalChanges } {
  if (patch.type === "crmRecorders") {
    return {
      proposal: { ...proposal, crmRecorderUserIds: [...new Set(patch.ids.filter(Boolean))] },
      changes: { added: [], updated: [], removed: [], aiReupdates: [] },
    };
  }
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

export function formatAiClarificationMessage(answers: ClarificationAnswer[], locale: "zh" | "en" = "zh"): string {
  return formatClarificationAnswers(answers, locale);
}
