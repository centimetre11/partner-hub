import { stripIntakeSystemHint } from "./intake-text";

export type TodoIntentScores = {
  /** Create / log a todo (Propose or create_todo) */
  create: number;
  /** List / query open todos (Query + list_todos) */
  list: number;
};

const LIST_THRESHOLD = 8;

/**
 * Score create-todo vs list-todos intent. When both signals appear, the higher score wins.
 * 「看看 poc」inside a create sentence scores toward create, not list.
 */
export function scoreTodoIntent(text: string): TodoIntentScores {
  const t = stripIntakeSystemHint(text).trim();
  let create = 0;
  let list = 0;

  if (/建.{0,4}待办|创建待办|新.{0,2}待办|录入待办/i.test(t)) create += 15;
  if (/加.{0,2}待办|帮.{0,12}(?:建|创|加|记|写|添).{0,6}待办|添加待办|记.{0,4}待办/i.test(t)) create += 15;
  if (/\b(create|add|log|new)\s+todos?\b/i.test(t)) create += 15;
  if (/待办[：:，]/.test(t)) create += 12;
  if (/^事项[是：:]|^the item is\b/i.test(t)) create += 10;

  // Follow-up action inside a todo description (看看 poc / 了解进展 — not listing todos)
  if (
    create > 0 &&
    /(并且|以及|顺便|还要|同时|,|，|and also|also).{0,32}(看看|了解|跟进|check on|follow up|find out)/i.test(t)
  ) {
    create += 6;
  }

  // List intent: query verbs must target 待办 as the object
  if (/看看.{0,10}待办|看一下.{0,10}待办|查.{0,8}待办|查询.{0,6}待办|列出.{0,6}待办/i.test(t)) list += 18;
  if (/待办.{0,16}(有哪些|有什么|多少|几个|列表|清单|\bopen\b|\ball\b)/i.test(t)) list += 18;
  if (/(有哪些|有什么|多少|几个|列出|查询|显示|展示).{0,16}待办/i.test(t)) list += 18;
  if (/^(看看|看一下|查|查询|列出|显示|展示).{0,20}待办/i.test(t)) list += 16;
  if (/\b(list|show|what|open|view).{0,16}todos?\b/i.test(t)) list += 16;
  if (/\btodos?\b.{0,16}(list|show|what|open|view)/i.test(t)) list += 16;

  // Weak list: generic 看看/查 elsewhere — only when no create signal
  if (!create && /待办|todos?\b/i.test(t) && /看看|看一下|查|查询|list|show|what|open|view/i.test(t)) {
    list += 5;
  }

  return { create, list };
}

export function isTodoCreateIntent(text: string): boolean {
  const { create, list } = scoreTodoIntent(text);
  if (!/待办|todos?\b/i.test(stripIntakeSystemHint(text))) return create > 0;
  return create > 0 && create >= list;
}

/** List/query todos — Query mode + list_todos, not Propose intake */
export function isTodoListQueryIntent(text: string): boolean {
  const t = stripIntakeSystemHint(text).trim();
  if (!/待办|todos?\b/i.test(t)) return false;
  const { create, list } = scoreTodoIntent(t);
  return list > create && list >= LIST_THRESHOLD;
}
