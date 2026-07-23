export type AgendaSubjectKind = "PROJECT" | "OPPORTUNITY" | "PARTNER";

export type AgendaSubjectInput = {
  userId: string;
  kind: AgendaSubjectKind;
  customerId?: string | null;
  projectId?: string | null;
  opportunityId?: string | null;
  partnerId?: string | null;
};

export function subjectKeyFor(
  kind: AgendaSubjectKind,
  id: string,
): string {
  const prefix =
    kind === "PROJECT" ? "project" : kind === "OPPORTUNITY" ? "opportunity" : "partner";
  return `${prefix}:${id}`;
}

export function subjectIdFromInput(input: AgendaSubjectInput): string | null {
  if (input.kind === "PROJECT") return input.projectId ?? null;
  if (input.kind === "OPPORTUNITY") return input.opportunityId ?? null;
  return input.partnerId ?? null;
}

export function normalizeAgendaSubject(
  input: AgendaSubjectInput,
): (AgendaSubjectInput & { subjectKey: string }) | null {
  const id = subjectIdFromInput(input);
  if (!input.userId || !id) return null;
  return {
    ...input,
    subjectKey: subjectKeyFor(input.kind, id),
  };
}

export function itemDisplayLabel(opts: {
  userName: string;
  subjectKind?: AgendaSubjectKind | string | null;
  customerName?: string | null;
  projectName?: string | null;
  opportunityName?: string | null;
  partnerName?: string | null;
}): string {
  const kind = (opts.subjectKind ?? "PROJECT") as AgendaSubjectKind;
  let subject: string;
  if (kind === "PARTNER") {
    subject = `伙伴 · ${opts.partnerName?.trim() || "—"}`;
  } else if (kind === "OPPORTUNITY") {
    const owner = opts.customerName?.trim() || opts.partnerName?.trim() || "—";
    subject = `${owner} / 商机 · ${opts.opportunityName?.trim() || "—"}`;
  } else {
    subject = `${opts.customerName?.trim() || "—"} / ${opts.projectName?.trim() || "—"}`;
  }
  return `${opts.userName} · ${subject}`;
}
