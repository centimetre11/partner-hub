import { db } from "./db";
import type { ToolDef } from "./ai";
import { PARTNER_FIELD_LABELS, stageName } from "./constants";
import { partnerContext, type FieldUpdate } from "./proposals";
import { computeCompleteness, staleDays } from "./completeness";

// ============ 技能执行上下文 ============

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
  // agent 模式下收集的「待人工确认」提案
  pendingProposals: AgentFieldProposal[];
  // 写操作记录（用于汇报）
  actions: string[];
};

export function newSkillContext(partial: Partial<SkillContext> & Pick<SkillContext, "mode">): SkillContext {
  return { userId: null, pendingProposals: [], actions: [], ...partial };
}

// ============ 技能定义 ============

export type Skill = {
  name: string;
  label: string; // 中文名（UI 展示）
  desc: string; // 中文说明（UI 展示）
  def: ToolDef;
  run: (args: Record<string, unknown>, ctx: SkillContext) => Promise<string>;
};

async function findPartnerByName(name: string) {
  return (
    (await db.partner.findFirst({ where: { name: { equals: name } } })) ??
    (await db.partner.findFirst({ where: { name: { contains: name } } }))
  );
}

// ---- 查伙伴 ----
const searchPartners: Skill = {
  name: "search_partners",
  label: "查询伙伴列表",
  desc: "按名称/状态/Tier/国家/停滞天数筛选伙伴",
  def: {
    type: "function",
    function: {
      name: "search_partners",
      description: "搜索/筛选伙伴列表。返回伙伴的基本信息、Pipeline阶段、完整度、停滞天数。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "公司名关键词（可选）" },
          status: { type: "string", enum: ["PROSPECT", "ACTIVE", "ARCHIVED"], description: "PROSPECT候选/ACTIVE正式" },
          tier: { type: "string", enum: ["A", "B", "C"] },
          country: { type: "string", description: "国家关键词，如 KSA、UAE" },
          staleDaysOver: { type: "number", description: "只返回超过N天无动态的伙伴" },
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
        return `${p.name} | ${p.status === "ACTIVE" ? "正式" : p.status === "PROSPECT" ? "候选" : "归档"} | Tier ${p.tier ?? "-"} | ${p.country ?? "?"} | 阶段${p.pipelineStage}(${stageName(p.pipelineStage)}) | 完整度${c.score}% | ${stale}天无动态 | 负责人:${p.owner?.name ?? "无"} | 客户:${(p.knownClients ?? "").slice(0, 50)}`;
      })
      .filter(Boolean);
    return rows.length ? rows.join("\n") : "没有符合条件的伙伴";
  },
};

// ---- 读档案 ----
const getPartner: Skill = {
  name: "get_partner",
  label: "读取伙伴档案",
  desc: "获取某个伙伴的完整档案（画像、权力地图、商机）",
  def: {
    type: "function",
    function: {
      name: "get_partner",
      description: "按名称获取某个伙伴的完整档案（画像、权力地图、商机）。",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "公司名（支持模糊匹配）" } },
        required: ["name"],
      },
    },
  },
  run: async (args) => {
    const p = await findPartnerByName(String(args.name));
    if (!p) return `找不到名为「${args.name}」的伙伴`;
    return await partnerContext(p.id);
  },
};

// ---- 改档案 ----
const updatePartner: Skill = {
  name: "update_partner",
  label: "更新伙伴档案",
  desc: "修改伙伴字段。AI 助手对话中直接生效；Agent 自动运行时转为提案，需人工确认",
  def: {
    type: "function",
    function: {
      name: "update_partner",
      description: `更新伙伴档案字段。可用字段：${Object.entries(PARTNER_FIELD_LABELS).map(([f, l]) => `${f}(${l})`).join("、")}。pipelineStage 为 1-10 的数字。`,
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "公司名" },
          fields: { type: "object", description: "要更新的字段键值对，如 {\"pipelineStage\": 5, \"priority\": \"P0\"}" },
        },
        required: ["name", "fields"],
      },
    },
  },
  run: async (args, ctx) => {
    const p = await findPartnerByName(String(args.name));
    if (!p) return `找不到名为「${args.name}」的伙伴`;
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
    if (!updates.length) return "没有可更新的有效字段";

    if (ctx.mode === "agent") {
      // Agent 自动运行：不直接写，转为提案待人工确认
      ctx.pendingProposals.push({ partnerId: p.id, partnerName: p.name, fieldUpdates: updates });
      return `已生成 ${p.name} 的变更提案（${updates.map((u) => u.label).join("、")}），将提交人工确认后生效。`;
    }

    // 助手模式：用户明确指令，直接执行 + 审计
    const data: Record<string, unknown> = {};
    const changes: string[] = [];
    for (const u of updates) {
      if (u.field === "pipelineStage" || u.field === "fitScore") {
        const n = parseInt(u.newValue, 10);
        if (!Number.isNaN(n)) {
          data[u.field] = n;
          changes.push(`${u.label} → ${u.field === "pipelineStage" ? `${n}(${stageName(n)})` : n}`);
        }
      } else {
        data[u.field] = u.newValue;
        changes.push(`${u.label} → ${u.newValue}`);
      }
    }
    await db.partner.update({ where: { id: p.id }, data });
    await db.timelineEvent.create({
      data: {
        partnerId: p.id,
        type: "CHANGE",
        title: "AI 助手更新档案",
        content: changes.join("；"),
        createdById: ctx.userId,
        meta: JSON.stringify({ via: "assistant", fields }),
      },
    });
    const msg = `已更新 ${p.name}：${changes.join("；")}`;
    ctx.actions.push(msg);
    return msg;
  },
};

