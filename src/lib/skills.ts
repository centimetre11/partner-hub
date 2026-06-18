import { db } from "./db";
import type { ToolDef } from "./ai";
import { PARTNER_FIELD_LABELS, stageName } from "./constants";
import { partnerContext, type FieldUpdate } from "./proposals";
import { computeCompleteness, staleDays } from "./completeness";
import { generalWebSearch, linkedinSearch } from "./web-search";
import { readKmsForUser, writeKmsForUser } from "./kms";
import {
  KIMI_BUILTIN_SEARCH,
  shouldUseKimiBuiltinSearch,
  shouldUseVolcengineBuiltinSearch,
} from "./builtin-search";
import { MONITOR_DIMENSIONS, MONITOR_SENTIMENT_LABELS } from "./constants";
import { formatTierLabel, partnerFieldValueFromText } from "./tier";

// ============ Skill execution context ============

export type AgentFieldProposal = {
  partnerId: string;
  partnerName: string;
  fieldUpdates: FieldUpdate[];
};

export type SkillContext = {
  mode: "assistant" | "agent";
  userId: string | null;
  agentId?: string;
  agentName?: string;
  // Proposals awaiting human confirmation in agent mode
  pendingProposals: AgentFieldProposal[];
  // Write-action log (for reporting)
  actions: string[];
};

export function newSkillContext(partial: Partial<SkillContext> & Pick<SkillContext, "mode">): SkillContext {
  return { userId: null, pendingProposals: [], actions: [], ...partial };
}

// ============ Skill definitions ============

export type Skill = {
  name: string;
  label: string; // Display name (UI)
  desc: string; // Description (UI)
  def: ToolDef;
  run: (args: Record<string, unknown>, ctx: SkillContext) => Promise<string>;
};

async function findPartnerByName(name: string) {
  return (
    (await db.partner.findFirst({ where: { name: { equals: name } } })) ??
    (await db.partner.findFirst({ where: { name: { contains: name } } }))
  );
}

// ---- Search partners ----
const searchPartners: Skill = {
  name: "search_partners",
  label: "Search partners",
  desc: "Filter partners by name, status, tier, country, or stale days",
  def: {
    type: "function",
    function: {
      name: "search_partners",
      description: "Search/filter partner list. Returns basics, pipeline stage, completeness, and stale days.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Company name keyword (optional)" },
          status: { type: "string", enum: ["PROSPECT", "ACTIVE", "ARCHIVED"], description: "PROSPECT=candidate / ACTIVE=active" },
          tier: { type: "string", enum: ["A", "B", "C"] },
          country: { type: "string", description: "Country keyword, e.g. KSA, UAE" },
          staleDaysOver: { type: "number", description: "Only partners with no activity for N+ days" },
        },
      },
    },
  },
  run: async (args) => {
    const partners = await db.partner.findMany({
      where: {
        ...(args.query ? { name: { contains: String(args.query) } } : {}),
        ...(args.status ? { status: String(args.status) } : {}),
        ...(args.tier ? { tier: String(args.tier) } : {}),
        ...(args.country ? { country: { contains: String(args.country) } } : {}),
      },
      include: { contacts: true, opportunities: true, events: true, trainings: true, owner: true },
      take: 100,
    });
    const rows = partners
      .map((p) => {
        const stale = staleDays(p);
        if (args.staleDaysOver && stale <= Number(args.staleDaysOver)) return null;
        const c = computeCompleteness(p);
        return `${p.name} | ${p.status === "ACTIVE" ? "Active" : p.status === "PROSPECT" ? "Prospect" : "Archived"} | Tier ${p.tier ?? "-"} | ${p.country ?? "?"} | Stage ${p.pipelineStage}(${stageName(p.pipelineStage)}) | Completeness ${c.score}% | ${stale}d stale | Owner:${p.owner?.name ?? "none"} | Clients:${(p.knownClients ?? "").slice(0, 50)}`;
      })
      .filter(Boolean);
    return rows.length ? rows.join("\n") : "No partners match the criteria";
  },
};

