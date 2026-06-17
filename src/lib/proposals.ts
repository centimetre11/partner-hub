import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { chatJson } from "./ai";
import { PARTNER_FIELD_LABELS, PIPELINE_STAGES, attitudeLabel, stageName } from "./constants";
import { normalizeIndustriesInput } from "./taxonomy";

// ============ Proposal (diff preview) data structures ============

export type FieldUpdate = {
  field: string;
  label: string;
  oldValue: string | null;
  newValue: string;
  reason?: string;
};

export type ContactProposal = {
  action: "add" | "update";
  id?: string;
  name: string;
  role?: string; // APPROVER / DECISION_MAKER / SUPPORTER / EVALUATOR / INFLUENCER
  title?: string;
  department?: string;
  attitude?: number; // 3 champion / 2 supportive exclusive / 1 supportive / 0 neutral / -1 opposed
  reportsToName?: string; // Manager name for power map hierarchy
  contactInfo?: string;
  approach?: string;
  notes?: string;
  reason?: string;
};

export type OpportunityProposal = {
  action: "add" | "update";
  id?: string;
  name: string;
  client?: string;
  amount?: string;
  stage?: string;
  nextStep?: string;
  status?: string;
  notes?: string;
  reason?: string;
};

export type TodoProposal = {
  title: string;
  detail?: string;
  dueDate?: string; // YYYY-MM-DD
  priority?: string;
};

export type ExtractionProposal = {
  partnerId?: string;
  partnerName?: string;
  summaryTitle: string;
  summary: string;
  fieldUpdates: FieldUpdate[];
  contacts: ContactProposal[];
  opportunities: OpportunityProposal[];
  todos: TodoProposal[];
  signals: string[];
};

// ============ Partner context for prompts ============

export async function partnerContext(partnerId: string): Promise<string> {
  const p = await db.partner.findUnique({
    where: { id: partnerId },
    include: { contacts: true, opportunities: true, owner: true },
  });
  if (!p) return "(Partner not found)";
  const fields = Object.entries(PARTNER_FIELD_LABELS)
    .map(([field, label]) => {
      const v = (p as unknown as Record<string, unknown>)[field];
      const display = field === "pipelineStage" ? `${v} (${stageName(Number(v))})` : v ?? "(empty)";
      return `- ${label}[${field}]: ${display}`;
    })
    .join("\n");
  const contactById = new Map(p.contacts.map((c) => [c.id, c.name]));
  const contacts = p.contacts.length
    ? p.contacts
        .map(
          (c) =>
            `- id=${c.id} name:${c.name} role:${c.role} title:${c.title ?? "?"} dept:${c.department ?? "?"} attitude:${c.attitude}(${attitudeLabel(c.attitude)}) reportsTo:${c.reportsToId ? contactById.get(c.reportsToId) ?? "?" : "(top)"} contact:${c.contactInfo ?? "?"}`
        )
        .join("\n")
    : "(none)";
  const opps = p.opportunities.length
    ? p.opportunities
        .map(
          (o) =>
            `- id=${o.id} name:${o.name} client:${o.client ?? "?"} amount:${o.amount ?? "?"} stage:${o.stage} status:${o.status}`
        )
        .join("\n")
    : "(none)";
  return `[Partner profile: ${p.name}]\n${fields}\n\n[Power map / key people]\n${contacts}\n\n[Opportunities]\n${opps}`;
}

