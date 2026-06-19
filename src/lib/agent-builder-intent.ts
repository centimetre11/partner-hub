import type { IntakeMessage } from "./ai-intake";
import { stripIntakeSystemHint } from "./ai-intake";
import { stripWecomCommandPrefix } from "./wecom-user-resolve";

function normalizeIntentText(text: string): string {
  return stripIntakeSystemHint(stripWecomCommandPrefix(text)).trim();
}

/** Pure todo intake — must stay in Propose mode, not Agent Builder */
function isPureTodoIntakeIntent(text: string): boolean {
  const t = normalizeIntentText(text);
  if (/机器人|提醒|推送|通知|自动化|agent|Agent|定时|到期前/i.test(t)) return false;
  return /^(创建|添加|记|加|新建|录入).{0,4}待办|create todo|add todo|log todo/i.test(t);
}

/** Detect automation / Agent creation intent (WeCom + assistant routing) */
export function isAgentBuilderIntent(text: string): boolean {
  const t = normalizeIntentText(text);

  // Automation patterns take priority over single-todo intake phrasing
  if (/机器人.{0,8}提醒|自动.{0,8}提醒|定时.{0,8}(扫描|运行|提醒|任务|推送)/i.test(t)) {
    return true;
  }
  if (/待办.{0,48}(到期|截止|due).{0,48}(提醒|推送|通知)/i.test(t)) return true;
  if (/到期前.{0,24}(天|日|day).{0,32}(提醒|推送)/i.test(t) && /待办|todo/i.test(t)) return true;
  if (/创建.{0,24}(提醒|推送|通知|机器人)/i.test(t) && /待办|todo/i.test(t)) return true;

  if (isPureTodoIntakeIntent(t)) return false;

  if (/创建.{0,8}(agent|Agent|自动化)|建.{0,6}(agent|Agent|自动化)|搭建.{0,8}(agent|Agent|自动化)/i.test(t)) {
    if (isAgentBuilderCreateCommand(text)) return false;
    return true;
  }
  if (/create agent|build agent|new agent|automation agent|agent builder/i.test(t)) return true;
  if (/agent.{0,10}(编排|自动化)|编排.{0,8}工作流|自动化.{0,8}工作流/i.test(t)) return true;

  return false;
}

/** Bare "create agent" command — finalize when draft ready, not a new automation description */
export function isAgentBuilderFinalizeIntent(text: string): boolean {
  return isAgentBuilderCreateCommand(text) || isAgentBuilderConfirm(text);
}

export function shouldUseAgentBuilderMode(
  messages: IntakeMessage[],
  hasSession?: boolean
): boolean {
  if (hasSession) return true;
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return false;
  return isAgentBuilderIntent(lastUser.content);
}

/** Short command to finalize a ready draft (WeCom) */
export function isAgentBuilderCreateCommand(text: string): boolean {
  const t = normalizeIntentText(text);
  return /^(创建\s*agent|创建agent|开始创建|确认创建|好的\s*创建|保存\s*agent)$/i.test(t);
}

/** User confirms Agent Builder draft (WeCom) */
export function isAgentBuilderConfirm(text: string): boolean {
  const t = normalizeIntentText(text);
  if (isAgentBuilderCreateCommand(text)) return true;
  if (/^(确认|确认创建|确认保存|保存|提交|好的保存|可以保存|确认提交|apply|confirm|ok save|save)$/i.test(t)) {
    return true;
  }
  const raw = text.trim();
  const atMatch = raw.match(
    /^@(.+)\s+(确认|确认创建|确认保存|保存|提交|创建\s*agent|创建agent|开始创建|apply|confirm|ok save|save)\s*$/i
  );
  if (!atMatch) return false;
  return /^[\w.\s-]{1,40}$/.test(atMatch[1].trim());
}

/** User cancels Agent Builder draft (WeCom) */
export function isAgentBuilderCancel(text: string): boolean {
  const t = text.trim();
  if (/^(取消|放弃|不要了|cancel|discard|abort)$/i.test(t)) return true;
  const atMatch = t.match(/^@(.+)\s+(取消|放弃|不要了|cancel|discard|abort)\s*$/i);
  if (!atMatch) return false;
  return /^[\w.\s-]{1,40}$/.test(atMatch[1].trim());
}

/** User requests a manual trial run after Agent creation (WeCom) */
export function isAgentBuilderTrialRun(text: string): boolean {
  const t = text.trim();
  if (/^(试运行|试跑|测试运行|test run|trial run|run now)$/i.test(t)) return true;
  const atMatch = t.match(/^@(.+)\s+(试运行|试跑|测试运行|test run|trial run|run now)\s*$/i);
  if (!atMatch) return false;
  return /^[\w.\s-]{1,40}$/.test(atMatch[1].trim());
}
