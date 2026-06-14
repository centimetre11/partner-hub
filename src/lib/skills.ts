import { db } from "./db";
import type { ToolDef } from "./ai";
import { PARTNER_FIELD_LABELS, stageName } from "./constants";
import { partnerContext, type FieldUpdate } from "./proposals";
import { computeCompleteness, staleDays } from "./completeness";
import { generalWebSearch, linkedinSearch } from "./web-search";
import { readKmsForUser } from "./kms";

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

// ---- 领英搜索 ----
const linkedinSearchTool: Skill = {
  name: "linkedin_search",
  label: "领英搜索",
  desc: "搜索 LinkedIn 上的公司页、高管动态与公开职业信息（监测伙伴关键人）",
  def: {
    type: "function",
    function: {
      name: "linkedin_search",
      description:
        "搜索 LinkedIn 公开内容：公司主页、高管/profile、近期动态。用于监测伙伴 CEO/CTO 动向、人事变动、发帖。优先传 company + person。",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string", description: "公司名，如 Beinex、TechMantra" },
          person: { type: "string", description: "联系人姓名，如 Shantosh Sridhar" },
          topic: { type: "string", description: "附加关键词，如 hiring、partnership、Dubai" },
          query: { type: "string", description: "或直接写完整搜索词" },
          maxResults: { type: "number", description: "结果数，默认 5" },
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

// ---- 联网搜索 ----
const webSearch: Skill = {
  name: "web_search",
  label: "新闻搜索",
  desc: "搜索公开新闻、招聘、中标、竞品动态（非 LinkedIn 专用场景）",
  def: {
    type: "function",
    function: {
      name: "web_search",
      description:
        "搜索互联网公开信息：公司新闻、人事变动、招聘信号、中标公告、竞品动态。query 建议带公司名+英文关键词，如 'Beinex Dubai contract award 2026'。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词" },
          maxResults: { type: "number", description: "结果数量，默认 5" },
          topic: { type: "string", enum: ["general", "news"], description: "news=侧重新闻" },
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

// ---- 读取公司 KMS（Confluence）----
const readKms: Skill = {
  name: "read_kms",
  label: "读取 KMS 文档",
  desc: "读取帆软内部 Confluence（kms.fineres.com）文档，按 pageId/链接或关键词搜索",
  def: {
    type: "function",
    function: {
      name: "read_kms",
      description:
        "读取帆软 KMS（Confluence）内部文档。可用 pageId、完整 URL，或 query 关键词搜索。需要用户已在设置中配置个人访问令牌。优先用于查产品说明、内部策略、流程规范。",
      parameters: {
        type: "object",
        properties: {
          pageId: { type: "string", description: "KMS 页面 ID，如 1420741418" },
          url: { type: "string", description: "KMS 页面完整 URL" },
          query: { type: "string", description: "全文搜索关键词，如 FineBI 定价、伙伴政策" },
          limit: { type: "number", description: "搜索模式返回条数，默认 3" },
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
  linkedinSearchTool,
  webSearch,
  addTimelineEvent,
  searchKnowledge,
  readKms,
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
];

export const REPORT_AGENT_KEYWORDS = ["会前简报", "联合方案", "联合解决方案"];

export const ASSISTANT_SKILLS = [
  "search_partners",
  "get_partner",
  "update_partner",
  "create_todo",
  "list_todos",
  "linkedin_search",
  "web_search",
  "read_kms",
];

/** AI 建档/补全画像时可用的只读调研工具（不含写库操作） */
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
      return ["linkedin_search", "web_search"];
    case "opportunity":
      return ["web_search", "search_knowledge"];
    default:
      return [];
  }
}

export async function buildIntakeTools(skillNames: string[]): Promise<(ToolDef | Record<string, unknown>)[]> {
  const volcSearch = await shouldUseVolcengineBuiltinSearch();
  const names = volcSearch ? skillNames.filter((s) => s !== "web_search") : skillNames;
  const tools: (ToolDef | Record<string, unknown>)[] = skillsToTools(names);
  if (await shouldUseKimiBuiltinSearch()) tools.push(KIMI_BUILTIN_SEARCH);
  return tools;
}

// Kimi（moonshot）平台的内置联网搜索：作为特殊工具注入，工具被调用时原样回传参数即可
export const KIMI_BUILTIN_SEARCH = {
  type: "builtin_function" as const,
  function: { name: "$web_search" },
};

export async function shouldUseVolcengineBuiltinSearch(): Promise<boolean> {
  if (process.env.TAVILY_API_KEY) return false;
  const configured = await db.aiApiConfig.findFirst({
    where: { enabled: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { provider: true, extraConfig: true },
  });
  if (configured?.provider !== "volcengine") return false;
  try {
    const extra = JSON.parse(configured.extraConfig ?? "{}") as { tools?: Array<{ type?: string }> };
    return (extra.tools ?? []).some((t) => t.type === "web_search");
  } catch {
    return false;
  }
}

export async function shouldUseKimiBuiltinSearch(): Promise<boolean> {
  if (process.env.TAVILY_API_KEY) return false;
  if (await shouldUseVolcengineBuiltinSearch()) return false;
  const configured = await db.aiApiConfig.findFirst({
    where: { enabled: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { baseUrl: true },
  });
  return ((configured?.baseUrl ?? process.env.AI_BASE_URL) ?? "").includes("moonshot");
}

export async function shouldUseBuiltinWebSearch(): Promise<boolean> {
  return (await shouldUseVolcengineBuiltinSearch()) || (await shouldUseKimiBuiltinSearch());
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
