import { db } from "./db";
import type { ToolDef } from "./ai";
import { CUSTOMER_FIELD_LABELS, PARTNER_FIELD_LABELS, stageName } from "./constants";
import { partnerContext, customerContext, type FieldUpdate } from "./proposals";
import { computeCompleteness, staleDays } from "./completeness";
import { generalWebSearch, linkedinSearch } from "./web-search";
import { readKmsForUser, writeKmsForUser } from "./kms";
import { searchKnowhowForAgent } from "./knowhow";
import {
  KIMI_BUILTIN_SEARCH,
  shouldUseKimiBuiltinSearch,
  shouldUseVolcengineBuiltinSearch,
} from "./builtin-search";
import { MONITOR_DIMENSIONS, MONITOR_SENTIMENT_LABELS } from "./constants";
import { formatTierLabel, partnerFieldValueFromText } from "./tier";
import { dueWithinDaysRange, overdueDueDateBefore } from "./todo-dates";
import { END_CUSTOMER_WHERE } from "./customer-filters";
import { enqueueWecomPush } from "./wecom-push";
import { getWecomChatByChatId, listWecomChats } from "./wecom-chats";

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

async function findCustomerByName(name: string) {
  const q = String(name).trim();
  if (!q) return null;
  return (
    (await db.customer.findFirst({ where: { ...END_CUSTOMER_WHERE, name: { equals: q } } })) ??
    (await db.customer.findFirst({ where: { ...END_CUSTOMER_WHERE, name: { contains: q } } }))
  );
}

async function resolveOwnerFilter(args: {
  partnerId?: unknown;
  partnerName?: unknown;
  customerId?: unknown;
  customerName?: unknown;
}) {
  const partnerId = args.partnerId ? String(args.partnerId).trim() : "";
  let customerId = args.customerId ? String(args.customerId).trim() : "";
  if (!customerId && args.customerName) {
    const c = await findCustomerByName(String(args.customerName));
    customerId = c?.id ?? "";
  }
  return { partnerId, customerId };
}

/** Resolve partner/customer link for write tools (customer takes precedence when customerName/Id set). */
async function resolveOwnerLink(args: {
  partnerId?: unknown;
  partnerName?: unknown;
  customerId?: unknown;
  customerName?: unknown;
}): Promise<{ partnerId: string | null; customerId: string | null; ownerLabel: string | null }> {
  let customerId = args.customerId ? String(args.customerId).trim() : "";
  if (!customerId && args.customerName) {
    const c = await findCustomerByName(String(args.customerName));
    customerId = c?.id ?? "";
  }
  let partnerId = "";
  if (!customerId) {
    partnerId = args.partnerId ? String(args.partnerId).trim() : "";
    if (!partnerId && args.partnerName) {
      const p = await findPartnerByName(String(args.partnerName));
      partnerId = p?.id ?? "";
    }
  }
  let ownerLabel: string | null = null;
  if (customerId) {
    ownerLabel = (await db.customer.findUnique({ where: { id: customerId }, select: { name: true } }))?.name ?? null;
  } else if (partnerId) {
    ownerLabel = (await db.partner.findUnique({ where: { id: partnerId }, select: { name: true } }))?.name ?? null;
  }
  return { partnerId: partnerId || null, customerId: customerId || null, ownerLabel };
}

const CUSTOMER_STATUSES = ["ACTIVE", "PROSPECT", "INACTIVE"] as const;

function customerFieldValueFromText(field: string, value: string): unknown {
  const v = value.trim();
  if (!v) return undefined;
  if (field === "status") {
    const s = v.toUpperCase();
    return (CUSTOMER_STATUSES as readonly string[]).includes(s) ? s : undefined;
  }
  return v;
}

