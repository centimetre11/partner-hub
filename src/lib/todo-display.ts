// 待办「机会/项目」归属的统一展示工具，供仪表盘 / 移动端 / 伙伴页 / 周报等复用。

// 列表查询统一 include：带上机会、项目、客户的最小字段，便于显示归属与链接。
export const TODO_LINK_INCLUDE = {
  opportunity: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
} as const;

export type TodoLinkRelations = {
  opportunityId?: string | null;
  projectId?: string | null;
  opportunity?: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
};

// 生成归属标签（项目优先于机会）。labels 来自 i18n：{ opportunity, project }
export function todoLinkLabel(
  todo: TodoLinkRelations,
  labels: { opportunity: string; project: string },
): string | null {
  if (todo.project) return `${labels.project}: ${todo.project.name}`;
  if (todo.opportunity) return `${labels.opportunity}: ${todo.opportunity.name}`;
  return null;
}

// 纯文本后缀（用于邮件/LLM 文本），例如 " · 项目: 沙特迁移"
export function todoLinkSuffix(
  todo: TodoLinkRelations,
  labels: { opportunity: string; project: string },
): string {
  const label = todoLinkLabel(todo, labels);
  return label ? ` · ${label}` : "";
}
