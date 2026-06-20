import type { IntakeProposal } from "./ai-intake";
import type { IntakeClarification } from "./ai-intake";
import type { IntakeScope } from "./ai-locale";
import { countProposalItems } from "./proposal-merge";

const EMPTY_PROPOSAL_ARRAYS = {
  fields: [] as IntakeProposal["fields"],
  contacts: [] as IntakeProposal["contacts"],
  opportunities: [] as IntakeProposal["opportunities"],
  todos: [] as IntakeProposal["todos"],
  trainings: [] as IntakeProposal["trainings"],
  solutions: [] as IntakeProposal["solutions"],
  businessRecords: [] as IntakeProposal["businessRecords"],
};

/** Strip proposal sections that do not belong to this intake scope (LLM + UI guard). */
export function sanitizeProposalForScope(scope: IntakeScope, raw: IntakeProposal): IntakeProposal {
  const summary = raw.summary ?? "";
  switch (scope) {
    case "business_record":
      return {
        ...EMPTY_PROPOSAL_ARRAYS,
        partnerName: raw.partnerName,
        hubPartnerId: raw.hubPartnerId,
        crmCustomerId: raw.crmCustomerId,
        crmCustomerName: raw.crmCustomerName,
        saveMode: raw.saveMode,
        summary,
        businessRecords: raw.businessRecords ?? [],
      };
    case "todo":
      return {
        ...EMPTY_PROPOSAL_ARRAYS,
        partnerName: raw.partnerName,
        summary,
        todos: raw.todos ?? [],
      };
    case "powermap":
      return {
        ...EMPTY_PROPOSAL_ARRAYS,
        partnerName: raw.partnerName,
        summary,
        contacts: raw.contacts ?? [],
      };
    case "opportunity":
      return {
        ...EMPTY_PROPOSAL_ARRAYS,
        partnerName: raw.partnerName,
        summary,
        opportunities: raw.opportunities ?? [],
      };
    case "training":
      return {
        ...EMPTY_PROPOSAL_ARRAYS,
        partnerName: raw.partnerName,
        summary,
        trainings: raw.trainings ?? [],
      };
    case "solution":
      return {
        ...EMPTY_PROPOSAL_ARRAYS,
        partnerName: raw.partnerName,
        summary,
        solutions: raw.solutions ?? [],
      };
    case "profile":
      return {
        ...EMPTY_PROPOSAL_ARRAYS,
        partnerName: raw.partnerName,
        summary,
        fields: raw.fields ?? [],
      };
    case "new_partner":
    default:
      return {
        partnerName: raw.partnerName,
        summary,
        fields: raw.fields ?? [],
        contacts: raw.contacts ?? [],
        opportunities: raw.opportunities ?? [],
        todos: raw.todos ?? [],
        trainings: raw.trainings ?? [],
        solutions: raw.solutions ?? [],
        businessRecords: raw.businessRecords ?? [],
      };
  }
}

export type ScopeDraftSections = {
  partnerName: boolean;
  fields: boolean;
  websiteHint: boolean;
  contacts: boolean;
  opportunities: boolean;
  todos: boolean;
  trainings: boolean;
  solutions: boolean;
  businessRecords: boolean;
};

export function scopeDraftSections(scope?: IntakeScope): ScopeDraftSections {
  switch (scope) {
    case "business_record":
      return {
        partnerName: false,
        fields: false,
        websiteHint: false,
        contacts: false,
        opportunities: false,
        todos: false,
        trainings: false,
        solutions: false,
        businessRecords: true,
      };
    case "todo":
      return {
        partnerName: true,
        fields: false,
        websiteHint: false,
        contacts: false,
        opportunities: false,
        todos: true,
        trainings: false,
        solutions: false,
        businessRecords: false,
      };
    case "powermap":
      return {
        partnerName: false,
        fields: false,
        websiteHint: false,
        contacts: true,
        opportunities: false,
        todos: false,
        trainings: false,
        solutions: false,
        businessRecords: false,
      };
    case "opportunity":
      return {
        partnerName: true,
        fields: false,
        websiteHint: false,
        contacts: false,
        opportunities: true,
        todos: false,
        trainings: false,
        solutions: false,
        businessRecords: false,
      };
    case "training":
      return {
        partnerName: false,
        fields: false,
        websiteHint: false,
        contacts: false,
        opportunities: false,
        todos: false,
        trainings: true,
        solutions: false,
        businessRecords: false,
      };
    case "solution":
      return {
        partnerName: false,
        fields: false,
        websiteHint: false,
        contacts: false,
        opportunities: false,
        todos: false,
        trainings: false,
        solutions: true,
        businessRecords: false,
      };
    case "profile":
      return {
        partnerName: false,
        fields: true,
        websiteHint: false,
        contacts: false,
        opportunities: false,
        todos: false,
        trainings: false,
        solutions: false,
        businessRecords: false,
      };
    case "new_partner":
    default:
      return {
        partnerName: true,
        fields: true,
        websiteHint: true,
        contacts: true,
        opportunities: true,
        todos: true,
        trainings: true,
        solutions: true,
        businessRecords: true,
      };
  }
}

export function scopeSummaryTitle(scope: IntakeScope | undefined, partnerName?: string): string | undefined {
  switch (scope) {
    case "business_record":
      return undefined;
    case "todo":
      return partnerName ? `待办 · ${partnerName}` : "待办";
    case "powermap":
      return "联系人";
    case "opportunity":
      return partnerName ? `商机 · ${partnerName}` : "商机";
    case "training":
      return "培训计划";
    case "solution":
      return "联合方案";
    case "profile":
      return partnerName ? `档案补全 · ${partnerName}` : "档案补全";
    case "new_partner":
      return partnerName ? `新伙伴：${partnerName}` : "新伙伴建档";
    default:
      return partnerName ? `New partner: ${partnerName}` : undefined;
  }
}

/** Single-purpose scopes replace the draft each turn instead of merging with prior fields. */
export function intakeProposalReplacesDraft(scope: IntakeScope): boolean {
  return scope !== "new_partner" && scope !== "profile";
}

/** Lightweight AI Add scopes: one-shot field extraction, no web/KMS research. */
export const FAST_INTAKE_SCOPES: IntakeScope[] = [
  "business_record",
  "todo",
  "powermap",
  "opportunity",
  "training",
  "solution",
];

export function isFastIntakeScope(scope: IntakeScope): boolean {
  return FAST_INTAKE_SCOPES.includes(scope);
}

/** Bound partner + fast scope + ready draft → skip content confirm (disabled: intent confirm required first). */
export function shouldAutoApplyBoundIntake(_opts: {
  scope: IntakeScope;
  partnerId?: string;
  ready: boolean;
  clarifications?: IntakeClarification[];
  proposal: IntakeProposal | null;
}): boolean {
  return false;
}
