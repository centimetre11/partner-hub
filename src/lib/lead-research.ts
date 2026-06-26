/** Lead web research: 1–2 model builtin searches → lightweight JSON synthesis (token-saving). */

import type { CrmLead, CrmLeadResearch } from "@prisma/client";
import { db } from "./db";
import { chatJson } from "./ai";
import { buildEnglishSearchQueries } from "./lead-research-query";
import { generalWebSearch, isWebSearchAvailable, linkedinSearch, webSearchBackendLabel } from "./web-search";

const MAX_RAW_CHARS = 12_000;
const SYNTHESIS_MAX_TOKENS = 2600;

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
  summary: string;
  notes?: string;
};

export type LeadResearchRunResult =
  | { ok: true; research: CrmLeadResearch; structured: LeadResearchStructured }
  | { ok: false; error: string; needsWebSearch?: boolean };

function leadHints(lead: CrmLead): string {
  return [
    `Company: ${lead.name ?? "—"}`,
    `Country: ${lead.countryCn ?? "—"}`,
    `City: ${lead.city ?? "—"}`,
    `Contact: ${lead.contName ?? "—"}`,
    `Title: ${lead.contDuty ?? "—"}`,
  ].join("\n");
}

async function gatherSearchSnippets(
  lead: CrmLead,
): Promise<{ ok: true; raw: string; queries: string[] } | { ok: false; error: string; needsWebSearch?: boolean }> {
  const plan = buildEnglishSearchQueries(lead);
  if (!plan) return { ok: false, error: "Lead has no company name; cannot research." };

  const canSearch = await isWebSearchAvailable();
  if (!canSearch) {
    return {
      ok: false,
      needsWebSearch: true,
      error:
        "No enabled model with web search found. Add a Volcengine configuration with web_search in Settings → AI API manager and enable it.",
    };
  }

  const parts: string[] = [`## Lead hints (for context only, not for strict matching)\n${leadHints(lead)}`];
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

function buildFallbackSummary(structured: LeadResearchStructured): string {
  const lines: string[] = [];
  const c = structured.company;
  lines.push(`- **公司**：${c.name}${c.verified ? "" : "（公开信息有限，置信度：" + c.confidence + "）"}`);
  if (c.country) lines.push(`- **国家/地区**：${c.country}`);
  if (c.website) lines.push(`- **官网**：${c.website}`);
  if (c.industry) lines.push(`- **行业**：${c.industry}`);
  if (c.description) lines.push(`- **简介**：${c.description}`);
  if (structured.contact?.name) {
    lines.push(
      `- **联系人**：${structured.contact.name}${structured.contact.title ? " · " + structured.contact.title : ""}`,
    );
  }
  if (structured.notes) lines.push(`- **备注**：${structured.notes}`);
  if (lines.length === 1 && c.sources?.length) {
    lines.push(`- 检索到 ${c.sources.length} 条公开来源。`);
  }
  return lines.join("\n");
}

function normalizeStructured(structured: LeadResearchStructured): LeadResearchStructured {
  if (!structured.summary?.trim()) {
    structured.summary = buildFallbackSummary(structured);
  }
  return structured;
}

async function synthesizeFromSnippets(lead: CrmLead, raw: string, userId?: string): Promise<LeadResearchStructured> {
  const system = `You are a B2B lead research assistant. You receive lead hints and raw web search snippets (titles, links, summaries only).
Summarize what public sources say about the company and contact. Do not invent facts. Do NOT compare or judge against CRM/lead input fields.
Rules:
- Extract the best public profile from snippets even if the company name spelling differs slightly from the lead hint.
- If evidence is missing, set verified=false and confidence=low; leave optional fields empty.
- company.verified = true when snippets clearly describe a real company with useful public info.
- contact.verified = true when snippets clearly describe the named person (or a likely match at that company).
- description: <= 280 Simplified Chinese characters.
- summary: concise Markdown in Simplified Chinese (2–5 short bullet points) for sales.
- sources: at most 2 per section; keep title short; omit note unless essential.
- Keep the whole JSON compact so it is not truncated.
Output JSON only:
{
  "company": {"name","verified","country","website","industry","description","confidence","sources":[{"title","url"}]},
  "contact": {"name","title","verified","confidence","sources":[{"title","url"}]},
  "summary": "markdown string",
  "notes": "optional short string"
}`;

  const user = `${leadHints(lead)}\n\n---\n\nSearch snippets:\n${raw}`;

  const baseOpts = {
    feature: "Lead research synthesis",
    userId,
    temperature: 0.2,
    taskTier: "fast" as const,
    maxTokens: SYNTHESIS_MAX_TOKENS,
  };

  try {
    return normalizeStructured(
      await chatJson<LeadResearchStructured>(system, user, {
        ...baseOpts,
        capability: "lead_research",
      }),
    );
  } catch {
    return normalizeStructured(await chatJson<LeadResearchStructured>(system, user, baseOpts));
  }
}

export async function getLeadResearch(leadId: string): Promise<CrmLeadResearch | null> {
  return db.crmLeadResearch.findUnique({ where: { leadId } });
}

export function parseLeadResearchJson(raw: string): LeadResearchStructured | null {
  try {
    const parsed = JSON.parse(raw) as LeadResearchStructured & { crmComparison?: unknown };
    if (parsed?.company) {
      delete parsed.crmComparison;
      return normalizeStructured(parsed);
    }
    return parsed;
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
    await db.crmLeadResearch.upsert({
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