// ---- 建待办 ----
const createTodo: Skill = {
  name: "create_todo",
  label: "创建待办",
  desc: "创建待办事项，可关联伙伴、设截止日期",
  def: {
    type: "function",
    function: {
      name: "create_todo",
      description: "创建待办事项。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          partnerName: { type: "string", description: "关联的伙伴公司名（可选）" },
          dueDate: { type: "string", description: "截止日期 YYYY-MM-DD（可选）" },
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
        detail: args.detail ? String(args.detail) : ctx.agentName ? `由 Agent「${ctx.agentName}」创建` : null,
        partnerId,
        assigneeId: ctx.userId,
        dueDate: args.dueDate ? new Date(String(args.dueDate)) : null,
        priority: ["HIGH", "MEDIUM", "LOW"].includes(String(args.priority)) ? String(args.priority) : "MEDIUM",
        source: "AI",
      },
    });
    const msg = `已创建待办：${t.title}${t.dueDate ? `（截止 ${t.dueDate.toISOString().slice(0, 10)}）` : ""}`;
    ctx.actions.push(msg);
    return msg;
  },
};

// ---- 查待办 ----
const listTodos: Skill = {
  name: "list_todos",
  label: "查询待办",
  desc: "查看未完成/逾期待办列表",
  def: {
    type: "function",
    function: {
      name: "list_todos",
      description: "查看待办事项列表。",
      parameters: {
        type: "object",
        properties: {
          overdueOnly: { type: "boolean", description: "只看逾期的" },
          partnerName: { type: "string", description: "按伙伴筛选" },
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
              `[${t.priority}] ${t.title} | 伙伴:${t.partner?.name ?? "-"} | 截止:${t.dueDate?.toISOString().slice(0, 10) ?? "-"} | 负责:${t.assignee?.name ?? "-"}`
          )
          .join("\n")
      : "没有未完成的待办";
  },
};

// ---- 联网搜索 ----
async function tavilySearch(query: string, maxResults: number): Promise<string> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      max_results: maxResults,
      include_answer: true,
    }),
  });
  if (!res.ok) return `搜索失败（${res.status}）：${(await res.text()).slice(0, 200)}`;
  const data = await res.json();
  const items = (data.results ?? [])
    .map(
      (r: { title: string; url: string; content: string }, i: number) =>
        `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content?.slice(0, 300)}`
    )
    .join("\n");
  return [data.answer && `摘要：${data.answer}`, items].filter(Boolean).join("\n\n") || "没有搜索结果";
}

const webSearch: Skill = {
  name: "web_search",
  label: "联网搜索",
  desc: "搜索公开网络信息（公司动态、新闻、招聘、领英公开内容）。需配置 TAVILY_API_KEY 或使用 Kimi 内置搜索",
  def: {
    type: "function",
    function: {
      name: "web_search",
      description:
        "搜索互联网公开信息：公司新闻、人事变动、招聘信号、LinkedIn 公开动态等。query 建议带公司名+英文关键词，如 'Beinex Dubai news 2026' 或 'site:linkedin.com Beinex'。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词" },
          maxResults: { type: "number", description: "结果数量，默认5" },
        },
        required: ["query"],
      },
    },
  },
  run: async (args) => {
    if (!process.env.TAVILY_API_KEY) {
      return "未配置 TAVILY_API_KEY，无法使用独立搜索。（若使用 Kimi 模型，请改用内置 $web_search 工具，它会自动出现在工具列表中）";
    }
    return tavilySearch(String(args.query), Number(args.maxResults) || 5);
  },
};

// ---- 抓网页 ----
const fetchUrl: Skill = {
  name: "fetch_url",
  label: "读取网页",
  desc: "抓取指定 URL 的正文内容（深入阅读搜索结果）",
  def: {
    type: "function",
    function: {
      name: "fetch_url",
      description: "抓取网页正文文本（已去除HTML标签），用于深入阅读搜索到的页面。",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "完整 URL" } },
        required: ["url"],
      },
    },
  },
  run: async (args) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(String(args.url), {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PartnerHub/1.0)" },
      });
      clearTimeout(timer);
      if (!res.ok) return `抓取失败（${res.status}）`;
      const html = await res.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      return text.slice(0, 6000) || "页面无正文内容";
    } catch (e) {
      return `抓取失败：${e instanceof Error ? e.message : e}`;
    }
  },
};

