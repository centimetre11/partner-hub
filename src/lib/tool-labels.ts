import type { Locale } from "./i18n/locale";

/** Client-safe tool display labels (no skills.ts / server deps). */
const TOOL_LABELS: Record<string, string> = {
  search_partners: "Search partners",
  get_partner: "Read partner profile",
  update_partner: "Update partner profile",
  create_todo: "Create todo",
  list_todos: "List todos",
  list_opportunities: "List opportunities",
  linkedin_search: "LinkedIn search",
  web_search: "News search",
  add_timeline_event: "Add partner timeline event",
  scan_sentiment: "Sentiment scan",
  search_knowledge: "Search knowledge base",
  search_knowhow: "Search Know-how",
  read_kms: "Read KMS documents",
  write_kms: "Write KMS documents",
  create_document: "Save to report center",
  push_wecom: "Push to WeCom group",
  list_wecom_chats: "List WeCom chats",
  send_email: "Send email",
  $web_search: "News search",
};

const TOOL_LABELS_ZH: Record<string, string> = {
  search_partners: "搜索伙伴",
  get_partner: "读取伙伴档案",
  update_partner: "更新伙伴档案",
  create_todo: "创建待办",
  list_todos: "查询待办",
  list_opportunities: "查询商机",
  linkedin_search: "LinkedIn 搜索",
  web_search: "新闻搜索",
  add_timeline_event: "写入伙伴时间线",
  scan_sentiment: "舆情扫描",
  search_knowledge: "检索知识库",
  search_knowhow: "检索 Know-how",
  read_kms: "读取 KMS 文档",
  write_kms: "写入 KMS 文档",
  create_document: "保存到报告中心",
  push_wecom: "推送到企微群",
  list_wecom_chats: "列出企微群",
  send_email: "发送邮件",
  $web_search: "新闻搜索",
};

export function getToolLabel(name: string, locale: Locale = "en") {
  const n = name === "$web_search" ? "web_search" : name;
  if (locale === "zh") return TOOL_LABELS_ZH[n] ?? TOOL_LABELS[n] ?? n;
  return TOOL_LABELS[n] ?? n;
}
