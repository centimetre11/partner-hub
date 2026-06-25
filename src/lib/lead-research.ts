/** Lead web research: 1–2 model builtin searches → lightweight JSON synthesis (token-saving). */

import type { CrmLead, CrmLeadResearch } from "@prisma/client";
import { db } from "./db";
import { chatJson } from "./ai";
import { generalWebSearch, isWebSearchAvailable, linkedinSearch, webSearchBackendLabel } from "./web-search";

const MAX_RAW_CHARS = 12_000;
const SYNTHESIS_MAX_TOKENS = 1200;

export type LeadResearchSource = { title: string; url?: string; note?: string };

export type LeadResearchStructured = {
  company: {
    name: string;
    verified: boolean;
    country?: string;
    website?: string;
    industry?: string;
    description?: string;
    confidence: "high" | "medium" | "low";
    sources: LeadResearchSource[];
  };
  contact?: {
    name?: string;
    title?: string;
    verified: boolean;
    confidence: "high" | "medium" | "low";
    sources: LeadResearchSource[];
  };
  crmComparison?: {
    companyNameMatch?: boolean;
    countryMatch?: boolean;
    contactNameMatch?: boolean;
    contactTitleMatch?: boolean;
    notes?: string;
  };
  summary: string;
  notes?: string;
};

export type LeadResearchRunResult =
  | { ok: true; research: CrmLeadResearch; structured: LeadResearchStructured }
  | { ok: false; error: string; needsWebSearch?: boolean };

function quoteName(name: string): string {
  const n = name.trim();
  return /\s/.test(n) ? `"${n}"` : n;
}

function buildSearchBlocks(lead: Pick<CrmLead, "name" | "countryCn" | "city" | "contName" | "contDuty">) {
  const company = lead.name?.trim();
  if (!company) return null;

  const region = [lead.countryCn, lead.city].filter(Boolean).join(" ");
  const companyQuery = `${quoteName(company)} ${region} company official website`.replace(/\s+/g, " ").trim();

  const blocks: { label: string; query: string; kind: "web" | "linkedin" }[] = [
    { label: "Company", query: companyQuery, kind: "web" },
  ];

  if (lead.contName?.trim()) {
    const contactQuery = [lead.contName, lead.contDuty, company, region]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    blocks.push({ label: "Contact", query: contactQuery, kind: "linkedin" });
  }

  return { company, region, blocks };
}

function crmContext(lead: CrmLead): string {
  return [
    `Company (CRM): ${lead.name ?? "—"}`,
    `Country (CRM): ${lead.countryCn ?? "—"}`,
    `City (CRM): ${lead.city ?? "—"}`,
    `Contact (CRM): ${lead.contName ?? "—"}`,
    `Title (CRM): ${lead.contDuty ?? "—"}`,
  ].join("\n");
}

async function gatherSearchSnippets(
  lead: CrmLead,
): Promise<{ ok: true; raw: string; queries: string[] } | { ok: false; error: string; needsWebSearch?: boolean }> {
  const plan = buildSearchBlocks(lead);
  if (!plan) return { ok: false, error: "Lead has no company name; cannot research." };

  const canSearch = await isWebSearchAvailable();
  if (!canSearch) {
    return {
      ok: false,
      needsWebSearch: true,
      error:
        "No enabled model with web search found. Add Kimi (moonshot) or Volcengine (tools include web_search) in Settings and enable it.",
    };
  }

  const parts: string[] = [`## CRM fields\n${crmContext(lead)}`];
  const queries: string[] = [];

  for (const block of plan.blocks) {
    queries.push(block.query);
    const result =
      block.kind === "linkedin"
        ? await linkedinSearch({ company: plan.company, person: lead.contName ?? undefined, query: block.query })
        : await generalWebSearch(block.query);
    if (result.ok) {
      parts.push(`## ${block.label} search\nQuery: ${block.query}\n\n${result.text}`);
    } else {
      parts.push(`## ${block.label} search\nQuery: ${block.query}\n\n(no results: ${result.error})`);
    }
  }

  return { ok: true, raw: parts.join("\n\n").slice(0, MAX_RAW_CHARS), queries };
}

