import type { Locale } from "./i18n/locale";

export type ToolCategoryId =
  | "partner"
  | "intel"
  | "kms"
  | "knowhow"
  | "todo"
  | "content"
  | "integration";

const TOOL_LABELS: Record<string, string> = {
  search_partners: "Search partners",
  search_customers: "Search customers",
  get_partner: "Read partner profile",
  get_customer: "Read customer profile",
  update_partner: "Update partner profile",
  update_customer: "Update customer profile",
  create_todo: "Create todo",
  update_todo: "Update todo",
  list_todos: "List todos",
  list_opportunities: "List opportunities",
  update_opportunity: "Update opportunity",
  list_business_records: "List business records",
  linkedin_search: "LinkedIn search",
  web_search: "News search",
  add_timeline_event: "Add timeline event",
  scan_sentiment: "Sentiment scan",
  search_knowledge: "Search knowledge base",
  search_knowhow: "Search Know-how",
  read_kms: "Read KMS documents",
  write_kms: "Write KMS documents",
  push_wecom: "Push to WeCom group",
  list_wecom_chats: "List WeCom chats",
  send_wecom_app: "Send WeCom app message",
  send_email: "Send email",
  $web_search: "News search",
};

const TOOL_LABELS_ZH: Record<string, string> = {
  search_partners: "搜索伙伴",
  search_customers: "搜索客户",
  get_partner: "读取伙伴档案",
  get_customer: "读取客户档案",
  update_partner: "更新伙伴档案",
  update_customer: "更新客户档案",
  create_todo: "创建待办",
  update_todo: "更新待办",
  list_todos: "查询待办",
  list_opportunities: "查询商机",
  update_opportunity: "更新商机",
  list_business_records: "查询商务记录",
  linkedin_search: "LinkedIn 搜索",
  web_search: "新闻搜索",
  add_timeline_event: "写入时间线",
  scan_sentiment: "舆情扫描",
  search_knowledge: "检索知识库",
  search_knowhow: "检索 Know-how",
  read_kms: "读取 KMS 文档",
  write_kms: "写入 KMS 文档",
  push_wecom: "推送到企微群",
  list_wecom_chats: "列出企微群",
  send_wecom_app: "发送企微应用消息",
  send_email: "发送邮件",
  $web_search: "新闻搜索",
};

const TOOL_DESCS: Record<string, string> = {
  search_partners: "Filter partners by name, status, tier, country, or stale days",
  search_customers: "Search end-customer (account) records by name, status, or country",
  get_partner: "Get full partner profile (persona, power map, opportunities)",
  get_customer: "Get end-customer profile (contacts, opportunities, open todos)",
  update_partner: "Edit partner fields. Applied directly in assistant chat; in agent runs becomes a proposal for human approval",
  update_customer: "Edit end-customer account fields. Applied directly in assistant chat",
  create_todo: "Create a todo item, optionally linked to a partner or end-customer with a due date",
  update_todo: "Update an existing todo (assignee, due date, title, priority, detail)",
  list_todos: "View open or overdue todo items (filter by partner or customer)",
  list_opportunities: "List sales opportunities for a partner or customer",
  update_opportunity: "Update an existing opportunity",
  list_business_records: "List recent business records for a partner or customer",
  linkedin_search: "Search LinkedIn company pages, executive activity, and public career info (monitor key contacts)",
  web_search: "Search public news, hiring, awards, competitor activity (non-LinkedIn scenarios)",
  add_timeline_event: "Record external signals/news on a partner or customer timeline (applied directly, audited)",
  scan_sentiment: "Run a web sentiment scan for a partner by dimension/sentiment, including custom monitor sources",
  search_knowledge: "Search team knowledge base (Fanruan background, Middle East strategy, product capabilities) for citations",
  search_knowhow: "Semantic search in the Fanruan Know-how knowledge base — cases, solutions, collateral, industry materials",
  read_kms: "Read Fanruan internal Confluence (kms.fineres.com) by pageId/URL or keyword search",
  write_kms: "Append, prepend, replace content on a KMS page, or create a child page (requires write permission)",
  push_wecom: "Enqueue a Markdown message to a WeCom group chatId (chat must be registered by the bot)",
  list_wecom_chats: "List registered WeCom group/single chats and partner bindings",
  send_wecom_app:
    "Send a self-built WeCom application message to individual user(s) — supports clickable textcard + bot guide link",
  send_email: "Send an email via team SMTP (QQ mailbox). Agent supplies recipient, subject, and body.",
};

