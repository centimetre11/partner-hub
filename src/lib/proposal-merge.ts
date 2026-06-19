import type { IntakeProposal } from "./ai-intake";
import type { ContactProposal, FieldUpdate, OpportunityProposal, TodoProposal } from "./proposals";
import type { ProposalPatchOp } from "./ai-trace";

export type ProposalChangeKind = "added" | "updated" | "removed" | "ai_reupdate";

export type ProposalChanges = {
  added: string[];
  updated: string[];
  removed: string[];
  aiReupdates: string[];
};

export type MergePatchResult = {
  draft: IntakeProposal;
  changes: ProposalChanges;
};

function emptyDraft(): IntakeProposal {
  return { summary: "", fields: [], contacts: [], opportunities: [], todos: [], trainings: [], solutions: [], businessRecords: [] };
}

export function fieldKey(field: string) {
  return `field:${field}`;
}

export function contactKey(name: string) {
  return `contact:${name.toLowerCase()}`;
}

export function oppKey(name: string) {
  return `opp:${name.toLowerCase()}`;
}

export function todoKey(title: string) {
  return `todo:${title.toLowerCase()}`;
}

export function businessRecordKey(title: string) {
  return `biz:${title.toLowerCase()}`;
}

export function countProposalItems(p: IntakeProposal): number {
  return (
    (p.partnerName ? 1 : 0) +
    p.fields.length +
    p.contacts.length +
    p.opportunities.length +
    p.todos.length +
    p.trainings.length +
    p.solutions.length +
    p.businessRecords.length
  );
}

export function mergeProposalPatch(
  draft: IntakeProposal | null,
  ops: ProposalPatchOp[],
  excluded: Set<string>
): MergePatchResult {
  const next: IntakeProposal = draft ? { ...draft, fields: [...draft.fields], contacts: [...draft.contacts], opportunities: [...draft.opportunities], todos: [...draft.todos], trainings: [...draft.trainings], solutions: [...draft.solutions], businessRecords: [...draft.businessRecords] } : emptyDraft();
  const changes: ProposalChanges = { added: [], updated: [], removed: [], aiReupdates: [] };

  for (const op of ops) {
    if (op.op === "set_partner") {
      const k = "partner";
      if (excluded.has(k)) {
        if (next.partnerName !== op.name) changes.aiReupdates.push(k);
        continue;
      }
      if (!next.partnerName) changes.added.push(k);
      else if (next.partnerName !== op.name) changes.updated.push(k);
      next.partnerName = op.name;
    } else if (op.op === "set_summary") {
      if (!next.summary) changes.added.push("summary");
      else if (next.summary !== op.summary) changes.updated.push("summary");
      next.summary = op.summary;
    } else if (op.op === "upsert_field") {
      const k = op.key || fieldKey(op.field);
      if (excluded.has(k)) {
        changes.aiReupdates.push(k);
        continue;
      }
      const idx = next.fields.findIndex((f) => f.field === op.field);
      const item: FieldUpdate = {
        field: op.field,
        label: op.label,
        oldValue: op.oldValue ?? null,
        newValue: op.newValue,
        reason: op.reason,
      };
      if (idx < 0) {
        changes.added.push(k);
        next.fields.push(item);
      } else {
        if (next.fields[idx].newValue !== op.newValue) changes.updated.push(k);
        next.fields[idx] = { ...next.fields[idx], ...item };
      }
    } else if (op.op === "upsert_contact") {
      const k = op.key || contactKey(op.contact.name);
      if (excluded.has(k)) {
        changes.aiReupdates.push(k);
        continue;
      }
      const idx = next.contacts.findIndex((c) => c.name.toLowerCase() === op.contact.name.toLowerCase());
      if (idx < 0) {
        changes.added.push(k);
        next.contacts.push({ ...op.contact, action: op.contact.action ?? "add" });
      } else {
        changes.updated.push(k);
        next.contacts[idx] = { ...next.contacts[idx], ...op.contact };
      }
    } else if (op.op === "upsert_opportunity") {
      const k = op.key || oppKey(op.opportunity.name);
      if (excluded.has(k)) {
        changes.aiReupdates.push(k);
        continue;
      }
      const idx = next.opportunities.findIndex((o) => o.name.toLowerCase() === op.opportunity.name.toLowerCase());
      if (idx < 0) {
        changes.added.push(k);
        next.opportunities.push({ ...op.opportunity, action: op.opportunity.action ?? "add" });
      } else {
        changes.updated.push(k);
        next.opportunities[idx] = { ...next.opportunities[idx], ...op.opportunity };
      }
    } else if (op.op === "upsert_todo") {
      const k = op.key || todoKey(op.todo.title);
      if (excluded.has(k)) {
        changes.aiReupdates.push(k);
        continue;
      }
      const idx = next.todos.findIndex((t) => t.title.toLowerCase() === op.todo.title.toLowerCase());
      if (idx < 0) {
        changes.added.push(k);
        next.todos.push(op.todo);
      } else {
        changes.updated.push(k);
        next.todos[idx] = { ...next.todos[idx], ...op.todo };
      }
    } else if (op.op === "remove") {
      if (op.key === "partner") next.partnerName = undefined;
      else if (op.key.startsWith("field:")) {
        const field = op.key.slice(6);
        next.fields = next.fields.filter((f) => f.field !== field);
      } else if (op.key.startsWith("contact:")) {
        const name = op.key.slice(8);
        next.contacts = next.contacts.filter((c) => c.name.toLowerCase() !== name);
      }
      changes.removed.push(op.key);
    }
  }

  return { draft: next, changes };
}