// ---- 写时间线 ----
const addTimelineEvent: Skill = {
  name: "add_timeline_event",
  label: "写入伙伴时间线",
  desc: "把发现的外部动态/新闻记录到伙伴的动态时间线（直接生效，留审计）",
  def: {
    type: "function",
    function: {
      name: "add_timeline_event",
      description: "把一条发现的动态/新闻/信号写入某个伙伴的时间线档案。",
      parameters: {
        type: "object",
        properties: {
          partnerName: { type: "string", description: "伙伴公司名" },
          title: { type: "string", description: "动态标题（一句话）" },
          content: { type: "string", description: "动态详情（含信息来源URL）" },
        },
        required: ["partnerName", "title"],
      },
    },
  },
  run: async (args, ctx) => {
    const p = await findPartnerByName(String(args.partnerName));
    if (!p) return `找不到名为「${args.partnerName}」的伙伴`;
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
    const msg = `已写入 ${p.name} 时间线：${args.title}`;
    ctx.actions.push(msg);
    return msg;
  },
};

// ---- 检索知识库 ----
const searchKnowledge: Skill = {
  name: "search_knowledge",
  label: "检索知识库",
  desc: "搜索团队知识库（帆软背景、中东策略、产品能力等）供引用",
  def: {
    type: "function",
    function: {
      name: "search_knowledge",
      description: "在团队知识库中搜索与查询相关的文章片段，用于撰写简报或方案时引用准确背景信息。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词" },
          category: {
            type: "string",
            enum: ["COMPANY", "PRODUCT", "STRATEGY", "PLAYBOOK", "OTHER"],
            description: "可选分类过滤",
          },
        },
        required: ["query"],
      },
    },
  },
  run: async (args) => {
    const q = String(args.query ?? "").trim();
    if (!q) return "请提供搜索关键词";
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
    if (!articles.length) return `知识库中未找到与「${q}」相关的内容`;
    return articles
      .map((a, i) => `${i + 1}. 【${a.title}】(${a.category})\n${a.content.slice(0, 800)}${a.content.length > 800 ? "…" : ""}`)
      .join("\n\n---\n\n");
  },
};

// ---- 写入报告中心 ----
const createDocument: Skill = {
  name: "create_document",
  label: "写入报告中心",
  desc: "将 Markdown 报告保存到报告中心，可关联伙伴",
  def: {
    type: "function",
    function: {
      name: "create_document",
      description: "将完成的 Markdown 报告保存到报告中心。用于会前简报、联合解决方案报告等长期文档。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "报告标题" },
          content: { type: "string", description: "Markdown 正文" },
          type: {
            type: "string",
            enum: ["AGENT_BRIEF", "JOINT_SOLUTION", "MEETING_PREP", "CUSTOM"],
            description: "报告类型",
          },
          partnerName: { type: "string", description: "关联伙伴名（可选）" },
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
    const msg = `已写入报告中心：${doc.title}（/documents/${doc.id}）`;
    ctx.actions.push(msg);
    return msg;
  },
};

// ============ 注册表 ============

export const SKILLS: Skill[] = [
  searchPartners,
  getPartner,
  updatePartner,
  createTodo,
  listTodos,
  webSearch,
  fetchUrl,
  addTimelineEvent,
  searchKnowledge,
  createDocument,
];

export const SKILL_MAP = new Map(SKILLS.map((s) => [s.name, s]));

export const DEFAULT_AGENT_SKILLS = [
  "search_partners",
  "get_partner",
  "web_search",
  "fetch_url",
  "add_timeline_event",
  "create_todo",
  "search_knowledge",
];

export const REPORT_AGENT_KEYWORDS = ["会前简报", "联合方案", "联合解决方案"];

export const ASSISTANT_SKILLS = ["search_partners", "get_partner", "update_partner", "create_todo", "list_todos", "web_search", "fetch_url"];

// Kimi（moonshot）平台的内置联网搜索：作为特殊工具注入，工具被调用时原样回传参数即可
export const KIMI_BUILTIN_SEARCH = {
  type: "builtin_function" as const,
  function: { name: "$web_search" },
};

export function useKimiBuiltinSearch(): boolean {
  return !process.env.TAVILY_API_KEY && (process.env.AI_BASE_URL ?? "").includes("moonshot");
}

export function skillsToTools(names: string[]): ToolDef[] {
  return names.map((n) => SKILL_MAP.get(n)?.def).filter(Boolean) as ToolDef[];
}

export async function runSkill(name: string, args: Record<string, unknown>, ctx: SkillContext): Promise<string> {
  const skill = SKILL_MAP.get(name);
  if (!skill) return `未知工具：${name}`;
  try {
    return await skill.run(args, ctx);
  } catch (e) {
    return `工具 ${name} 执行出错：${e instanceof Error ? e.message : e}`;
  }
}
