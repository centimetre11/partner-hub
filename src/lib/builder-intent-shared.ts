import { stripIntakeSystemHint } from "./ai-intake";
import { stripWecomCommandPrefix } from "./wecom-user-resolve";

export function normalizeBuilderIntentText(text: string): string {
  return stripIntakeSystemHint(stripWecomCommandPrefix(text)).trim();
}

/** User cancels Agent / Automation builder draft */
export function isBuilderCancel(text: string): boolean {
  const t = text.trim();
  if (/^(取消|放弃|不要了|cancel|discard|abort)$/i.test(t)) return true;
  const atMatch = t.match(/^@(.+)\s+(取消|放弃|不要了|cancel|discard|abort)\s*$/i);
  if (!atMatch) return false;
  return /^[\w.\s-]{1,40}$/.test(atMatch[1].trim());
}

export function isAgentCreateCommand(text: string): boolean {
  const t = normalizeBuilderIntentText(text);
  return /^(创建\s*agent|创建agent|开始创建|确认创建agent|保存\s*agent)$/i.test(t);
}

export function isAutomationCreateCommand(text: string): boolean {
  const t = normalizeBuilderIntentText(text);
  return /^(创建\s*自动化|创建自动化|确认创建自动化|保存\s*自动化)$/i.test(t);
}

/** User confirms builder draft (Agent or Automation) */
export function isBuilderConfirm(text: string): boolean {
  const t = normalizeBuilderIntentText(text);
  if (isAgentCreateCommand(text) || isAutomationCreateCommand(text)) return true;
  if (/^(确认|确认创建|确认保存|保存|提交|好的保存|可以保存|确认提交|apply|confirm|ok save|save)$/i.test(t)) {
    return true;
  }
  const raw = text.trim();
  const atMatch = raw.match(
    /^@(.+)\s+(确认|确认创建|确认保存|保存|提交|创建\s*agent|创建agent|创建\s*自动化|创建自动化|开始创建|apply|confirm|ok save|save)\s*$/i
  );
  if (!atMatch) return false;
  return /^[\w.\s-]{1,40}$/.test(atMatch[1].trim());
}

/** Trial run after creation */
export function isBuilderTrialRun(text: string): boolean {
  const t = text.trim();
  if (/^(试运行|试跑|测试运行|test run|trial run|run now)$/i.test(t)) return true;
  const atMatch = t.match(/^@(.+)\s+(试运行|试跑|测试运行|test run|trial run|run now)\s*$/i);
  if (!atMatch) return false;
  return /^[\w.\s-]{1,40}$/.test(atMatch[1].trim());
}