async function synthesizeFromSnippets(lead: CrmLead, raw: string, userId?: string): Promise<LeadResearchStructured> {
  const system = `You are a B2B lead research assistant. You receive CRM lead fields and raw web search snippets (titles, links, summaries only).
Verify and enrich the company and contact using ONLY the snippets. Do not invent facts.
Rules:
- If evidence is missing, set verified=false and confidence=low; leave optional fields empty.
- company.verified = true only when snippets clearly refer to the same company as CRM.
- contact.verified = true only when snippets clearly refer to the same person at that company.
- crmComparison: compare public findings vs CRM fields (company name, country, contact name, title).
- summary: concise Markdown in Simplified Chinese (2–6 bullet points) for sales; mention confidence and gaps.
- sources: cite snippet titles/urls used; max 5 per section.
Output JSON only:
{
  "company": {"name","verified","country","website","industry","description","confidence","sources":[{"title","url","note"}]},
  "contact": {"name","title","verified","confidence","sources":[{"title","url","note"}]},
  "crmComparison": {"companyNameMatch","countryMatch","contactNameMatch","contactTitleMatch","notes"},
  "summary": "markdown string",
  "notes": "optional string"
}`;

  const user = `${crmContext(lead)}\n\n---\n\nSearch snippets:\n${raw}`;

  const baseOpts = {
    feature: "Lead research synthesis",
    userId,
    temperature: 0.2,
    taskTier: "fast" as const,
    maxTokens: SYNTHESIS_MAX_TOKENS,
  };

  try {
    return await chatJson<LeadResearchStructured>(system, user, {
      ...baseOpts,
      capability: "lead_research",
    });
  } catch {
    return chatJson<LeadResearchStructured>(system, user, baseOpts);
  }
}

export async function getLeadResearch(leadId: string): Promise<CrmLeadResearch | null> {
  return db.crmLeadResearch.findUnique({ where: { leadId } });
}

export function parseLeadResearchJson(raw: string): LeadResearchStructured | null {
  try {
    return JSON.parse(raw) as LeadResearchStructured;
  } catch {
    return null;
  }
}

export async function runLeadResearch(leadId: string, userId?: string): Promise<LeadResearchRunResult> {
  const lead = await db.crmLead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: "Lead not found." };

  const gathered = await gatherSearchSnippets(lead);
  if (!gathered.ok) {
    return { ok: false, error: gathered.error, needsWebSearch: gathered.needsWebSearch };
  }

  const searchBackend = await webSearchBackendLabel();
  let structured: LeadResearchStructured;
  try {
    structured = await synthesizeFromSnippets(lead, gathered.raw, userId);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const failed = await db.crmLeadResearch.upsert({
      where: { leadId },
      create: {
        leadId,
        summary: "",
        resultJson: "{}",
        searchQuery: gathered.queries.join(" | "),
        searchBackend,
        status: "error",
        error,
        researchedBy: userId ?? null,
        rawChars: gathered.raw.length,
      },
      update: {
        summary: "",
        resultJson: "{}",
        searchQuery: gathered.queries.join(" | "),
        searchBackend,
        status: "error",
        error,
        researchedAt: new Date(),
        researchedBy: userId ?? null,
        rawChars: gathered.raw.length,
      },
    });
    return { ok: false, error };
  }

  const summary = structured.summary?.trim() || "暂无研究摘要。";
  const research = await db.crmLeadResearch.upsert({
    where: { leadId },
    create: {
      leadId,
      summary,
      resultJson: JSON.stringify(structured),
      searchQuery: gathered.queries.join(" | "),
      searchBackend,
      modelUsed: "lead_research",
      status: "done",
      error: null,
      researchedBy: userId ?? null,
      rawChars: gathered.raw.length,
    },
    update: {
      summary,
      resultJson: JSON.stringify(structured),
      searchQuery: gathered.queries.join(" | "),
      searchBackend,
      modelUsed: "lead_research",
      status: "done",
      error: null,
      researchedAt: new Date(),
      researchedBy: userId ?? null,
      rawChars: gathered.raw.length,
    },
  });

  return { ok: true, research, structured };
}