async function findUserByName(name: string) {
  const q = String(name).trim();
  if (!q) return null;
  const users = await db.user.findMany({ take: 50 });
  const lower = q.toLowerCase();
  return (
    users.find((u) => u.name?.toLowerCase() === lower) ??
    users.find((u) => u.name?.toLowerCase().includes(lower)) ??
    users.find((u) => u.email?.toLowerCase().includes(lower)) ??
    users.find((u) => u.crmSalesmanName?.toLowerCase().includes(lower)) ??
    null
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

// ---- Search customers (end-customer accounts) ----
const searchCustomers: Skill = {
  name: "search_customers",
  label: "Search customers",
  desc: "Search end-customer (account) records by name, status, or country",
  def: {
    type: "function",
    function: {
      name: "search_customers",
      description:
        "Search/filter end-customer (account) list — NOT Fanruan partners. Use when the user asks about a 客户/customer/account.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Customer company name keyword (optional)" },
          status: { type: "string", enum: ["ACTIVE", "PROSPECT", "INACTIVE"] },
          country: { type: "string", description: "Country keyword, e.g. UAE, KSA" },
        },
      },
    },
  },
  run: async (args) => {
    const customers = await db.customer.findMany({
      where: {
        ...END_CUSTOMER_WHERE,
        ...(args.query ? { name: { contains: String(args.query) } } : {}),
        ...(args.status ? { status: String(args.status) } : {}),
        ...(args.country ? { country: { contains: String(args.country) } } : {}),
      },
      include: { partner: { select: { name: true } }, owner: { select: { name: true } } },
      take: 50,
      orderBy: { name: "asc" },
    });
    if (!customers.length) return "No customers match the criteria";
    return customers
      .map(
        (c) =>
          `[id:${c.id}] ${c.name} | ${c.status} | ${c.country ?? "?"} | Industry:${c.industry ?? "-"} | Partner:${c.partner?.name ?? "-"} | Owner:${c.owner?.name ?? "-"}`
      )
      .join("\n");
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

// ---- Read customer profile ----
const getCustomer: Skill = {
  name: "get_customer",
  label: "Read customer profile",
  desc: "Get end-customer account profile (contacts, opportunities, open todos)",
  def: {
    type: "function",
    function: {
      name: "get_customer",
      description:
        "Get an end-customer (account) profile by name — includes contacts (power map), active opportunities, and open todos. NOT a Fanruan partner.",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "Customer company name (fuzzy match supported)" } },
        required: ["name"],
      },
    },
  },
  run: async (args) => {
    const c = await findCustomerByName(String(args.name));
    if (!c) return `No customer found matching "${args.name}"`;
    return await customerContext(c.id);
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

// ---- Update customer profile ----
const updateCustomer: Skill = {
  name: "update_customer",
  label: "Update customer profile",
  desc: "Edit end-customer account fields. Applied directly in assistant chat.",
  def: {
    type: "function",
    function: {
      name: "update_customer",
      description: `Update end-customer (account) profile fields. Available fields: ${Object.entries(CUSTOMER_FIELD_LABELS)
        .filter(([f]) => f !== "name")
        .map(([f, l]) => `${f}(${l})`)
        .join(", ")}.`,
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer company name" },
          fields: { type: "object", description: 'Field key-value pairs, e.g. {"industry": "Banking", "status": "ACTIVE"}' },
        },
        required: ["name", "fields"],
      },
    },
  },
  run: async (args, ctx) => {
    const c = await findCustomerByName(String(args.name));
    if (!c) return `No customer found matching "${args.name}"`;
    const fields = (args.fields ?? {}) as Record<string, unknown>;

    const data: Record<string, unknown> = {};
    const changes: string[] = [];
    for (const [k, v] of Object.entries(fields)) {
      if (!(k in CUSTOMER_FIELD_LABELS) || k === "name") continue;
      const parsed = customerFieldValueFromText(k, String(v));
      if (parsed === undefined) continue;
      data[k] = parsed;
      changes.push(`${CUSTOMER_FIELD_LABELS[k]} → ${parsed}`);
    }
    if (!changes.length) return "No valid fields to update";

    if (ctx.mode === "agent") {
      return `Customer profile updates (${changes.join("; ")}) require assistant mode — not applied in agent run.`;
    }

    await db.customer.update({ where: { id: c.id }, data });
    await db.timelineEvent.create({
      data: {
        customerId: c.id,
        type: "CHANGE",
        title: "AI assistant customer profile update",
        content: changes.join("; "),
        createdById: ctx.userId,
        meta: JSON.stringify({ via: "assistant", fields }),
      },
    });
    const msg = `Updated customer ${c.name}: ${changes.join("; ")}`;
    ctx.actions.push(msg);
    return msg;
  },
};

