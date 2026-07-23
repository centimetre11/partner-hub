import type { ConfirmedItemSnapshot } from "./types";
import type { PrepFacts } from "./types";

export type PresalesReportItemRow = {
  label: string;
  coreNotes: string;
  businessRecordTitle?: string | null;
  todos: { title: string; detail?: string | null; dueDate?: string | null }[];
  prepTodoTitles?: string[];
};

export function buildPresalesFinalReportMarkdown(opts: {
  title: string;
  endedAt?: string | null;
  items: PresalesReportItemRow[];
}): string {
  const dateLabel = opts.endedAt
    ? new Date(opts.endedAt).toLocaleString("zh-CN", { hour12: false })
    : new Date().toLocaleString("zh-CN", { hour12: false });

  const parts: string[] = [
    `# ${opts.title}`,
    ``,
    `售前项目会议报告 · ${dateLabel}`,
    ``,
  ];

  opts.items.forEach((it, idx) => {
    parts.push(`## ${idx + 1}. ${it.label}`);
    parts.push(``);
    if (it.prepTodoTitles?.length) {
      parts.push(`### 会前未完成待办`);
      for (const t of it.prepTodoTitles) parts.push(`- ${t}`);
      parts.push(``);
    }
    parts.push(`### 讨论总结`);
    parts.push(it.coreNotes.trim() || "（未做会后总结）");
    parts.push(``);
    if (it.businessRecordTitle?.trim()) {
      parts.push(`### 商务记录`);
      parts.push(it.businessRecordTitle.trim());
      parts.push(``);
    }
    parts.push(`### 后续待办`);
    if (it.todos.length) {
      for (const t of it.todos) {
        const due = t.dueDate ? `（截止 ${t.dueDate.slice(0, 10)}）` : "";
        parts.push(`- ${t.title}${due}`);
        if (t.detail?.trim()) parts.push(`  ${t.detail.trim()}`);
      }
    } else {
      parts.push(`- （无）`);
    }
    parts.push(``);
  });

  return parts.join("\n").trim() + "\n";
}

export function reportRowFromPresalesItem(opts: {
  label: string;
  snapshot?: ConfirmedItemSnapshot | null;
  coreNotes?: string | null;
  draft?: {
    coreNotes: string;
    businessRecordTitle: string;
    todos: { title: string; detail?: string; dueDate?: string; include?: boolean }[];
  } | null;
  prepFacts?: PrepFacts | null;
}): PresalesReportItemRow {
  const snap = opts.snapshot;
  const draft = opts.draft;
  const coreNotes =
    draft?.coreNotes?.trim() ||
    snap?.coreNotes?.trim() ||
    opts.coreNotes?.trim() ||
    "";
  const todos = draft
    ? draft.todos
        .filter((t) => t.include !== false && t.title.trim())
        .map((t) => ({
          title: t.title.trim(),
          detail: t.detail ?? null,
          dueDate: t.dueDate ?? null,
        }))
    : (snap?.todos ?? []).map((t) => ({
        title: t.title,
        detail: t.detail,
        dueDate: t.dueDate,
      }));

  return {
    label: opts.label,
    coreNotes,
    businessRecordTitle:
      draft?.businessRecordTitle?.trim() || snap?.businessRecordTitle || null,
    todos,
    prepTodoTitles: (opts.prepFacts?.openTodos ?? []).map((t) => t.title),
  };
}