/** Power map intake: existing contacts only (no full profile/opportunities) */
export async function powermapContext(partnerId: string): Promise<string> {
  const p = await db.partner.findUnique({
    where: { id: partnerId },
    select: {
      name: true,
      contacts: {
        select: { id: true, name: true, role: true, title: true, department: true, reportsToId: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!p) return "(Partner not found)";
  const byId = new Map(p.contacts.map((c) => [c.id, c.name]));
  const lines = p.contacts.length
    ? p.contacts
        .map(
          (c) =>
            `- id=${c.id} ${c.name} | role:${c.role} | ${c.title ?? "—"} | ${c.department ?? "—"} | reportsTo:${c.reportsToId ? byId.get(c.reportsToId) ?? "?" : "top"}`,
        )
        .join("\n")
    : "(none — all new)";
  return `[Partner: ${p.name}]\n[Existing contacts]\n${lines}`;
}

// ============ AI extraction: proposal from arbitrary text ============

const EXTRACT_SYSTEM = `You are an information extraction engine for Fanruan Software (leading BI vendor in China; products FineReport / FineBI / FineDataLink) Middle East partner management.
The user provides raw text (meeting notes, WhatsApp/chat, email, news, etc.) and the current partner profile.
Compare text to the profile and output a JSON proposal of updates. Reply in English in summary fields. Rules:
1. Propose only changes supported by the text; attach reason (quote key phrase). Do not invent.
2. fieldUpdates only for: ${Object.entries(PARTNER_FIELD_LABELS).map(([f, l]) => `${f}(${l})`).join(", ")}. newValue always string; pipelineStage 1-10 (${PIPELINE_STAGES.map((s) => `${s.stage}=${s.name}`).join(", ")}).
3. People in text (power map): action=add if new; action=update with id if existing with new info (title, dept, attitude, reporting, contact). Fields:
   - role: APPROVER/DECISION_MAKER/SUPPORTER/EVALUATOR/INFLUENCER
   - attitude: 3=champion/2=supportive exclusive/1=supportive/0=neutral/-1=opposed
   - department; reportsToName when reporting line is clear
4. Opportunities: action=add for new; action=update with id for amount/stage/progress changes.
5. todos: commitments and next steps from text (English titles; dueDate YYYY-MM-DD if known; priority HIGH/MEDIUM/LOW).
6. summary: 3-6 sentences on key info (English); summaryTitle one-line English title.
7. signals: notable positive or risk signals (English short phrases; empty array if none).
Output JSON only:
{"summaryTitle": "...", "summary": "...", "fieldUpdates": [{"field":"...","label":"...","oldValue":"...","newValue":"...","reason":"..."}], "contacts": [...], "opportunities": [...], "todos": [...], "signals": [...]}`;

export async function extractProposal(opts: {
  partnerId: string;
  text: string;
  sourceType: string;
  today: string;
  userId?: string;
}): Promise<ExtractionProposal> {
  const ctx = await partnerContext(opts.partnerId);
  const user = `Today's date: ${opts.today}\nSource type: ${opts.sourceType}\n\n${ctx}\n\n[Raw text]\n${opts.text}`;
  const raw = await chatJson<Partial<ExtractionProposal>>(EXTRACT_SYSTEM, user, {
    feature: "AI information extraction",
    userId: opts.userId,
  });
  return normalizeProposal(raw, opts.partnerId);
}

export function normalizeProposal(raw: Partial<ExtractionProposal>, partnerId?: string): ExtractionProposal {
  return {
    partnerId,
    partnerName: raw.partnerName,
    summaryTitle: raw.summaryTitle || "AI extraction summary",
    summary: raw.summary || "",
    fieldUpdates: (raw.fieldUpdates ?? []).filter((f) => f.field in PARTNER_FIELD_LABELS && f.field !== "name"),
    contacts: raw.contacts ?? [],
    opportunities: raw.opportunities ?? [],
    todos: raw.todos ?? [],
    signals: raw.signals ?? [],
  };
}

// ============ Guess which partner text belongs to ============

export async function guessPartner(text: string, userId?: string): Promise<{ partnerId: string | null; partnerName: string | null; confidence: string }> {
  const partners = await db.partner.findMany({ select: { id: true, name: true, city: true, country: true } });
  const list = partners.map((p) => `${p.id} | ${p.name} (${p.city ?? "?"}, ${p.country ?? "?"})`).join("\n");
  const res = await chatJson<{ partnerId: string | null; partnerName: string | null; confidence: string }>(
    `You route text to the correct partner in the system. Output JSON only: {"partnerId": "matched id or null", "partnerName": "matched name or null", "confidence": "high/medium/low"}. Use company name, people, products, city, etc. Return null if no match.`,
    `[Partner list]\n${list}\n\n[Text]\n${text.slice(0, 4000)}`,
    { feature: "AI text partner routing", userId }
  );
  return res;
}

// ============ Apply proposal (after human confirm + audit) ============

export type ApplyResult = { applied: string[]; eventId: string };

export async function applyProposal(opts: {
  partnerId: string;
  proposal: ExtractionProposal;
  userId: string;
  eventType: string; // MEETING / CHAT_IMPORT / NEWS / NOTE
  sourceText?: string;
}): Promise<ApplyResult> {
  const { partnerId, proposal, userId } = opts;
  const partner = await db.partner.findUniqueOrThrow({ where: { id: partnerId } });
  const applied: string[] = [];

  // Field updates
  const data: Record<string, unknown> = {};
  for (const f of proposal.fieldUpdates) {
    if (!(f.field in PARTNER_FIELD_LABELS) || f.field === "name") continue;
    if (f.field === "pipelineStage" || f.field === "fitScore") {
      const n = parseInt(f.newValue, 10);
      if (!Number.isNaN(n)) data[f.field] = n;
    } else if (f.field === "industries" || f.field === "industry") {
      const norm = normalizeIndustriesInput(f.newValue);
      data.industries = norm.industries;
      data.industry = norm.industry;
    } else {
      data[f.field] = f.newValue;
    }
    applied.push(`Field "${f.label || PARTNER_FIELD_LABELS[f.field]}" updated to: ${f.newValue}`);
  }
  if (Object.keys(data).length) {
    await db.partner.update({ where: { id: partnerId }, data: data as Prisma.PartnerUpdateInput });
  }

  // Contacts
  const VALID_ROLES = ["APPROVER", "DECISION_MAKER", "SUPPORTER", "EVALUATOR", "INFLUENCER"];
  for (const c of proposal.contacts) {
    // Resolve reportsToName to existing contact id
    let reportsToId: string | undefined;
    if (c.reportsToName) {
      const boss = await db.contact.findFirst({
        where: { partnerId, name: { contains: c.reportsToName }, NOT: { name: c.name } },
      });
      reportsToId = boss?.id;
    }
    const payload = {
      name: c.name,
      role: c.role && VALID_ROLES.includes(c.role) ? c.role : "INFLUENCER",
      title: c.title,
      department: c.department,
      attitude: typeof c.attitude === "number" && c.attitude >= -1 && c.attitude <= 3 ? c.attitude : undefined,
      reportsToId,
      contactInfo: c.contactInfo,
      approach: c.approach,
      notes: c.notes,
    };
    if (c.action === "update" && c.id) {
      const exists = await db.contact.findFirst({ where: { id: c.id, partnerId } });
      if (exists) {
        await db.contact.update({
          where: { id: c.id },
          data: Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== null)),
        });
        applied.push(`Updated contact: ${c.name}`);
        continue;
      }
    }
    // add (or update fallback by name)
    const sameName = await db.contact.findFirst({ where: { partnerId, name: c.name } });
    if (sameName) {
      await db.contact.update({
        where: { id: sameName.id },
        data: Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== null)),
      });
      applied.push(`Updated contact: ${c.name}`);
    } else {
      await db.contact.create({ data: { partnerId, ...payload } });
      applied.push(`Added contact: ${c.name}`);
    }
  }

  // Opportunities
  for (const o of proposal.opportunities) {
    const payload = {
      name: o.name,
      client: o.client,
      amount: o.amount,
      stage: o.stage ?? "Needs Discovery",
      nextStep: o.nextStep,
      status: o.status ?? "ACTIVE",
      notes: o.notes,
    };
    if (o.action === "update" && o.id) {
      const exists = await db.opportunity.findFirst({ where: { id: o.id, partnerId } });
      if (exists) {
        await db.opportunity.update({
          where: { id: o.id },
          data: Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== null)),
        });
        applied.push(`Updated opportunity: ${o.name}`);
        continue;
      }
    }
    const sameName = await db.opportunity.findFirst({ where: { partnerId, name: o.name } });
    if (sameName) {
      await db.opportunity.update({
        where: { id: sameName.id },
        data: Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== null)),
      });
      applied.push(`Updated opportunity: ${o.name}`);
    } else {
      await db.opportunity.create({ data: { partnerId, ...payload } });
      applied.push(`Added opportunity: ${o.name}`);
    }
  }

  // Todos
  for (const t of proposal.todos) {
    await db.todoItem.create({
      data: {
        title: t.title,
        detail: t.detail,
        partnerId,
        assigneeId: userId,
        dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
        priority: t.priority && ["HIGH", "MEDIUM", "LOW"].includes(t.priority) ? t.priority : "MEDIUM",
        source: "AI",
      },
    });
    applied.push(`Added todo: ${t.title}`);
  }

  // Timeline + audit
  const event = await db.timelineEvent.create({
    data: {
      partnerId,
      type: opts.eventType,
      title: proposal.summaryTitle || `AI summary (${partner.name})`,
      content:
        proposal.summary +
        (proposal.signals.length ? `\n\nSignals:\n${proposal.signals.map((s) => `· ${s}`).join("\n")}` : ""),
      createdById: userId,
      meta: JSON.stringify({
        applied,
        proposal,
        sourceText: opts.sourceText?.slice(0, 8000),
      }),
    },
  });

  return { applied, eventId: event.id };
}
