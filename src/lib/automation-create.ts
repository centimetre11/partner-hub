import { db } from "./db";
import { computeNextRunAt } from "./agent-runner";
import { computeNextRunFromCron, cronToAgentSchedule } from "./cron";
import { DEFAULT_TASK_MD } from "./automation-defaults";
import type { AutomationBuilderDraft } from "./automation-builder-types";
import { DEFAULT_AGENT_SKILLS } from "./skills";
import type { AutomationVariable } from "./automation-builder-types";

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function injectVariables(taskMd: string, variables: AutomationVariable[]): string {
  let out = taskMd;
  for (const v of variables) {
    out = out.replaceAll(`{{${v.key}}}`, v.value);
  }
  return out;
}

export function buildAutomationInstructions(taskMd: string, variables: AutomationVariable[]): string {
  const body = injectVariables(taskMd.trim() || DEFAULT_TASK_MD, variables);
  return `${body}

---
【自动化执行说明】
- 你是定时/触发型自动化管道，按 TASK.md 中的步骤执行
- 变量已在上方注入；如需读取文件、搜索、推送通知，请使用可用工具
- 完成后输出 Markdown 执行摘要：结论、关键发现、产出文件路径、下一步建议
`;
}

export type CreateAutomationResult = { id: string; name: string; slug: string; nextRunAt: Date | null };

/** 从 AI Builder 草案创建自动化管道 */
export async function createAutomationFromDraft(
  draft: AutomationBuilderDraft,
  userId: string,
  opts: { wecomPushChatId?: string } = {}
): Promise<CreateAutomationResult> {
  const slug = slugify(draft.slug || draft.name);
  const name = draft.name.trim();
  const taskMd = draft.taskMd.trim();
  if (!slug || !name || !taskMd) {
    throw new Error("Automation slug, name, and taskMd are required");
  }

  const existing = await db.agent.findFirst({ where: { slug } });
  if (existing) {
    throw new Error(`Slug "${slug}" already exists`);
  }

  const trigger = draft.triggerType === "SCHEDULE" ? "SCHEDULE" : "MANUAL";
  const cronExpr = (draft.cronExpr || "0 9 * * *").trim();
  const schedule = cronToAgentSchedule(cronExpr);
  const variables = Array.isArray(draft.variables) ? draft.variables.filter((v) => v.key?.trim()) : [];

  const created = await db.agent.create({
    data: {
      name,
      slug,
      icon: "⚡",
      description: draft.description?.trim() || null,
      instructions: buildAutomationInstructions(taskMd, variables),
      skills: JSON.stringify(DEFAULT_AGENT_SKILLS),
      trigger,
      frequency: trigger === "SCHEDULE" ? schedule.frequency : null,
      runHour: schedule.runHour,
      runWeekday: schedule.runWeekday,
      cronExpr: trigger === "SCHEDULE" ? cronExpr : null,
      timezone: draft.timezone || "Asia/Shanghai",
      validityDays: draft.validityDays || 7,
      variables: JSON.stringify(variables),
      maxIterations: draft.maxIterations || 30,
      timeoutMinutes: draft.timeoutMinutes || 60,
      notifyOnSuccess: draft.notifyOnSuccess !== false,
      notifyOnFailure: draft.notifyOnFailure !== false,
      wecomPushChatId: draft.wecomPushChatId?.trim() || opts.wecomPushChatId?.trim() || null,
      webhookUrl: draft.webhookUrl?.trim() || null,
      scopeType: "ALL",
      partnerId: null,
      shared: true,
      enabled: true,
      isAutomation: true,
      isTemplate: false,
      createdById: userId,
    },
  });

  const nextRunAt =
    created.trigger === "SCHEDULE"
      ? created.cronExpr
        ? computeNextRunFromCron(created.cronExpr)
        : computeNextRunAt(created)
      : null;
  if (nextRunAt) {
    await db.agent.update({ where: { id: created.id }, data: { nextRunAt } });
  }

  return { id: created.id, name: created.name, slug, nextRunAt };
}
