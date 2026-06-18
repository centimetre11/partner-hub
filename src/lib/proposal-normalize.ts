import type { ExtractionProposal } from "@/lib/proposals";
import type { IntakeProposal } from "@/lib/ai-intake";
import { contactKey, fieldKey, oppKey, todoKey } from "@/lib/proposal-merge";

function isExcluded(excluded: Set<string>, keys: string[]) {
  return keys.some((k) => excluded.has(k));
}

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
      summaryTitle: p.partnerName ? `New partner: ${p.partnerName}` : "Pending intake",
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
    fieldUpdates: p.fieldUpdates.filter(
      (f, i) => !isExcluded(excluded, [fieldKey(f.field), `f${i}`])
    ),
    contacts: p.contacts.filter(
      (c, i) => !isExcluded(excluded, [contactKey(c.name), `c${i}`])
    ),
    opportunities: p.opportunities.filter(
      (o, i) => !isExcluded(excluded, [oppKey(o.name), `o${i}`])
    ),
    todos: p.todos.filter(
      (t, i) => !isExcluded(excluded, [todoKey(t.title), `t${i}`])
    ),
    trainings: p.trainings.filter((_, i) => !isExcluded(excluded, [`tr${i}`])),
    solutions: p.solutions.filter((_, i) => !isExcluded(excluded, [`s${i}`])),
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
    summaryTitle: p.summaryTitle ?? "AI extraction",
    summary: p.summary,
    fieldUpdates: p.fieldUpdates,
    contacts: p.contacts,
    opportunities: p.opportunities,
    todos: p.todos,
    signals: p.signals,
  };
}