// ---- Read profile ----
const getPartner: Skill = {
  name: "get_partner",
  label: "Read partner profile",
  desc: "Get full partner profile (persona, power map, opportunities)",
  def: {
    type: "function",
    function: {
      name: "get_partner",
      description: "Get a partner's full profile by name (persona, power map, opportunities).",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "Company name (fuzzy match supported)" } },
        required: ["name"],
      },
    },
  },
  run: async (args) => {
    const p = await findPartnerByName(String(args.name));
    if (!p) return `No partner found matching "${args.name}"`;
    return await partnerContext(p.id);
  },
};

// ---- Update profile ----
const updatePartner: Skill = {
  name: "update_partner",
  label: "Update partner profile",
  desc: "Edit partner fields. Applied directly in assistant chat; in agent runs becomes a proposal for human approval",
  def: {
    type: "function",
    function: {
      name: "update_partner",
      description: `Update partner profile fields. Available fields: ${Object.entries(PARTNER_FIELD_LABELS).map(([f, l]) => `${f}(${l})`).join(", ")}. pipelineStage is a number 1-10.`,
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Company name" },
          fields: { type: "object", description: 'Field key-value pairs, e.g. {"pipelineStage": 5, "tier": "A"}' },
        },
        required: ["name", "fields"],
      },
    },
  },
  run: async (args, ctx) => {
    const p = await findPartnerByName(String(args.name));
    if (!p) return `No partner found matching "${args.name}"`;
    const fields = (args.fields ?? {}) as Record<string, unknown>;

    const updates: FieldUpdate[] = [];
    for (const [k, v] of Object.entries(fields)) {
      if (!(k in PARTNER_FIELD_LABELS) || k === "name") continue;
      const oldVal = (p as unknown as Record<string, unknown>)[k];
      updates.push({
        field: k,
        label: PARTNER_FIELD_LABELS[k],
        oldValue: oldVal == null ? null : String(oldVal),
        newValue: String(v),
      });
    }
    if (!updates.length) return "No valid fields to update";

    if (ctx.mode === "agent") {
      // Agent run: don't write directly; create proposal for human approval
      ctx.pendingProposals.push({ partnerId: p.id, partnerName: p.name, fieldUpdates: updates });
      return `Created change proposal for ${p.name} (${updates.map((u) => u.label).join(", ")}); pending human approval.`;
    }

    // Assistant mode: explicit user instruction — apply directly + audit
    const data: Record<string, unknown> = {};
    const changes: string[] = [];
    for (const u of updates) {
      const parsed = partnerFieldValueFromText(u.field, u.newValue);
      if (parsed === undefined) continue;
      data[u.field] = parsed;
      changes.push(
        `${u.label} → ${u.field === "pipelineStage" ? `${parsed}(${stageName(Number(parsed))})` : u.field === "tier" ? formatTierLabel(String(parsed)) : parsed}`,
      );
    }
    await db.partner.update({ where: { id: p.id }, data });
    await db.timelineEvent.create({
      data: {
        partnerId: p.id,
        type: "CHANGE",
        title: "AI assistant profile update",
        content: changes.join("; "),
        createdById: ctx.userId,
        meta: JSON.stringify({ via: "assistant", fields }),
      },
    });
    const msg = `Updated ${p.name}: ${changes.join("; ")}`;
    ctx.actions.push(msg);
    return msg;
  },
};