// ---- Create todo ----
const createTodo: Skill = {
  name: "create_todo",
  label: "Create todo",
  desc: "Create a todo item, optionally linked to a partner or end-customer with a due date",
  def: {
    type: "function",
    function: {
      name: "create_todo",
      description:
        "Create a todo item. Link to an end-customer via customerName/customerId, or to a partner via partnerName/partnerId. Optionally attach to a specific deal (opportunityId) or delivery project (projectId) of that customer — get ids from list_opportunities / list_projects. Customer and partner are different entities.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          partnerName: { type: "string", description: "Linked Fanruan partner company name (optional)" },
          partnerId: { type: "string", description: "Exact partner id (optional)" },
          customerName: { type: "string", description: "Linked end-customer / account company name (optional)" },
          customerId: { type: "string", description: "Exact customer id (optional)" },
          opportunityId: { type: "string", description: "Attach to this deal/opportunity id (optional)" },
          projectId: { type: "string", description: "Attach to this delivery project id (optional)" },
          dueDate: { type: "string", description: "Due date YYYY-MM-DD (optional)" },
          priority: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
          detail: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  run: async (args, ctx) => {
    const resolved = await resolveOwnerLink(args);
    let partnerId = resolved.partnerId;
    let customerId = resolved.customerId;
    let ownerLabel = resolved.ownerLabel;
    const opportunityId = args.opportunityId ? String(args.opportunityId).trim() : null;
    const projectId = args.projectId ? String(args.projectId).trim() : null;
    // 挂到项目/机会时回填其所属客户/伙伴
    if (projectId && !customerId) {
      const proj = await db.project.findUnique({ where: { id: projectId }, select: { customerId: true, partnerId: true, name: true } });
      if (proj) {
        customerId = proj.customerId;
        partnerId = partnerId || proj.partnerId;
        ownerLabel = ownerLabel ?? proj.name;
      }
    } else if (opportunityId && !customerId && !partnerId) {
      const opp = await db.opportunity.findUnique({ where: { id: opportunityId }, select: { customerId: true, partnerId: true, name: true } });
      if (opp) {
        customerId = opp.customerId ?? null;
        partnerId = opp.partnerId ?? null;
        ownerLabel = ownerLabel ?? opp.name;
      }
    }
    const t = await db.todoItem.create({
      data: {
        title: String(args.title),
        detail: args.detail ? String(args.detail) : ctx.agentName ? `Created by Agent "${ctx.agentName}"` : null,
        partnerId,
        customerId,
        opportunityId,
        projectId,
        assigneeId: ctx.userId,
        dueDate: args.dueDate ? new Date(String(args.dueDate)) : null,
        priority: ["HIGH", "MEDIUM", "LOW"].includes(String(args.priority)) ? String(args.priority) : "MEDIUM",
        source: "AI",
      },
    });
    const owner = customerId ? `customer ${ownerLabel ?? customerId}` : partnerId ? `partner ${ownerLabel ?? partnerId}` : "unlinked";
    const linkNote = projectId ? ` · project` : opportunityId ? ` · deal` : "";
    const msg = `Created todo: ${t.title}${t.dueDate ? ` (due ${t.dueDate.toISOString().slice(0, 10)})` : ""} · ${owner}${linkNote}`;
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
      description:
        "List open todo items. Filter by assignee (Hub user name), partner OR end-customer (account), overdue only, or due within N days. Customers and partners are different — use customerName/customerId for 客户待办. When user asks for someone's todos (e.g. jackie的待办), use assigneeName — NOT partnerName.",
      parameters: {
        type: "object",
        properties: {
          assigneeName: {
            type: "string",
            description: "Filter by assignee / 负责人 Hub user name (fuzzy match, e.g. Jackie, areeb)",
          },
          assigneeUserId: {
            type: "string",
            description: "Filter by exact Hub user id (use for「我的待办」= current operator userId)",
          },
          overdueOnly: { type: "boolean", description: "Overdue only (due before today)" },
          dueWithinDays: {
            type: "number",
            description: "Include todos due from today through N calendar days ahead (e.g. 3 = today + next 2 days)",
          },
          partnerName: { type: "string", description: "Filter by Fanruan partner company name (contains)" },
          partnerId: { type: "string", description: "Filter by exact partner id" },
          customerName: { type: "string", description: "Filter by end-customer / account company name (contains)" },
          customerId: { type: "string", description: "Filter by exact customer id" },
        },
      },
    },
  },
  run: async (args) => {
    const dueWindow = args.dueWithinDays != null ? dueWithinDaysRange(Number(args.dueWithinDays)) : null;
    const { partnerId, customerId } = await resolveOwnerFilter(args);
    let assigneeId: string | undefined;
    if (args.assigneeUserId != null && String(args.assigneeUserId).trim()) {
      assigneeId = String(args.assigneeUserId).trim();
    }
    if (args.assigneeName != null && String(args.assigneeName).trim()) {
      const u = await findUserByName(String(args.assigneeName));
      if (!u) return `No user found matching assignee "${String(args.assigneeName).trim()}"`;
      assigneeId = u.id;
    }
    const todos = await db.todoItem.findMany({
      where: {
        status: "OPEN",
        ...(args.overdueOnly ? { dueDate: { lt: overdueDueDateBefore() } } : {}),
        ...(dueWindow && !args.overdueOnly ? { dueDate: dueWindow } : {}),
        ...(assigneeId ? { assigneeId } : {}),
        ...(partnerId ? { partnerId } : {}),
        ...(customerId ? { customerId } : {}),
        ...(args.partnerName && !partnerId && !customerId
          ? { partner: { name: { contains: String(args.partnerName) } } }
          : {}),
        ...(args.customerName && !customerId && !partnerId
          ? { customer: { name: { contains: String(args.customerName) }, ...END_CUSTOMER_WHERE } }
          : {}),
      },
      include: { partner: true, customer: true, assignee: true, opportunity: { select: { name: true } }, project: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 50,
    });
    return todos.length
      ? todos
          .map(
            (t) =>
              `[id:${t.id}] ${t.title} | Partner:${t.partner?.name ?? "-"} | Customer:${t.customer?.name ?? "-"}${t.project ? ` | Project:${t.project.name}` : t.opportunity ? ` | Deal:${t.opportunity.name}` : ""} | Due:${t.dueDate?.toISOString().slice(0, 10) ?? "-"} | Assignee:${t.assignee?.name ?? "-"}`
          )
          .join("\n")
      : "No open todos";
  },
};

// ---- Update todo ----
const updateTodo: Skill = {
  name: "update_todo",
  label: "Update todo",
  desc: "Update an existing todo (assignee, due date, title, priority, detail)",
  def: {
    type: "function",
    function: {
      name: "update_todo",
      description: "Update fields on an existing todo item by todoId.",
      parameters: {
        type: "object",
        properties: {
          todoId: { type: "string", description: "Todo item id" },
          title: { type: "string" },
          detail: { type: "string" },
          assigneeName: { type: "string", description: "Assignee name (fuzzy match)" },
          dueDate: { type: "string", description: "Due date YYYY-MM-DD or empty to clear" },
          priority: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
          status: { type: "string", enum: ["OPEN", "DONE", "CANCELLED"] },
          opportunityId: { type: "string", description: "Attach to this deal id, or empty string to detach" },
          projectId: { type: "string", description: "Attach to this delivery project id, or empty string to detach" },
        },
        required: ["todoId"],
      },
    },
  },
  run: async (args, ctx) => {
    const todoId = String(args.todoId ?? "");
    const existing = await db.todoItem.findUnique({
      where: { id: todoId },
      include: { assignee: true, partner: true, customer: true },
    });
    if (!existing) return `Todo not found: ${todoId}`;

    const data: Record<string, unknown> = {};
    const changes: string[] = [];
    if (args.title != null) {
      data.title = String(args.title);
      changes.push(`title → ${data.title}`);
    }
    if (args.detail != null) {
      data.detail = String(args.detail) || null;
      changes.push(`detail updated`);
    }
    if (args.priority != null && ["HIGH", "MEDIUM", "LOW"].includes(String(args.priority))) {
      data.priority = String(args.priority);
      changes.push(`priority → ${data.priority}`);
    }
    if (args.status != null && ["OPEN", "DONE", "CANCELLED"].includes(String(args.status))) {
      data.status = String(args.status);
      if (data.status === "DONE") data.doneAt = new Date();
      changes.push(`status → ${data.status}`);
    }
    if (args.dueDate !== undefined) {
      const d = String(args.dueDate ?? "").trim();
      data.dueDate = d ? new Date(d) : null;
      changes.push(`due → ${d || "(cleared)"}`);
    }
    if (args.assigneeName != null) {
      const u = await findUserByName(String(args.assigneeName));
      if (!u) return `No user found matching assignee "${args.assigneeName}"`;
      data.assigneeId = u.id;
      changes.push(`assignee → ${u.name ?? u.email}`);
    }
    if (args.projectId !== undefined) {
      const pid = String(args.projectId ?? "").trim();
      data.projectId = pid || null;
      if (pid) data.opportunityId = null;
      changes.push(`project → ${pid || "(cleared)"}`);
    }
    if (args.opportunityId !== undefined) {
      const oid = String(args.opportunityId ?? "").trim();
      data.opportunityId = oid || null;
      if (oid) data.projectId = null;
      changes.push(`deal → ${oid || "(cleared)"}`);
    }
    if (!changes.length) return "No fields to update";

    await db.todoItem.update({ where: { id: todoId }, data });
    const msg = `Updated todo「${existing.title}」: ${changes.join("; ")}`;
    ctx.actions.push(msg);
    return msg;
  },
};

// ---- List opportunities ----
const listOpportunities: Skill = {
  name: "list_opportunities",
  label: "List opportunities",
  desc: "List sales opportunities for a partner",
  def: {
    type: "function",
    function: {
      name: "list_opportunities",
      description:
        "List opportunities. Filter by end-customer (account) OR partner. Customers and partners are different entities.",
      parameters: {
        type: "object",
        properties: {
          partnerName: { type: "string", description: "Filter by Fanruan partner company name" },
          partnerId: { type: "string", description: "Filter by exact partner id" },
          customerName: { type: "string", description: "Filter by end-customer / account company name" },
          customerId: { type: "string", description: "Filter by exact customer id" },
          status: { type: "string", enum: ["ACTIVE", "WON", "LOST", "PAUSED"] },
          dealType: { type: "string", enum: ["PROJECT", "PRODUCT"], description: "Filter by deal type: PROJECT=有交付项目 / PRODUCT=纯产品" },
        },
      },
    },
  },
  run: async (args) => {
    const { partnerId, customerId } = await resolveOwnerFilter(args);
    const rows = await db.opportunity.findMany({
      where: {
        ...(partnerId ? { partnerId } : {}),
        ...(customerId ? { customerId } : {}),
        ...(args.partnerName && !partnerId && !customerId
          ? { partner: { name: { contains: String(args.partnerName) } } }
          : {}),
        ...(args.customerName && !customerId && !partnerId
          ? { customer: { name: { contains: String(args.customerName) }, ...END_CUSTOMER_WHERE } }
          : {}),
        ...(args.status ? { status: String(args.status) } : {}),
        ...(args.dealType && ["PROJECT", "PRODUCT"].includes(String(args.dealType)) ? { dealType: String(args.dealType) } : {}),
      },
      include: { partner: true, customer: true, project: { select: { id: true } } },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });
    return rows.length
      ? rows
          .map(
            (o) =>
              `[id:${o.id}] ${o.name} | Customer:${o.customer?.name ?? "-"} | Partner:${o.partner?.name ?? "-"} | Stage:${o.stage} | Amount:${o.amount ?? "-"} | Status:${o.status} | DealType:${o.dealType ?? "-"}${o.project ? " | Converted→Project" : ""}`
          )
          .join("\n")
      : "No opportunities found";
  },
};

// ---- Update opportunity ----
const updateOpportunity: Skill = {
  name: "update_opportunity",
  label: "Update opportunity",
  desc: "Update an existing opportunity",
  def: {
    type: "function",
    function: {
      name: "update_opportunity",
      description: "Update fields on an existing opportunity by opportunityId.",
      parameters: {
        type: "object",
        properties: {
          opportunityId: { type: "string" },
          name: { type: "string" },
          client: { type: "string" },
          amount: { type: "string" },
          stage: { type: "string" },
          nextStep: { type: "string" },
          status: { type: "string", enum: ["ACTIVE", "WON", "LOST", "PAUSED"] },
          dealType: { type: "string", enum: ["PROJECT", "PRODUCT"], description: "PROJECT=有交付项目 / PRODUCT=纯产品成交" },
          notes: { type: "string" },
        },
        required: ["opportunityId"],
      },
    },
  },
  run: async (args, ctx) => {
    const id = String(args.opportunityId ?? "");
    const existing = await db.opportunity.findUnique({ where: { id }, include: { partner: true } });
    if (!existing) return `Opportunity not found: ${id}`;

    const data: Record<string, unknown> = {};
    const changes: string[] = [];
    for (const key of ["name", "client", "amount", "stage", "nextStep", "status", "notes"] as const) {
      if (args[key] != null) {
        data[key] = String(args[key]);
        changes.push(`${key} → ${data[key]}`);
      }
    }
    if (args.dealType != null && ["PROJECT", "PRODUCT"].includes(String(args.dealType))) {
      data.dealType = String(args.dealType);
      changes.push(`dealType → ${data.dealType}`);
    }
    if (!changes.length) return "No fields to update";

    await db.opportunity.update({ where: { id }, data });
    const msg = `Updated opportunity「${existing.name}」: ${changes.join("; ")}`;
    ctx.actions.push(msg);
    return msg;
  },
};

// ---- List projects ----
const listProjects: Skill = {
  name: "list_projects",
  label: "List projects",
  desc: "List delivery/collaboration projects (converted from won deals) with progress",
  def: {
    type: "function",
    function: {
      name: "list_projects",
      description:
        "List delivery/collaboration projects (合作项目, created when a deal is won and converted). Projects belong to an end-customer; a partner may be the delivery partner. Returns phase, status and todo progress. Filter by customer, partner, status, or phase.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string", description: "Filter by end-customer / account company name" },
          customerId: { type: "string", description: "Filter by exact customer id" },
          partnerName: { type: "string", description: "Filter by delivery partner company name" },
          partnerId: { type: "string", description: "Filter by exact partner id" },
          status: { type: "string", enum: ["ACTIVE", "ON_HOLD", "DONE", "CLOSED"] },
          phase: { type: "string", enum: ["KICKOFF", "IMPLEMENT", "ACCEPTANCE", "GOLIVE", "MAINTENANCE"] },
        },
      },
    },
  },
  run: async (args) => {
    const { partnerId, customerId } = await resolveOwnerFilter(args);
    const rows = await db.project.findMany({
      where: {
        ...(customerId ? { customerId } : {}),
        ...(partnerId ? { partnerId } : {}),
        ...(args.customerName && !customerId
          ? { customer: { name: { contains: String(args.customerName) }, ...END_CUSTOMER_WHERE } }
          : {}),
        ...(args.partnerName && !partnerId
          ? { partner: { name: { contains: String(args.partnerName) } } }
          : {}),
        ...(args.status && ["ACTIVE", "ON_HOLD", "DONE", "CLOSED"].includes(String(args.status)) ? { status: String(args.status) } : {}),
        ...(args.phase && ["KICKOFF", "IMPLEMENT", "ACCEPTANCE", "GOLIVE", "MAINTENANCE"].includes(String(args.phase)) ? { phase: String(args.phase) } : {}),
      },
      include: { customer: true, partner: true, todos: { select: { status: true } } },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });
    return rows.length
      ? rows
          .map((p) => {
            const done = p.todos.filter((t) => t.status === "DONE").length;
            return `[id:${p.id}] ${p.name} | Customer:${p.customer?.name ?? "-"} | DeliveryPartner:${p.partner?.name ?? "-"} | Phase:${p.phase} | Status:${p.status} | Progress:${done}/${p.todos.length}`;
          })
          .join("\n")
      : "No projects found";
  },
};