/** Merge final proposal_update with draft (respect user excluded; calibrate to final proposal) */
export function mergeFinalProposal(
  draft: IntakeProposal | null,
  final: IntakeProposal,
  excluded: Set<string>
): IntakeProposal {
  const ops: ProposalPatchOp[] = [];
  if (final.partnerName) ops.push({ op: "set_partner", name: final.partnerName });
  if (final.summary) ops.push({ op: "set_summary", summary: final.summary });
  for (const f of final.fields) {
    ops.push({
      op: "upsert_field",
      key: fieldKey(f.field),
      field: f.field,
      label: f.label,
      newValue: f.newValue,
      oldValue: f.oldValue ?? undefined,
      reason: f.reason,
    });
  }
  for (const c of final.contacts) {
    ops.push({ op: "upsert_contact", key: contactKey(c.name), contact: c });
  }
  for (const o of final.opportunities) {
    ops.push({ op: "upsert_opportunity", key: oppKey(o.name), opportunity: o });
  }
  for (const t of final.todos) {
    ops.push({ op: "upsert_todo", key: todoKey(t.title), todo: t });
  }
  const { draft: merged } = mergeProposalPatch(draft ?? emptyDraft(), ops, excluded);
  merged.trainings = final.trainings;
  merged.solutions = final.solutions;
  merged.businessRecords = final.businessRecords;
  merged.hubPartnerId = final.hubPartnerId ?? draft?.hubPartnerId;
  merged.crmCustomerId = final.crmCustomerId ?? draft?.crmCustomerId;
  merged.crmCustomerName = final.crmCustomerName ?? draft?.crmCustomerName;
  merged.saveMode = final.saveMode ?? draft?.saveMode;
  return merged;
}

export type NormalizedRow = {
  key: string;
  tone: "field" | "contact" | "opp" | "todo" | "training" | "solution" | "business" | "partner";
  label: string;
  detail?: string;
  oldValue?: string | null;
  newValue?: string;
  reason?: string;
};

export function proposalToRows(p: IntakeProposal): NormalizedRow[] {
  const rows: NormalizedRow[] = [];
  if (p.partnerName) {
    rows.push({ key: "partner", tone: "partner", label: "New partner", newValue: p.partnerName });
  }
  p.fields.forEach((f, i) => {
    rows.push({
      key: fieldKey(f.field) || `f${i}`,
      tone: "field",
      label: f.label,
      oldValue: f.oldValue,
      newValue: f.newValue,
      reason: f.reason,
    });
  });
  p.contacts.forEach((c, i) => {
    rows.push({
      key: contactKey(c.name) || `c${i}`,
      tone: "contact",
      label: `${c.action === "update" ? "Update contact" : "Contact"}: ${c.name}`,
      detail: [c.title, c.role, c.reportsToName].filter(Boolean).join(" · "),
      reason: c.reason,
    });
  });
  p.opportunities.forEach((o, i) => {
    rows.push({
      key: oppKey(o.name) || `o${i}`,
      tone: "opp",
      label: `${o.action === "update" ? "Update opportunity" : "Opportunity"}: ${o.name}`,
      detail: [o.client, o.amount, o.stage].filter(Boolean).join(" · "),
      reason: o.reason,
    });
  });
  p.todos.forEach((t, i) => {
    rows.push({
      key: todoKey(t.title) || `t${i}`,
      tone: "todo",
      label: `Todo: ${t.title}`,
      detail: [t.dueDate, t.priority].filter(Boolean).join(" · "),
    });
  });
  return rows;
}