// ---- Create todo ----
const createTodo: Skill = {
  name: "create_todo",
  label: "Create todo",
  desc: "Create a todo item, optionally linked to a partner with a due date",
  def: {
    type: "function",
    function: {
      name: "create_todo",
      description: "Create a todo item.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          partnerName: { type: "string", description: "Linked partner company name (optional)" },
          dueDate: { type: "string", description: "Due date YYYY-MM-DD (optional)" },
          priority: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
          detail: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  run: async (args, ctx) => {
    let partnerId: string | null = null;
    if (args.partnerName) {
      const p = await findPartnerByName(String(args.partnerName));
      partnerId = p?.id ?? null;
    }
    const t = await db.todoItem.create({
      data: {
        title: String(args.title),
        detail: args.detail ? String(args.detail) : ctx.agentName ? `Created by Agent "${ctx.agentName}"` : null,
        partnerId,
        assigneeId: ctx.userId,
        dueDate: args.dueDate ? new Date(String(args.dueDate)) : null,
        priority: ["HIGH", "MEDIUM", "LOW"].includes(String(args.priority)) ? String(args.priority) : "MEDIUM",
        source: "AI",
      },
    });
    const msg = `Created todo: ${t.title}${t.dueDate ? ` (due ${t.dueDate.toISOString().slice(0, 10)})` : ""}`;
    ctx.actions.push(msg);
    return msg;
  },
};

// ---- List todos ----
const listTodos: Skill = {
  name: "list_todos",
  label: "List todos",
  desc: "View open or overdue todo items",
  def: {
    type: "function",
    function: {
      name: "list_todos",
      description: "List todo items.",
      parameters: {
        type: "object",
        properties: {
          overdueOnly: { type: "boolean", description: "Overdue only" },
          partnerName: { type: "string", description: "Filter by partner" },
        },
      },
    },
  },
  run: async (args) => {
    const todos = await db.todoItem.findMany({
      where: {
        status: "OPEN",
        ...(args.overdueOnly ? { dueDate: { lt: new Date() } } : {}),
        ...(args.partnerName ? { partner: { name: { contains: String(args.partnerName) } } } : {}),
      },
      include: { partner: true, assignee: true },
      orderBy: { dueDate: "asc" },
      take: 50,
    });
    return todos.length
      ? todos
          .map(
            (t) =>
              `[${t.priority}] ${t.title} | Partner:${t.partner?.name ?? "-"} | Due:${t.dueDate?.toISOString().slice(0, 10) ?? "-"} | Assignee:${t.assignee?.name ?? "-"}`
          )
          .join("\n")
      : "No open todos";
  },
};

// ---- LinkedIn search ----
const linkedinSearchTool: Skill = {
  name: "linkedin_search",
  label: "LinkedIn search",
  desc: "Search LinkedIn company pages, executive activity, and public career info (monitor key contacts)",
  def: {
    type: "function",
    function: {
      name: "linkedin_search",
      description:
        "Search LinkedIn public content: company pages, executive profiles, recent posts. Monitor partner CEO/CTO moves, HR changes, posts. Prefer company + person. All query/company/person/topic parameters MUST be English keywords (e.g. 'Beinex Dubai CEO LinkedIn').",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string", description: "Company name in English, e.g. Beinex, TechMantra" },
          person: { type: "string", description: "Contact name in English, e.g. Shantosh Sridhar" },
          topic: { type: "string", description: "Extra English keywords, e.g. hiring, partnership, Dubai" },
          query: { type: "string", description: "Full search query in English only" },
          maxResults: { type: "number", description: "Result count, default 5" },
        },
      },
    },
  },
  run: async (args) => {
    const result = await linkedinSearch({
      company: args.company ? String(args.company) : undefined,
      person: args.person ? String(args.person) : undefined,
      topic: args.topic ? String(args.topic) : undefined,
      query: args.query ? String(args.query) : undefined,
      maxResults: Number(args.maxResults) || 5,
    });
    return result.ok ? result.text : result.error;
  },
};

// ---- Web search ----
const webSearch: Skill = {
  name: "web_search",
  label: "News search",
  desc: "Search public news, hiring, awards, competitor activity (non-LinkedIn scenarios)",
  def: {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search public web info: company news, personnel changes, hiring signals, contract awards, competitor moves. Query MUST be English keywords only, e.g. 'Beinex Dubai contract award 2026', 'Acme Analytics Saudi Arabia SAP partner website'. Never use Chinese in query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "English search keywords only (company + country + topic)" },
          maxResults: { type: "number", description: "Result count, default 5" },
          topic: { type: "string", enum: ["general", "news"], description: "news=news-focused" },
        },
        required: ["query"],
      },
    },
  },
  run: async (args) => {
    const topic = args.topic === "news" ? "news" : undefined;
    const result = await generalWebSearch(String(args.query), Number(args.maxResults) || 5, topic);
    return result.ok ? result.text : result.error;
  },
};

