/** Lead web research: 多组并行联网检索（官网/业务/行业/背景/LinkedIn/新闻）→ 轻量 JSON 整理，重点在公司。 */

import type { CrmLead, CrmLeadResearch } from "@prisma/client";
import { db } from "./db";
import { chatJson } from "./ai";
import { buildEnglishSearchQueries } from "./lead-research-query";
import { generalWebSearch, isWebSearchAvailable, linkedinSearch, webSearchBackendLabel } from "./web-search";

const MAX_RAW_CHARS = 28_000;
const SYNTHESIS_MAX_TOKENS = 3400;

export type LeadResearchSource = { title: string; url?: string; note?: string };

export type LeadResearchStructured = {
  company: {
    name: string;
    verified: boolean;
    country?: string;
    website?: string;
    industry?: string;
    /** 一句话定位 */
    description?: string;
    /** 公司做什么、业务背景（重点字段，尽量详实） */
    background?: string;
    /** 主要产品 / 服务 / 客户群 */
    products?: string;
    /** 规模、员工、营收等公开信息 */
    scale?: string;
    confidence: "high" | "medium" | "low";
    sources: LeadResearchSource[];
  };
  /** 仅当公司检索结果中顺带出现时才填；勿单独花精力搜人 */
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
  const lines = [
    `Company (PRIMARY research target): ${lead.name ?? "—"}`,
    `Country: ${lead.countryCn ?? "—"}`,
    `City: ${lead.city ?? "—"}`,
  ];
  if (lead.contName?.trim()) {
    lines.push(`CRM contact (secondary, do NOT prioritize): ${lead.contName}${lead.contDuty ? ` · ${lead.contDuty}` : ""}`);
  }
  return lines.join("\n");
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

  const queries = plan.blocks.map((b) => b.query);

  // 并行执行多组检索，扩大召回又不显著拉长总时长。
  const results = await Promise.all(
    plan.blocks.map(async (block) => {
      const result =
        block.kind === "linkedin"
          ? await linkedinSearch({ query: block.query, scene: "lead_research" })
          : await generalWebSearch(block.query, 5, block.kind === "news" ? "news" : undefined, {
              scene: "lead_research",
            });
      return result.ok
        ? `## ${block.label} search\nQuery: ${block.query}\n\n${result.text}`
        : `## ${block.label} search\nQuery: ${block.query}\n\n(no results: ${result.error})`;
    }),
  );

  const parts = [`## Lead hints (for context only, not for strict matching)\n${leadHints(lead)}`, ...results];

  return { ok: true, raw: parts.join("\n\n").slice(0, MAX_RAW_CHARS), queries };
}

function buildFallbackSummary(structured: LeadResearchStructured): string {
  const lines: string[] = [];
  const c = structured.company;
  lines.push(`- **公司**：${c.name}${c.verified ? "" : "（公开信息有限，置信度：" + c.confidence + "）"}`);
  if (c.country) lines.push(`- **国家/地区**：${c.country}`);
  if (c.website) lines.push(`- **官网**：${c.website}`);
  if (c.industry) lines.push(`- **行业**：${c.industry}`);
  if (c.description) lines.push(`- **定位**：${c.description}`);
  if (c.background) lines.push(`- **业务与背景**：${c.background}`);
  if (c.products) lines.push(`- **产品/服务**：${c.products}`);
  if (c.scale) lines.push(`- **规模**：${c.scale}`);
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
  const system = `You are a B2B lead research assistant focused on COMPANY intelligence for sales prep.
You receive lead hints and raw web search snippets (titles, links, summaries only).

PRIMARY GOAL: explain what the company does, its industry, business model, products/services, scale, and background/history from public sources.
The CRM contact person is NOT important — omit the "contact" object entirely unless snippets clearly mention them on a company page.

Do not invent facts. Do NOT compare or judge against CRM/lead input fields.

Rules:
- Spend ~90% of your effort on company fields; contact is optional and usually omitted.
- Extract the best public company profile even if spelling differs slightly from the lead hint.
- If evidence is missing, set verified=false and confidence=low; leave optional fields empty.
- company.verified = true when snippets clearly describe a real company with useful public info.
- description: one-line positioning, <= 80 Simplified Chinese characters.
- background: main field — what the company does, history, markets, notable facts; <= 500 Simplified Chinese characters; be substantive.
- products: key products, services, or customer segments; <= 200 characters.
- scale: employees, revenue, branches, market position if publicly stated; <= 120 characters.
- summary: concise Markdown in Simplified Chinese (4–7 bullets) for sales — focus on company business, not the contact person.
- sources: up to 4 for company; keep title short; omit note unless essential.
- Omit "contact" unless unavoidable.
- Keep JSON compact but prioritize filling background/products.

Output JSON only:
{
  "company": {"name","verified","country","website","industry","description","background","products","scale","confidence","sources":[{"title","url"}]},
  "contact": optional {"name","title","verified","confidence","sources":[{"title","url"}]},
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
    scene: "lead_research" as const,
  };

  return normalizeStructured(await chatJson<LeadResearchStructured>(system, user, baseOpts));
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

  const searchBackend = await webSearchBackendLabel({ scene: "lead_research" });
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
