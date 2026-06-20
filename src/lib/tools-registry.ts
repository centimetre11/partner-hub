import { SKILLS } from "./skills";
import { getToolCategoryMeta, getToolDesc, getToolLabel as getToolLabelFromMap, type ToolCategoryId } from "./tool-labels";
import type { Locale } from "./i18n/locale";

export type ToolMeta = {
  name: string;
  label: string;
  desc: string;
  /** Whether implemented and registered in code */
  implemented: boolean;
/** Requires model builtin web search (Kimi / Volcengine) */
  requiresWebSearch?: boolean;
  /** Requires user-configured KMS personal token */
  requiresKms?: boolean;
  /** Requires team Know-how API token */
  requiresKnowhow?: boolean;
  /** Requires team SMTP email service */
  requiresEmail?: boolean;
  /** Core scenario priority */
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
  update_todo: { implemented: true, priority: "standard" },
  list_todos: { implemented: true, priority: "standard" },
  list_opportunities: { implemented: true, priority: "standard" },
  update_opportunity: { implemented: true, priority: "standard" },
  list_business_records: { implemented: true, priority: "standard" },
  linkedin_search: { implemented: true, requiresWebSearch: true, priority: "core" },
  web_search: { implemented: true, requiresWebSearch: true, priority: "core" },
  scan_sentiment: { implemented: true, requiresWebSearch: true, priority: "core" },
  search_knowledge: { implemented: true, priority: "core" },
  search_knowhow: { implemented: true, requiresKnowhow: true, priority: "core" },
  read_kms: { implemented: true, requiresKms: true, priority: "core" },
  write_kms: { implemented: true, requiresKms: true, priority: "standard" },
  update_partner: { implemented: true, priority: "assistant" },
  push_wecom: { implemented: true, priority: "standard" },
  list_wecom_chats: { implemented: true, priority: "standard" },
  send_email: { implemented: true, requiresEmail: true, priority: "standard" },
};

const CATEGORY_BY_TOOL: Record<string, string> = {
  search_partners: "partner",
  get_partner: "partner",
  update_partner: "partner",
  add_timeline_event: "partner",
  create_todo: "todo",
  update_todo: "todo",
  list_todos: "todo",
  list_opportunities: "partner",
  update_opportunity: "partner",
  list_business_records: "partner",
  linkedin_search: "intel",
  web_search: "intel",
  scan_sentiment: "intel",
  search_knowledge: "content",
  search_knowhow: "knowhow",
  read_kms: "kms",
  write_kms: "kms",
  push_wecom: "integration",
  list_wecom_chats: "integration",
  send_email: "integration",
};

const TOOL_CATEGORIES_TEMPLATE: { id: ToolCategoryId; icon: string }[] = [
  { id: "partner", icon: "◮" },
  { id: "intel", icon: "📡" },
  { id: "kms", icon: "🏢" },
  { id: "knowhow", icon: "🔍" },
  { id: "todo", icon: "☑" },
  { id: "content", icon: "📄" },
  { id: "integration", icon: "🔔" },
];

function buildCategories(locale: Locale): ToolCategory[] {
  const cats = TOOL_CATEGORIES_TEMPLATE.map((c) => {
    const meta = getToolCategoryMeta(c.id, locale);
    return { ...c, label: meta.label, desc: meta.desc, tools: [] as ToolMeta[] };
  });
  const map = new Map(cats.map((c) => [c.id, c]));
  for (const t of SKILLS) {
    const catId = (CATEGORY_BY_TOOL[t.name] ?? "partner") as ToolCategoryId;
    const meta = TOOL_META[t.name] ?? { implemented: true, priority: "standard" as const };
    map.get(catId)?.tools.push({
      name: t.name,
      label: getToolLabelFromMap(t.name, locale),
      desc: getToolDesc(t.name, locale),
      ...meta,
    });
  }
  return cats.filter((c) => c.tools.length > 0);
}

export function getBuiltinToolCategories(locale: Locale = "en") {
  return buildCategories(locale);
}

/** @deprecated Prefer getBuiltinToolCategories(locale) */
export const BUILTIN_TOOL_CATEGORIES = getBuiltinToolCategories("en");

export const BUILTIN_TOOL_COUNT = SKILLS.length;

export function getToolLabel(name: string, locale?: Locale) {
  return getToolLabelFromMap(name, locale ?? "en");
}

export function isToolAvailable(name: string, opts?: { webSearchReady?: boolean }) {
  const meta = TOOL_META[name];
  if (!meta?.implemented) return false;
  if (meta.requiresWebSearch && !opts?.webSearchReady) return false;
  return true;
}

export function getToolAvailability(
  name: string,
  opts?: { kmsConfigured?: boolean; knowhowConfigured?: boolean; webSearchReady?: boolean; emailConfigured?: boolean },
): "ready" | "needs_web_search" | "needs_kms" | "needs_knowhow" | "needs_email" | "unknown" {
  if (!SKILLS.some((t) => t.name === name)) return "unknown";
  const meta = TOOL_META[name];
  if (meta?.requiresWebSearch && !opts?.webSearchReady) return "needs_web_search";
  if (meta?.requiresKms && !opts?.kmsConfigured) return "needs_kms";
  if (meta?.requiresKnowhow && !opts?.knowhowConfigured) return "needs_knowhow";
  if (meta?.requiresEmail && !opts?.emailConfigured) return "needs_email";
  return "ready";
}

/** Default core tools for Agents (intel tools requiring web search are appended by template as needed) */
export const CORE_AGENT_TOOLS = [
  "search_partners",
  "get_partner",
  "add_timeline_event",
  "create_todo",
  "search_knowledge",
  "search_knowhow",
];

export const INTEL_AGENT_TOOLS = ["linkedin_search", "web_search", "scan_sentiment"];