// ---- Add timeline event ----
const addTimelineEvent: Skill = {
  name: "add_timeline_event",
  label: "Add partner timeline event",
  desc: "Record external signals/news on a partner timeline (applied directly, audited)",
  def: {
    type: "function",
    function: {
      name: "add_timeline_event",
      description: "Add a discovered signal/news item to a partner's timeline.",
      parameters: {
        type: "object",
        properties: {
          partnerName: { type: "string", description: "Partner company name" },
          title: { type: "string", description: "Event title (one line)" },
          content: { type: "string", description: "Details (include source URL)" },
        },
        required: ["partnerName", "title"],
      },
    },
  },
  run: async (args, ctx) => {
    const p = await findPartnerByName(String(args.partnerName));
    if (!p) return `No partner found matching "${args.partnerName}"`;
    await db.timelineEvent.create({
      data: {
        partnerId: p.id,
        type: "NEWS",
        title: String(args.title),
        content: args.content ? String(args.content) : null,
        createdById: ctx.userId,
        meta: JSON.stringify({ via: ctx.mode, agentId: ctx.agentId, agentName: ctx.agentName }),
      },
    });
    const msg = `Added to ${p.name} timeline: ${args.title}`;
    ctx.actions.push(msg);
    return msg;
  },
};

// ---- Sentiment scan ----
const scanSentiment: Skill = {
  name: "scan_sentiment",
  label: "Sentiment scan",
  desc: "Run a web sentiment scan for a partner by dimension/sentiment, including custom monitor sources",
  def: {
    type: "function",
    function: {
      name: "scan_sentiment",
      description:
        "Run sentiment monitoring for a partner: web scan across company news, HR, hiring, deals, funding, competitors, social, reputation, events, ecosystem, risk; AI classifies sentiment, dedupes, stores; negative/high-risk items go to partner timeline. Returns new-item summary.",
      parameters: {
        type: "object",
        properties: {
          partnerName: { type: "string", description: "Partner company name (fuzzy match)" },
          dimensions: {
            type: "array",
            items: { type: "string", enum: MONITOR_DIMENSIONS },
            description: "Optional: limit scan dimensions; defaults to partner-selected or all",
          },
        },
        required: ["partnerName"],
      },
    },
  },
  run: async (args, ctx) => {
    const p = await findPartnerByName(String(args.partnerName));
    if (!p) return `No partner found matching "${args.partnerName}"`;
    const dims = Array.isArray(args.dimensions) ? (args.dimensions as unknown[]).map(String) : undefined;
    // Dynamic import to avoid skills ↔ sentiment-monitor circular dependency at init
    const { scanPartnerSentiment } = await import("./sentiment-monitor");
    const r = await scanPartnerSentiment(p.id, { userId: ctx.userId, dims });
    if (!r.ok) return r.error ?? "Sentiment scan failed";
    const breakdown = Object.entries(r.bySentiment)
      .map(([k, v]) => `${MONITOR_SENTIMENT_LABELS[k] ?? k} ${v}`)
      .join(", ");
    const msg = r.created
      ? `Scanned ${r.scanned} sources for ${p.name}, added ${r.created} sentiment items (${breakdown || "—"})`
      : `Scanned ${r.scanned} sources for ${p.name}; no new findings this run`;
    ctx.actions.push(msg);
    return msg;
  },
};

