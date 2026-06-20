import type { IntakeMessage } from "./ai-intake";
import { isAutomationCreateCommand, normalizeBuilderIntentText } from "./builder-intent-shared";

/** 纯待办录入 — 不走 Builder */
function isPureTodoIntakeIntent(text: string): boolean {
  const t = normalizeBuilderIntentText(text);
  if (/机器人|提醒|推送|通知|自动化|agent|Agent|定时|到期前|每天|每周/i.test(t)) return false;
  return /^(创建|添加|记|加|新建|录入).{0,4}待办|create todo|add todo|log todo/i.test(t);
}

/** 定时查询 + 推送 — 自动化核心场景 */
export function isAutomationBuilderIntent(text: string): boolean {
  const t = normalizeBuilderIntentText(text);

  if (isAutomationCreateCommand(text)) return false;
  if (isPureTodoIntakeIntent(text)) return false;

  const hasSchedule = /(每天|每周|每月|工作日|定时|周期|daily|weekly|every day)/i.test(t);
  const hasPush = /(推送|提醒|通知|发到|发到群|发邮件|email|push|notify)/i.test(t);
  const hasQuery =
    /(待办|todo|商机|opportunit|投标|招标|动态|搜索|搜一下|scan|monitor|汇总)/i.test(t) ||
    /(客户|伙伴|partner|全部)/i.test(t);

  if (hasSchedule && hasPush && hasQuery) return true;

  if (/待办|todo/i.test(t) && hasSchedule && hasPush) return true;
  if (/商机|opportunit/i.test(t) && hasSchedule && hasPush) return true;
  if (/(投标|招标|动态)/i.test(t) && hasSchedule && hasPush) return true;

  if (/创建.{0,8}自动化|新建.{0,6}自动化|自动化.{0,8}管道/i.test(t)) return true;
  if (/create automation|automation pipeline/i.test(t)) return true;

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
