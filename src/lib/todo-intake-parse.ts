import { db } from "./db";
import type { TodoProposal } from "./proposals";

export function stripTodoCommandPrefix(text: string): string {
  return text
    .trim()
    .replace(
      /^(帮我|请|麻烦)?\s*(增加|新增|添加|加|创建|记(录|个|一下)?)\s*(一个|一下)?\s*待办[：:,，、\s]*/i,
      "",
    )
    .replace(
      /^(帮我|请|麻烦)?\s*(增加|新增|添加|加|创建|记(录|个|一下)?)\s*(一个|一下)?\s*待办\s+/i,
      "",
    )
    .replace(/^(please )?(help me )?(to )?(add|create|log)?\s*(a )?todo[：:\s,]*/i, "")
    .trim();
}

function addDays(today: string, offsetDays: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function inferDueDate(text: string, today: string): string | undefined {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  if (/明天|tomorrow/i.test(text)) return addDays(today, 1);
  if (/后天/i.test(text)) return addDays(today, 2);
  if (/下周|next week/i.test(text)) return addDays(today, 7);
  if (/本周末|这周末|weekend/i.test(text)) return addDays(today, 5);
  return undefined;
}

function extractAssignee(text: string): { rest: string; assigneeName?: string } {
  let s = text.trim();
  const forPerson = s.match(
    /^(?:给|for)\s+([A-Za-z\u4e00-\u9fa5][A-Za-z0-9\u4e00-\u9fa5.\s'-]{0,30}?)\s*[，,：:\s]+/i,
  );
  if (forPerson?.[1]?.trim()) {
    return {
      rest: s.slice(forPerson[0].length).trim(),
      assigneeName: forPerson[1].trim(),
    };
  }
  const patterns = [
    /[,，、]\s*(?:负责人|责任人|指派给|分配给|owner|assignee)\s*(?:是|:|：|=)\s*([^,，。；;\n]+)\s*$/i,
    /\s+(?:负责人|责任人|owner|assignee)\s*(?:是|:|：|=)\s*([^,，。；;\n]+)\s*$/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]?.trim()) {
      return { rest: s.replace(re, "").trim(), assigneeName: m[1].trim() };
    }
  }
  return { rest: s };
}

/** Parse todo title / assignee / dates from free-form user text (WeCom or web). */
export function parseTodoFromText(text: string, today?: string): TodoProposal {
  let s = stripTodoCommandPrefix(text);
  const { rest, assigneeName } = extractAssignee(s);
  s = rest.replace(/^[，,、]\s*/, "").trim();
  const title = s.length <= 120 ? s : `${s.slice(0, 117)}…`;
  return {
    title,
    assigneeName,
    dueDate: today ? inferDueDate(text, today) : inferDueDate(text, new Date().toISOString().slice(0, 10)),
  };
}

export function normalizeTodoItem(t: TodoProposal, today?: string): TodoProposal {
  const source = [t.title, t.detail].filter(Boolean).join(" ");
  const parsed = parseTodoFromText(source, today);
  const title = parsed.title?.trim() || stripTodoCommandPrefix(t.title);
  return {
    ...t,
    title,
    assigneeName: t.assigneeName?.trim() || parsed.assigneeName,
    dueDate: t.dueDate || parsed.dueDate,
  };
}

export async function resolveTodoAssigneeId(
  assigneeName: string | undefined,
  fallbackUserId: string,
): Promise<string> {
  const q = assigneeName?.trim();
  if (!q) return fallbackUserId;
  const users = await db.user.findMany({ take: 50 });
  const lower = q.toLowerCase();
  const match =
    users.find((u) => u.name?.toLowerCase() === lower) ??
    users.find((u) => u.name?.toLowerCase().includes(lower)) ??
    users.find((u) => u.email?.toLowerCase().split("@")[0] === lower) ??
    users.find((u) => u.email?.toLowerCase().includes(lower)) ??
    users.find((u) => u.crmSalesmanName?.toLowerCase().includes(lower)) ??
    null;
  return match?.id ?? fallbackUserId;
}