// ---- Search knowledge base ----
const searchKnowledge: Skill = {
  name: "search_knowledge",
  label: "Search knowledge base",
  desc: "Search team knowledge base (Fanruan background, Middle East strategy, product capabilities) for citations",
  def: {
    type: "function",
    function: {
      name: "search_knowledge",
      description: "Search team knowledge base for relevant snippets when drafting briefs or proposals.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search keywords" },
          category: {
            type: "string",
            enum: ["COMPANY", "PRODUCT", "STRATEGY", "PLAYBOOK", "OTHER"],
            description: "Optional category filter",
          },
        },
        required: ["query"],
      },
    },
  },
  run: async (args) => {
    const q = String(args.query ?? "").trim();
    if (!q) return "Please provide search keywords";
    const articles = await db.knowledgeArticle.findMany({
      where: {
        shared: true,
        ...(args.category ? { category: String(args.category) } : {}),
        OR: [
          { title: { contains: q } },
          { content: { contains: q } },
        ],
      },
      take: 5,
      orderBy: { updatedAt: "desc" },
    });
    if (!articles.length) return `No knowledge base content found for "${q}"`;
    return articles
      .map((a, i) => `${i + 1}. [${a.title}] (${a.category})\n${a.content.slice(0, 800)}${a.content.length > 800 ? "…" : ""}`)
      .join("\n\n---\n\n");
  },
};

// ---- Read company KMS (Confluence) ----
const readKms: Skill = {
  name: "read_kms",
  label: "Read KMS documents",
  desc: "Read Fanruan internal Confluence (kms.fineres.com) by pageId/URL or keyword search",
  def: {
    type: "function",
    function: {
      name: "read_kms",
      description:
        "Read Fanruan KMS (Confluence) internal docs. Use pageId, full URL, or query keyword search. Requires personal access token in settings. Best for product docs, internal policy, process specs.",
      parameters: {
        type: "object",
        properties: {
          pageId: { type: "string", description: "KMS page ID, e.g. 1420741418" },
          url: { type: "string", description: "Full KMS page URL (viewpage.action?pageId=… or /display/{space}/{title})" },
          query: { type: "string", description: "Full-text search keywords, e.g. FineBI pricing, partner policy" },
          limit: { type: "number", description: "Search result count, default 3" },
        },
      },
    },
  },
  run: async (args, ctx) =>
    readKmsForUser(ctx.userId, {
      pageId: args.pageId ? String(args.pageId) : undefined,
      url: args.url ? String(args.url) : undefined,
      query: args.query ? String(args.query) : undefined,
      limit: Number(args.limit) || 3,
    }),
};

// ---- Write company KMS (Confluence) ----
const writeKms: Skill = {
  name: "write_kms",
  label: "Write KMS documents",
  desc: "Append, prepend, replace content on a KMS page, or create a child page (requires write permission)",
  def: {
    type: "function",
    function: {
      name: "write_kms",
      description:
        "Write to Fanruan KMS (Confluence). Modes: append (default, safest), prepend, replace (overwrites body), create_child (new page under parent). Requires personal access token with edit permission on the target page/space.",
      parameters: {
        type: "object",
        properties: {
          pageId: { type: "string", description: "Target KMS page ID" },
          url: { type: "string", description: "Target KMS page URL" },
          content: { type: "string", description: "Plain text or simple Markdown body to write" },
          mode: {
            type: "string",
            enum: ["append", "prepend", "replace", "create_child"],
            description: "append=add to end (default); prepend=add to top; replace=overwrite body; create_child=new sub-page",
          },
          title: { type: "string", description: "Required for create_child; optional to rename page on replace" },
        },
        required: ["content"],
      },
    },
  },
  run: async (args, ctx) =>
    writeKmsForUser(ctx.userId, {
      pageId: args.pageId ? String(args.pageId) : undefined,
      url: args.url ? String(args.url) : undefined,
      content: String(args.content ?? ""),
      mode: args.mode ? (String(args.mode) as "append" | "prepend" | "replace" | "create_child") : undefined,
      title: args.title ? String(args.title) : undefined,
    }),
};

