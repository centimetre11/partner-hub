/** TodoItem.source values used across the app. */
export const TODO_SOURCE_CODES = ["MANUAL", "AI", "SEED", "ARR"] as const;
export type TodoSourceCode = (typeof TODO_SOURCE_CODES)[number];

const SOURCE_SET = new Set<string>(TODO_SOURCE_CODES);

export function normalizeTodoSource(raw: unknown, fallback: TodoSourceCode = "MANUAL"): TodoSourceCode {
  const v = String(raw ?? "").trim().toUpperCase();
  if (SOURCE_SET.has(v)) return v as TodoSourceCode;
  return fallback;
}
