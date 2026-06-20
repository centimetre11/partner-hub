/** Client-safe tool display labels (no skills.ts / server deps). */
const TOOL_LABELS: Record<string, string> = {
  search_partners: "Search partners",
  get_partner: "Read partner profile",
  update_partner: "Update partner profile",
  create_todo: "Create todo",
  list_todos: "List todos",
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

export function getToolLabel(name: string) {
  const n = name === "$web_search" ? "web_search" : name;
  return TOOL_LABELS[n] ?? n;
}