// ---- Save to report center ----
const createDocument: Skill = {
  name: "create_document",
  label: "Save to report center",
  desc: "Save a Markdown report to the report center, optionally linked to a partner",
  def: {
    type: "function",
    function: {
      name: "create_document",
      description: "Save a completed Markdown report to the report center. For pre-meeting briefs, joint solution reports, etc.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Report title" },
          content: { type: "string", description: "Markdown body" },
          type: {
            type: "string",
            enum: ["AGENT_BRIEF", "JOINT_SOLUTION", "MEETING_PREP", "CUSTOM"],
            description: "Report type",
          },
          partnerName: { type: "string", description: "Linked partner name (optional)" },
        },
        required: ["title", "content"],
      },
    },
  },
  run: async (args, ctx) => {
    let partnerId: string | null = null;
    if (args.partnerName) {
      const p = await findPartnerByName(String(args.partnerName));
      partnerId = p?.id ?? null;
    }
    const doc = await db.document.create({
      data: {
        title: String(args.title),
        content: String(args.content),
        type: String(args.type ?? "AGENT_BRIEF"),
        status: "DRAFT",
        partnerId,
        createdById: ctx.userId,
      },
    });
    const msg = `Saved to report center: ${doc.title} (/documents/${doc.id})`;
    ctx.actions.push(msg);
    return msg;
  },
};

// ============ Registry ============

export const SKILLS: Skill[] = [
  searchPartners,
  getPartner,
  updatePartner,
  createTodo,
  listTodos,
  linkedinSearchTool,
  webSearch,
  scanSentiment,
  addTimelineEvent,
  searchKnowledge,
  readKms,
  writeKms,
  createDocument,
];

export const SKILL_MAP = new Map(SKILLS.map((s) => [s.name, s]));

export const DEFAULT_AGENT_SKILLS = [
  "search_partners",
  "get_partner",
  "linkedin_search",
  "web_search",
  "add_timeline_event",
  "create_todo",
  "search_knowledge",
  "read_kms",
  "write_kms",
];

export const REPORT_AGENT_KEYWORDS = [
  "Pre-meeting Brief",
  "Joint Solution Report",
  "Sentiment Monitor",
  "pre-meeting brief",
  "meeting prep",
  "joint solution",
  "joint solutions",
  // legacy
  "会前简报",
  "联合方案",
  "联合解决方案",
];

export const ASSISTANT_SKILLS = [
  "search_partners",
  "get_partner",
  "update_partner",
  "create_todo",
  "list_todos",
  "linkedin_search",
  "web_search",
  "read_kms",
  "write_kms",
  "search_knowledge",
];

/** Read-only research tools for AI intake/profile enrichment (no write operations) */
export const INTAKE_ENRICHMENT_SKILLS = [
  "search_partners",
  "get_partner",
  "web_search",
  "linkedin_search",
  "read_kms",
  "search_knowledge",
] as const;

export function intakeEnrichmentSkillsForScope(scope: string): string[] {
  switch (scope) {
    case "new_partner":
    case "profile":
      return [...INTAKE_ENRICHMENT_SKILLS];
    case "powermap":
      // Keep AI contact add minimal: extract from user text/images only, no web research
      return [];
    case "opportunity":
      return ["web_search", "search_knowledge"];
    default:
      return [];
  }
}

export async function buildIntakeTools(skillNames: string[]): Promise<(ToolDef | Record<string, unknown>)[]> {
  return skillsToTools(skillNames);
}

// Builtin web-search detection moved to ./builtin-search to avoid circular deps with sentiment-monitor; re-exported for compatibility
export { KIMI_BUILTIN_SEARCH, shouldUseVolcengineBuiltinSearch, shouldUseKimiBuiltinSearch };
export { shouldUseBuiltinWebSearch } from "./builtin-search";

export function skillsToTools(names: string[]): ToolDef[] {
  return names.map((n) => SKILL_MAP.get(n)?.def).filter(Boolean) as ToolDef[];
}

export async function runSkill(name: string, args: Record<string, unknown>, ctx: SkillContext): Promise<string> {
  const skill = SKILL_MAP.get(name);
  if (!skill) return `Unknown tool: ${name}`;
  try {
    return await skill.run(args, ctx);
  } catch (e) {
    return `Tool ${name} failed: ${e instanceof Error ? e.message : e}`;
  }
}
