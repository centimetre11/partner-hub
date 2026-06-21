import { db } from "./db";
import { computeNextRunAt } from "./agent-runner";
import { cronToAgentSchedule } from "./cron";
import {
  buildAutomationVariables,
  pickAutomationTaskMd,
  inferDueWithinDays,
  defaultAutomationName,
  defaultAutomationSlug,
  DEFAULT_AUTOMATION_SKILLS,
  partnerScopeLabel,
} from "./automation-push";
import type { AutomationBuilderDraft } from "./automation-builder-types";
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
  const body = injectVariables(taskMd.trim(), variables);
  return `${body}

---
【自动化执行说明】
- 定时管道：按 TASK.md 步骤执行，按需使用 list_todos / list_opportunities / web_search / push_wecom / send_email
- 变量已注入；完成后输出 Markdown 摘要（结论、条数、是否已推送）
`;
}

export type CreateAutomationResult = { id: string; name: string; slug: string; nextRunAt: Date | null };

export type CreateAutomationOpts = {
  wecomPushChatId?: string;
  partnerId?: string;
  partnerName?: string;
  locale?: "zh" | "en";
};

async function resolvePartnerName(partnerId: string): Promise<string> {
  if (!partnerId) return "";
  const p = await db.partner.findUnique({ where: { id: partnerId }, select: { name: true } });
  return p?.name ?? "";
}

export async function resolveAutomationDraftContent(
  draft: AutomationBuilderDraft,
  opts: CreateAutomationOpts = {}
): Promise<{
  taskMd: string;
  variables: AutomationVariable[];
  partnerId: string | null;
  partnerName: string;
  goal: string;
}> {
  const locale = opts.locale ?? "zh";
  const partnerId = (draft.partnerId?.trim() || opts.partnerId?.trim() || "") || "";
  let partnerName = draft.variables?.find((v) => v.key === "partner_name")?.value?.trim() ?? "";
  if (!partnerName && partnerId) partnerName = await resolvePartnerName(partnerId);
  if (!partnerName && opts.partnerName) partnerName = opts.partnerName.trim();

  const goal =
    draft.description?.trim() ||
    draft.name?.trim() ||
    (locale === "zh" ? "定时查询并推送" : "Scheduled query and push");

  const wecomPushChatId = draft.wecomPushChatId?.trim() || opts.wecomPushChatId?.trim() || "";
  const pushEmailTo = draft.pushEmailTo?.trim() || "";

  const dueWithinDays = inferDueWithinDays(goal, draft.dueWithinDays);

  const variables = buildAutomationVariables({
    goal,
    partnerId,
    partnerName: partnerId ? partnerName || partnerScopeLabel(undefined, locale) : partnerName,
    dueWithinDays,
    wecomPushChatId,
    pushEmailTo,
    locale,
  });

  const taskMd = pickAutomationTaskMd(
    {
      goal,
      partnerId,
      partnerName: partnerName || undefined,
      dueWithinDays,
      wecomPushChatId,
      pushEmailTo,
      locale,
    },
    draft.taskMd
  );

  return { taskMd, variables, partnerId: partnerId || null, partnerName, goal };
}

export async function createAutomationFromDraft(
  draft: AutomationBuilderDraft,
  userId: string,
  opts: CreateAutomationOpts = {}
): Promise<CreateAutomationResult> {
  const { taskMd, variables, partnerId, goal } = await resolveAutomationDraftContent(draft, opts);
  const locale = opts.locale ?? "zh";

  const slug = slugify(
    draft.slug?.trim() ||
      defaultAutomationSlug(variables.find((v) => v.key === "partner_name")?.value || goal.slice(0, 24))
  );
  const name = draft.name?.trim() || defaultAutomationName(goal, locale);

  if (!slug || !name || !taskMd) {
    throw new Error("Automation slug, name, and taskMd are required");
  }

  const existing = await db.agent.findFirst({ where: { slug } });
  if (existing) {
    throw new Error(`Slug "${slug}" already exists`);
  }

  const cronExpr = (draft.cronExpr || "0 9 * * *").trim();
  const schedule = cronToAgentSchedule(cronExpr);
  const wecomPushChatId = draft.wecomPushChatId?.trim() || opts.wecomPushChatId?.trim() || null;
  const pushEmailTo = draft.pushEmailTo?.trim() || null;

  const created = await db.agent.create({
    data: {
      name,
      slug,
      icon: "⚡",
      description: draft.description?.trim() || goal,
      instructions: buildAutomationInstructions(taskMd, variables),
      skills: JSON.stringify([...DEFAULT_AUTOMATION_SKILLS]),
      trigger: "SCHEDULE",
      frequency: schedule.frequency,
      runHour: schedule.runHour,
      runWeekday: schedule.runWeekday,
      cronExpr,
      timezone: draft.timezone || "Asia/Shanghai",
      validityDays: draft.validityDays || 7,
      variables: JSON.stringify(variables),
      maxIterations: draft.maxIterations || 30,
      timeoutMinutes: draft.timeoutMinutes || 60,
      notifyOnSuccess: draft.notifyOnSuccess !== false,
      notifyOnFailure: draft.notifyOnFailure !== false,
      wecomPushChatId,
      pushEmailTo,
      webhookUrl: null,
      scopeType: partnerId ? "PARTNER" : "ALL",
      partnerId,
      shared: true,
      enabled: true,
      isAutomation: true,
      isTemplate: false,
      createdById: userId,
    },
  });

  const nextRunAt = computeNextRunAt(created);
  if (nextRunAt) {
    await db.agent.update({ where: { id: created.id }, data: { nextRunAt } });
  }

  return { id: created.id, name: created.name, slug, nextRunAt };
}
