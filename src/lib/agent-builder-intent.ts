import type { IntakeMessage } from "./ai-intake";
import { stripIntakeSystemHint } from "./ai-intake";
import { stripWecomCommandPrefix } from "./wecom-user-resolve";
import { isAutomationBuilderIntent } from "./automation-builder-intent";
import {
  isAgentCreateCommand,
  isBuilderCancel,
  isBuilderConfirm,
  isBuilderTrialRun,
  normalizeBuilderIntentText,
} from "./builder-intent-shared";

function normalizeIntentText(text: string): string {
  return normalizeBuilderIntentText(text);
}

/** Pure todo intake — must stay in Propose mode, not Agent Builder */
function isPureTodoIntakeIntent(text: string): boolean {
  const t = normalizeIntentText(text);
  if (/机器人|提醒|推送|通知|自动化|agent|Agent|定时|到期前/i.test(t)) return false;
  return /^(创建|添加|记|加|新建|录入).{0,4}待办|create todo|add todo|log todo/i.test(t);
}

/** Detect Agent creation intent (WeCom + assistant routing) — excludes automation pipelines */
export function isAgentBuilderIntent(text: string): boolean {
  const t = normalizeIntentText(text);

  if (isAutomationBuilderIntent(text)) return false;

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
  return isAgentCreateCommand(text);
}

/** User confirms Agent Builder draft (WeCom) */
export function isAgentBuilderConfirm(text: string): boolean {
  return isBuilderConfirm(text);
}

/** User cancels Agent Builder draft (WeCom) */
export function isAgentBuilderCancel(text: string): boolean {
  return isBuilderCancel(text);
}

/** User requests a manual trial run after Agent creation (WeCom) */
export function isAgentBuilderTrialRun(text: string): boolean {
  return isBuilderTrialRun(text);
}
