import type { Locale } from "../locale";
import { messagesEn, type Messages } from "./en";
import { messagesZh } from "./zh";

export type { Messages } from "./en";

export function getMessages(locale: Locale): Messages {
  return locale === "en" ? messagesEn : messagesZh;
}

/** Replace {key} placeholders in a template string */
export function formatMsg(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
