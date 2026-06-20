import type { IntakeMessage } from "./ai-intake";
import { isAutomationCreateCommand, normalizeBuilderIntentText } from "./builder-intent-shared";

/** 纯待办录入 — 不走 Builder */
function isPureTodoIntakeIntent(text: string): boolean {
  const t = normalizeBuilderIntentText(text);
  if (/机器人|提醒|推送|通知|自动化|agent|Agent|定时|到期前/i.test(t)) return false;
  return /^(创建|添加|记|加|新建|录入).{0,4}待办|create todo|add todo|log todo/i.test(t);
}

/** 自动化管道构建意图（TASK.md + Cron，非交互式 Agent） */
export function isAutomationBuilderIntent(text: string): boolean {
  const t = normalizeBuilderIntentText(text);

  if (isAutomationCreateCommand(text)) return false;

  // 明确的自动化/管道表述
  if (/创建.{0,8}自动化|新建.{0,6}自动化|搭建.{0,8}自动化|自动化.{0,8}管道|管道.{0,8}自动化/i.test(t)) {
    if (isAutomationCreateCommand(text)) return false;
    return true;
  }
  if (/create automation|build automation|new automation|automation pipeline/i.test(t)) return true;
  if (/TASK\.md|task\.md/i.test(t)) return true;

  // 定时管道类任务（月报、监控、扫描）
  if (/定时.{0,12}(任务|管道|自动化|监控|报告|月报|扫描|推送)/i.test(t)) return true;
  if (/(每天|每周|每月|工作日|每小时).{0,32}(自动|定时|监控|报告|扫描|推送|提醒)/i.test(t)) return true;
  if (/cron/i.test(t) && /自动|管道|任务|监控/i.test(t)) return true;

  // 「自动化」+ 调度语境
  if (/自动化/i.test(t) && /(每天|每周|每月|定时|周期|cron|管道)/i.test(t)) return true;

  // 排除：待办到期提醒机器人 → Agent Builder
  if (/待办.{0,48}(到期|截止|due).{0,48}(提醒|推送|通知)/i.test(t)) return false;
  if (/机器人.{0,8}提醒|自动.{0,8}提醒/i.test(t) && /待办|todo/i.test(t)) return false;

  return false;
}

export function shouldUseAutomationBuilderMode(
  messages: IntakeMessage[],
  hasSession?: boolean
): boolean {
  if (hasSession) return true;
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return false;
  if (isPureTodoIntakeIntent(lastUser.content)) return false;
  return isAutomationBuilderIntent(lastUser.content);
}
