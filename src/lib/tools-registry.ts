import { SKILLS } from "./skills";

export type ToolCategory = {
  id: string;
  label: string;
  desc: string;
  icon: string;
  tools: { name: string; label: string; desc: string }[];
};

/** 内置 Tool 分类，供工具背包 UI 展示 */
export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: "partner",
    label: "伙伴档案",
    desc: "查询、读取、更新伙伴数据与时间线",
    icon: "◮",
    tools: [],
  },
  {
    id: "todo",
    label: "待办任务",
    desc: "创建和查询团队待办",
    icon: "☑",
    tools: [],
  },
  {
    id: "web",
    label: "网络信息",
    desc: "联网搜索与网页内容抓取",
    icon: "🌐",
    tools: [],
  },
  {
    id: "content",
    label: "知识与报告",
    desc: "检索知识库、写入报告中心",
    icon: "📄",
    tools: [],
  },
];

const CATEGORY_BY_TOOL: Record<string, string> = {
  search_partners: "partner",
  get_partner: "partner",
  update_partner: "partner",
  add_timeline_event: "partner",
  create_todo: "todo",
  list_todos: "todo",
  web_search: "web",
  fetch_url: "web",
  search_knowledge: "content",
  create_document: "content",
};

function buildCategories(): ToolCategory[] {
  const cats = TOOL_CATEGORIES.map((c) => ({ ...c, tools: [] as ToolCategory["tools"] }));
  const map = new Map(cats.map((c) => [c.id, c]));
  for (const t of SKILLS) {
    const catId = CATEGORY_BY_TOOL[t.name] ?? "partner";
    map.get(catId)?.tools.push({ name: t.name, label: t.label, desc: t.desc });
  }
  return cats;
}

export const BUILTIN_TOOL_CATEGORIES = buildCategories();

export const BUILTIN_TOOL_COUNT = SKILLS.length;

export function getToolLabel(name: string) {
  return SKILLS.find((t) => t.name === name)?.label ?? name;
}