// ---- List business records ----
const listBusinessRecords: Skill = {
  name: "list_business_records",
  label: "List business records",
  desc: "List recent business records for a partner",
  def: {
    type: "function",
    function: {
      name: "list_business_records",
      description:
        "List business records (visits, meetings, follow-ups). Filter by end-customer (account) OR partner.",
      parameters: {
        type: "object",
        properties: {
          partnerName: { type: "string", description: "Filter by Fanruan partner company name" },
          partnerId: { type: "string", description: "Filter by exact partner id" },
          customerName: { type: "string", description: "Filter by end-customer / account company name" },
          customerId: { type: "string", description: "Filter by exact customer id" },
          limit: { type: "number" },
        },
      },
    },
  },
  run: async (args) => {
    const { partnerId, customerId } = await resolveOwnerFilter(args);
    const rows = await db.businessRecord.findMany({
      where: {
        ...(partnerId ? { partnerId } : {}),
        ...(customerId ? { customerId } : {}),
        ...(args.partnerName && !partnerId && !customerId
          ? { partner: { name: { contains: String(args.partnerName) } } }
          : {}),
        ...(args.customerName && !customerId && !partnerId
          ? { customer: { name: { contains: String(args.customerName) }, ...END_CUSTOMER_WHERE } }
          : {}),
      },
      include: { partner: true, customer: true },
      orderBy: { occurredAt: "desc" },
      take: Math.min(Number(args.limit) || 20, 50),
    });
    return rows.length
      ? rows
          .map(
            (r) =>
              `[id:${r.id}] ${r.title} | Customer:${r.customer?.name ?? "-"} | Partner:${r.partner?.name ?? "-"} | ${r.category} | ${r.occurredAt.toISOString().slice(0, 10)}`
          )
          .join("\n")
      : "No business records found";
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
  label: "Add timeline event",
  desc: "Record external signals/news on a partner or customer timeline (applied directly, audited)",
  def: {
    type: "function",
    function: {
      name: "add_timeline_event",
      description:
        "Add a discovered signal/news item to a partner or end-customer timeline. Provide partnerName OR customerName (not both unless intentional).",
      parameters: {
        type: "object",
        properties: {
          partnerName: { type: "string", description: "Fanruan partner company name" },
          partnerId: { type: "string", description: "Exact partner id" },
          customerName: { type: "string", description: "End-customer / account company name" },
          customerId: { type: "string", description: "Exact customer id" },
          title: { type: "string", description: "Event title (one line)" },
          content: { type: "string", description: "Details (include source URL)" },
        },
        required: ["title"],
      },
    },
  },
  run: async (args, ctx) => {
    const { partnerId, customerId, ownerLabel } = await resolveOwnerLink(args);
    if (!partnerId && !customerId) {
      return "Must specify partnerName/partnerId or customerName/customerId for timeline event";
    }
    await db.timelineEvent.create({
      data: {
        partnerId,
        customerId,
        type: "NEWS",
        title: String(args.title),
        content: args.content ? String(args.content) : null,
        createdById: ctx.userId,
        meta: JSON.stringify({ via: ctx.mode, agentId: ctx.agentId, agentName: ctx.agentName }),
      },
    });
    const msg = `Added to ${ownerLabel ?? "record"} timeline: ${args.title}`;
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

// ---- Search Fanruan Know-how knowledge base ----
const searchKnowhow: Skill = {
  name: "search_knowhow",
  label: "Search Know-how",
  desc: "Semantic search in the Fanruan Know-how knowledge base — cases, solutions, collateral, industry materials",
  def: {
    type: "function",
    function: {
      name: "search_knowhow",
      description:
        "Search the Fanruan Know-how knowledge base (semantic retrieval + metadata filters). Use for customer cases, solution materials, marketing collateral, industry references, and project/contract documents. Requires team Know-how API token in Team Settings.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural-language search query, e.g. retail success cases in South China" },
          business_domain: {
            type: "string",
            enum: ["project", "contract"],
            description: "Business domain filter, default project",
          },
          tags: {
            type: "string",
            description: "Tag filter, comma-separated (资料类型/业务维度/业务系统/终端/项目需求场景)",
          },
          quality: { type: "string", description: "Content quality filter, e.g. curated selection" },
          node_path: { type: "string", description: "Folder path filter, comma-separated, e.g. marketing collateral" },
          industry: { type: "string", description: "Industry filter, comma-separated" },
          author: { type: "string", description: "Author filter (exact match)" },
          customer: { type: "string", description: "Customer name filter (exact match)" },
          top_k: { type: "number", description: "Max results, default 10, max 50" },
        },
        required: ["query"],
      },
    },
  },
  run: async (args) => searchKnowhowForAgent(args),
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

// ---- Push to WeCom group ----
const pushWecom: Skill = {
  name: "push_wecom",
  label: "Push to WeCom group",
  desc: "Enqueue a Markdown message to a WeCom group chatId (chat must be registered by the bot)",
  def: {
    type: "function",
    function: {
      name: "push_wecom",
      description:
        "Push a Markdown message to a WeCom group. Requires chatId from get_partner (WeCom group line) or list_wecom_chats. The chat must exist in the system (bot has seen the group).",
      parameters: {
        type: "object",
        properties: {
          chatId: { type: "string", description: "WeCom group chat ID" },
          content: { type: "string", description: "Markdown message body" },
        },
        required: ["chatId", "content"],
      },
    },
  },
  run: async (args, ctx) => {
    const chatId = String(args.chatId ?? "").trim();
    const content = String(args.content ?? "").trim();
    if (!chatId) return "Please provide chatId";
    if (!content) return "Please provide content";
    const chat = await getWecomChatByChatId(chatId);
    if (!chat) {
      return `Chat ID "${chatId}" is not registered. @ the bot in the group first, or bind the chat on the partner page.`;
    }
    const job = await enqueueWecomPush(chatId, content);
    const msg = `WeCom push queued (job ${job.id}); delivers within seconds if the bot is connected.`;
    ctx.actions.push(msg);
    return msg;
  },
};

// ---- List WeCom chats ----
const listWecomChatsTool: Skill = {
  name: "list_wecom_chats",
  label: "List WeCom chats",
  desc: "List registered WeCom group/single chats and partner bindings",
  def: {
    type: "function",
    function: {
      name: "list_wecom_chats",
      description:
        "List WeCom chats the bot has seen. Use to find chatId before push_wecom, or check whether a partner has a bound group (prefer get_partner for a single partner).",
      parameters: {
        type: "object",
        properties: {
          partnerName: { type: "string", description: "If set, return binding for this partner only" },
          unboundOnly: { type: "boolean", description: "If true, only chats not linked to a partner" },
        },
      },
    },
  },
  run: async (args) => {
    if (args.partnerName) {
      const p = await findPartnerByName(String(args.partnerName));
      if (!p) return `No partner found matching "${args.partnerName}"`;
      const chats = await listWecomChats();
      const bound = chats.find((c) => c.partnerId === p.id);
      if (bound) {
        return `Partner ${p.name}: chatId=${bound.chatId}${bound.label ? ` label=${bound.label}` : ""}`;
      }
      return `Partner ${p.name}: WeCom group not bound. Use list_wecom_chats with unboundOnly=true to see available groups, or bind on the partner page.`;
    }
    let chats = await listWecomChats();
    if (args.unboundOnly === true) chats = chats.filter((c) => !c.partnerId);
    if (!chats.length) {
      return args.unboundOnly
        ? "No unbound WeCom chats registered. @ the bot in a group first."
        : "No WeCom chats registered yet. @ the bot in a group or single chat first.";
    }
    return chats
      .map(
        (c, i) =>
          `${i + 1}. chatId=${c.chatId} | ${c.chatType} | label=${c.label ?? "—"} | partner=${c.partnerName ?? "unbound"}`,
      )
      .join("\n");
  },
};

// ---- Send WeCom app message (self-built application → individual users) ----
const sendWecomAppTool: Skill = {
  name: "send_wecom_app",
  label: "Send WeCom app message",
  desc: "Send a self-built WeCom application message to individual user(s) via userid",
  def: {
    type: "function",
    function: {
      name: "send_wecom_app",
      description:
        "Send a WeCom self-built application message to one or more users. Use title + useTextcard for a clickable card (recommended for reminders). guideToBot=true (default) opens mobile workbench (/mobile via OAuth). Requires WECOM_CORP_ID, WECOM_APP_SECRET, WECOM_AGENT_ID.",
      parameters: {
        type: "object",
        properties: {
          wecomUserId: {
            type: "string",
            description: "WeCom userid(s), comma-separated. Copy from Account → Identity bindings.",
          },
          hubUserId: {
            type: "string",
            description: "Partner Hub user id(s), comma-separated. Resolves to bound wecomUserId.",
          },
          hubUserName: {
            type: "string",
            description: "Partner Hub display name(s), comma-separated exact match. Resolves to bound wecomUserId.",
          },
          title: {
            type: "string",
            description: "textcard title (also enables card mode). Example: 你有 2 条待办已逾期",
          },
          content: { type: "string", description: "Body text, or textcard description when title is set" },
          useTextcard: {
            type: "boolean",
            description: "Send as clickable textcard (recommended for notifications with a button)",
          },
          url: {
            type: "string",
            description: "textcard jump URL (https). Default: mobile workbench OAuth when guideToBot=true",
          },
          btntxt: {
            type: "string",
            description: "textcard button label (max 4 Chinese chars). Default: 和 AI 对话",
          },
          guideToBot: {
            type: "boolean",
            description: "Append bot / mobile AI guide and default click URL (default true)",
          },
          msgtype: {
            type: "string",
            enum: ["text", "markdown", "textcard"],
            description: "Message type; textcard or title enables clickable card",
          },
        },
        required: ["content"],
      },
    },
  },
  run: async (args, ctx) => {
    const { runSendWecomAppMessageTool } = await import("./skill-actions/send-wecom-app-message");
    return runSendWecomAppMessageTool(args, ctx);
  },
};

// ---- Send email ----
const sendEmailTool: Skill = {
  name: "send_email",
  label: "Send email",
  desc: "Send an email via team SMTP (QQ mailbox). Agent supplies recipient, subject, and body.",
  def: {
    type: "function",
    function: {
      name: "send_email",
      description:
        "Send an email through the team-configured SMTP service (Settings → Email). Provide recipient address(es), subject, and body. Comma-separated to for multiple recipients.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email(s), comma-separated if multiple" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Plain-text email body" },
          html: { type: "string", description: "Optional HTML body (uses body as fallback if omitted)" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  run: async (args, ctx) => {
    const { runSendEmailTool } = await import("./skill-actions/send-email");
    return runSendEmailTool(args, ctx);
  },
};

// ============ Registry ============

export const SKILLS: Skill[] = [
  searchPartners,
  searchCustomers,
  getPartner,
  getCustomer,
  updatePartner,
  updateCustomer,
  createTodo,
  updateTodo,
  listTodos,
  listOpportunities,
  updateOpportunity,
  listProjects,
  listBusinessRecords,
  linkedinSearchTool,
  webSearch,
  scanSentiment,
  addTimelineEvent,
  searchKnowledge,
  searchKnowhow,
  readKms,
  writeKms,
  pushWecom,
  listWecomChatsTool,
  sendWecomAppTool,
  sendEmailTool,
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
  "search_knowhow",
  "read_kms",
  "write_kms",
];

export { DEFAULT_AUTOMATION_SKILLS } from "./automation-push";

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
  "search_customers",
  "get_partner",
  "get_customer",
  "update_partner",
  "update_customer",
  "create_todo",
  "update_todo",
  "list_todos",
  "list_opportunities",
  "update_opportunity",
  "list_projects",
  "list_business_records",
  "linkedin_search",
  "web_search",
  "read_kms",
  "write_kms",
  "search_knowledge",
  "search_knowhow",
];

/** Read-only research tools for AI intake/profile enrichment (no write operations) */
export const INTAKE_ENRICHMENT_SKILLS = [
  "search_partners",
  "get_partner",
  "web_search",
  "linkedin_search",
  "read_kms",
  "search_knowledge",
  "search_knowhow",
] as const;

export function intakeEnrichmentSkillsForScope(scope: string): string[] {
  switch (scope) {
    case "new_partner":
    case "profile":
    case "new_customer":
    case "customer_profile":
      return [...INTAKE_ENRICHMENT_SKILLS];
    case "powermap":
      // Extract from user text/images only, no web research
      return [];
    case "opportunity":
      // Structured field extraction only — skip web search for speed
      return [];
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
