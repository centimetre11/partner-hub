import type { ExtractionProposal } from "@/lib/proposals";
import type { IntakeProposal } from "@/lib/ai-intake";

export type NormalizedProposal = {
  partnerName?: string;
  summaryTitle?: string;
  summary: string;
  signals: string[];
  fieldUpdates: ExtractionProposal["fieldUpdates"];
  contacts: ExtractionProposal["contacts"];
  opportunities: ExtractionProposal["opportunities"];
  todos: ExtractionProposal["todos"];
  trainings: IntakeProposal["trainings"];
  solutions: IntakeProposal["solutions"];
};

export function isIntakeProposal(p: IntakeProposal | ExtractionProposal): p is IntakeProposal {
  return "fields" in p && !("fieldUpdates" in p);
}

export function normalizeProposal(p: IntakeProposal | ExtractionProposal): NormalizedProposal {
  if (isIntakeProposal(p)) {
    return {
      partnerName: p.partnerName,
      summaryTitle: p.partnerName ? `新建伙伴：${p.partnerName}` : "待录入内容",
      summary: p.summary,
      signals: [],
      fieldUpdates: p.fields,
      contacts: p.contacts,
      opportunities: p.opportunities,
      todos: p.todos,
      trainings: p.trainings,
      solutions: p.solutions,
    };
  }
  return {
    partnerName: p.partnerName,
    summaryTitle: p.summaryTitle,
    summary: p.summary,
    signals: p.signals,
    fieldUpdates: p.fieldUpdates,
    contacts: p.contacts,
    opportunities: p.opportunities,
    todos: p.todos,
    trainings: [],
    solutions: [],
  };
}

export function filterNormalized(
  p: NormalizedProposal,
  excluded: Set<string>
): NormalizedProposal {
  return {
    ...p,
    partnerName: excluded.has("partner") ? undefined : p.partnerName,
    fieldUpdates: p.fieldUpdates.filter((_, i) => !excluded.has(`f${i}`)),
    contacts: p.contacts.filter((_, i) => !excluded.has(`c${i}`)),
    opportunities: p.opportunities.filter((_, i) => !excluded.has(`o${i}`)),
    todos: p.todos.filter((_, i) => !excluded.has(`t${i}`)),
    trainings: p.trainings.filter((_, i) => !excluded.has(`tr${i}`)),
    solutions: p.solutions.filter((_, i) => !excluded.has(`s${i}`)),
  };
}

export function normalizedToIntake(p: NormalizedProposal): IntakeProposal {
  return {
    partnerName: p.partnerName,
    summary: p.summary,
    fields: p.fieldUpdates,
    contacts: p.contacts,
    opportunities: p.opportunities,
    todos: p.todos,
    trainings: p.trainings,
    solutions: p.solutions,
  };
}

export function normalizedToExtraction(p: NormalizedProposal, partnerId?: string): ExtractionProposal {
  return {
    partnerId,
    partnerName: p.partnerName,
    summaryTitle: p.summaryTitle ?? "AI 提取",
    summary: p.summary,
    fieldUpdates: p.fieldUpdates,
    contacts: p.contacts,
    opportunities: p.opportunities,
    todos: p.todos,
    signals: p.signals,
  };
}
