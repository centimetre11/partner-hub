import { SKILLS } from "./skills";

export type ToolMeta = {
  name: string;
  label: string;
  desc: string;
  /** 是否已在代码中注册且实现 */
  implemented: boolean;
/** 是否需要模型内置联网搜索（Kimi / 火山引擎） */
  requiresWebSearch?: boolean;
  /** 是否需要用户配置 KMS 个人令牌 */
  requiresKms?: boolean;
  /** 核心场景优先级 */
  priority: "core" | "standard" | "assistant";
};

export type ToolCategory = {
  id: string;
  label: string;
  desc: string;
  icon: string;
  tools: ToolMeta[];
};

const TOOL_META: Record<string, Omit<ToolMeta, "name" | "label" | "desc">> = {
  search_partners: { implemented: true, priority: "core" },
  get_partner: { implemented: true, priority: "core" },
  add_timeline_event: { implemented: true, priority: "core" },
  create_todo: { implemented: true, priority: "core" },
  linkedin_search: { implemented: true, requiresWebSearch: true, priority: "core" },
  web_search: { implemented: true, requiresWebSearch: true, priority: "core" },
  scan_sentiment: { implemented: true, requiresWebSearch: true, priority: "core" },
  search_knowledge: { implemented: true, priority: "core" },
  read_kms: { implemented: true, requiresKms: true, priority: "core" },
  create_document: { implemented: true, priority: "core" },
  list_todos: { implemented: true, priority: "standard" },
  update_partner: { implemented: true, priority: "assistant" },
};

const CATEGORY_BY_TOOL: Record<string, string> = {
  search_partners: "partner",
  get_partner: "partner",
  update_partner: "partner",
  add_timeline_event: "partner",
  create_todo: "todo",
  list_todos: "todo",
  linkedin_search: "intel",
  web_search: "intel",
  scan_sentiment: "intel",
  search_knowledge: "content",
  read_kms: "kms",
  create_document: "content",
};

const TOOL_CATEGORIES_TEMPLATE: Omit<ToolCategory, "tools">[] = [
  { id: "partner", label: "伙伴档案", desc: "查询、读取、记录伙伴动态", icon: "◮" },
  { id: "intel", label: "外部情报", desc: "LinkedIn 与公开网络——监测伙伴/竞品/市场信号", icon: "📡" },
  { id: "kms", label: "公司 KMS", desc: "帆软内部 Confluence 文档（需个人令牌）", icon: "🏢" },
  { id: "todo", label: "待办任务", desc: "创建和查询跟进待办", icon: "☑" },
  { id: "content", label: "知识与报告", desc: "团队知识库、报告中心输出", icon: "📄" },
];

function buildCategories(): ToolCategory[] {
  const cats = TOOL_CATEGORIES_TEMPLATE.map((c) => ({ ...c, tools: [] as ToolMeta[] }));
  const map = new Map(cats.map((c) => [c.id, c]));
  for (const t of SKILLS) {
    const catId = CATEGORY_BY_TOOL[t.name] ?? "partner";
    const meta = TOOL_META[t.name] ?? { implemented: true, priority: "standard" as const };
    map.get(catId)?.tools.push({
      name: t.name,
      label: t.label,
      desc: t.desc,
      ...meta,
    });
  }
  return cats.filter((c) => c.tools.length > 0);
}

export const BUILTIN_TOOL_CATEGORIES = buildCategories();

export const BUILTIN_TOOL_COUNT = SKILLS.length;

export function getToolLabel(name: string) {
  return SKILLS.find((t) => t.name === name)?.label ?? name;
}

export function isToolAvailable(name: string, opts?: { webSearchReady?: boolean }) {
  const meta = TOOL_META[name];
  if (!meta?.implemented) return false;
  if (meta.requiresWebSearch && !opts?.webSearchReady) return false;
  return true;
}

export function getToolAvailability(
  name: string,
  opts?: { kmsConfigured?: boolean; webSearchReady?: boolean },
): "ready" | "needs_web_search" | "needs_kms" | "unknown" {
  if (!SKILLS.some((t) => t.name === name)) return "unknown";
  const meta = TOOL_META[name];
  if (meta?.requiresWebSearch && !opts?.webSearchReady) return "needs_web_search";
  if (meta?.requiresKms && !opts?.kmsConfigured) return "needs_kms";
  return "ready";
}

/** Agent 默认装备的核心工具（不含需模型联网搜索的情报工具，由模板按需追加） */
export const CORE_AGENT_TOOLS = [
  "search_partners",
  "get_partner",
  "add_timeline_event",
  "create_todo",
  "search_knowledge",
];

export const INTEL_AGENT_TOOLS = ["linkedin_search", "web_search", "scan_sentiment"];