const TOOL_DESCS_ZH: Record<string, string> = {
  search_partners: "按名称、状态、Tier、国家或停滞天数筛选伙伴",
  search_customers: "按名称、状态或国家搜索终端客户（非伙伴）",
  get_partner: "获取完整伙伴档案（画像、权力地图、商机等）",
  get_customer: "获取终端客户档案（联系人、商机、待办）",
  update_partner: "编辑伙伴字段。助手对话中直接生效；Agent 运行时会生成待人工确认的提案",
  update_customer: "编辑终端客户档案字段。助手对话中直接生效",
  create_todo: "创建待办，可关联伙伴或客户并设置截止日期",
  update_todo: "更新已有待办（负责人、截止日期、标题、优先级、详情）",
  list_todos: "查看进行中或逾期的待办（可按伙伴或客户筛选）",
  list_opportunities: "列出某伙伴或客户的销售商机",
  update_opportunity: "更新已有商机",
  list_business_records: "列出某伙伴或客户最近的商务记录",
  linkedin_search: "搜索 LinkedIn 公司主页、高管动态与公开职业信息（监控关键联系人）",
  web_search: "搜索公开新闻、招聘、获奖、竞品动态（非 LinkedIn 场景）",
  add_timeline_event: "在伙伴或客户时间线上记录外部信号/新闻（直接写入并审计）",
  scan_sentiment: "按维度/情感对伙伴进行联网舆情扫描，含自定义监控源",
  search_knowledge: "检索团队知识库（帆软背景、中东策略、产品能力）供引用",
  search_knowhow: "在帆软 Know-how 知识库中语义检索案例、方案、物料与行业资料",
  read_kms: "通过 pageId/URL 或关键词读取帆软内部 Confluence（kms.fineres.com）",
  write_kms: "在 KMS 页面追加、前置、替换内容或创建子页面（需写权限）",
  push_wecom: "向企微群 chatId 排队发送 Markdown 消息（群需已被机器人注册）",
  list_wecom_chats: "列出已注册的企微群/单聊及伙伴绑定关系",
  send_wecom_app: "通过自建应用向成员 userid 发送应用消息；支持 textcard 可点击按钮引导至 AI/机器人",
  send_email: "通过团队 SMTP（QQ 邮箱）发送邮件，由 Agent 提供收件人、主题与正文",
};

const CATEGORY_META: Record<ToolCategoryId, { label: string; desc: string }> = {
  partner: { label: "Partner profiles", desc: "Search, read, and log partner activity" },
  intel: { label: "External intelligence", desc: "LinkedIn and public web — monitor partners, competitors, market signals" },
  kms: { label: "Company KMS", desc: "Fanruan internal Confluence docs — read and write (personal token required)" },
  knowhow: { label: "Know-how", desc: "Fanruan Know-how knowledge base — semantic search for cases, solutions, and collateral" },
  todo: { label: "Tasks", desc: "Create and list follow-up todos" },
  content: { label: "Knowledge & reports", desc: "Team knowledge base and report center output" },
  integration: { label: "Integrations", desc: "WeCom group notifications, email, and outbound messaging" },
};

const CATEGORY_META_ZH: Record<ToolCategoryId, { label: string; desc: string }> = {
  partner: { label: "伙伴档案", desc: "搜索、读取与记录伙伴动态" },
  intel: { label: "外部情报", desc: "LinkedIn 与公开网页 — 监控伙伴、竞品与市场信号" },
  kms: { label: "公司 KMS", desc: "帆软内部 Confluence 文档 — 读写（需个人令牌）" },
  knowhow: { label: "Know-how", desc: "帆软 Know-how 知识库 — 语义检索案例、方案与物料" },
  todo: { label: "任务", desc: "创建与查询跟进待办" },
  content: { label: "知识与报告", desc: "团队知识库与报告中心输出" },
  integration: { label: "集成推送", desc: "企微群通知、邮件与外发消息" },
};

function normalizeToolName(name: string) {
  return name === "$web_search" ? "web_search" : name;
}

function pick<T extends Record<string, string>>(en: T, zh: T, key: string, locale: Locale): string {
  if (locale === "zh") return zh[key] ?? en[key] ?? key;
  return en[key] ?? key;
}

export function getToolLabel(name: string, locale: Locale = "en") {
  const n = normalizeToolName(name);
  return pick(TOOL_LABELS, TOOL_LABELS_ZH, n, locale);
}

export function getToolDesc(name: string, locale: Locale = "en") {
  const n = normalizeToolName(name);
  return pick(TOOL_DESCS, TOOL_DESCS_ZH, n, locale);
}

export function getToolCategoryMeta(id: ToolCategoryId, locale: Locale = "en") {
  if (locale === "zh") return CATEGORY_META_ZH[id] ?? CATEGORY_META[id];
  return CATEGORY_META[id];
}
