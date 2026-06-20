"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireUser } from "./session";
import { computeNextRunAt } from "./agent-runner";
import { computeNextRunFromCron, cronToAgentSchedule } from "./cron";
import { DEFAULT_AGENT_SKILLS } from "./skills";
import { createAutomationFromDraft, buildAutomationInstructions } from "./automation-create";
import type { AutomationBuilderDraft } from "./automation-builder-types";
import { DEFAULT_TASK_MD } from "./automation-defaults";

import type { AutomationVariable } from "./automation-builder-types";

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function parseVariables(raw: string): AutomationVariable[] {
  if (!raw.trim()) return [];
  try {
    const arr = JSON.parse(raw) as AutomationVariable[];
    return Array.isArray(arr) ? arr.filter((v) => v.key?.trim()) : [];
  } catch {
    return [];
  }
}

function buildInstructions(taskMd: string, variables: AutomationVariable[]): string {
  return buildAutomationInstructions(taskMd, variables);
}

export async function createAutomationFromBuilderAction(formData: FormData) {
  const user = await requireUser();
  const raw = String(formData.get("draft") ?? "");
  if (!raw) return;
  const draft = JSON.parse(raw) as AutomationBuilderDraft;
  if (!draft.name?.trim() || !draft.taskMd?.trim()) return;

  const created = await createAutomationFromDraft(draft, user.id);
  revalidatePath("/automations");
  revalidatePath("/ai");
  redirect(`/automations/${created.id}`);
}

export async function upsertAutomationAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const slug = slugify(String(formData.get("slug") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const taskMd = String(formData.get("taskMd") ?? "").trim() || DEFAULT_TASK_MD;
  const triggerType = String(formData.get("triggerType") ?? "SCHEDULE");
  const cronExpr = String(formData.get("cronExpr") ?? "0 9 * * *").trim();
  const timezone = String(formData.get("timezone") ?? "Asia/Shanghai").trim();
  const validityDays = parseInt(String(formData.get("validityDays") ?? "7"), 10) || 7;
  const maxIterations = parseInt(String(formData.get("maxIterations") ?? "30"), 10) || 30;
  const timeoutMinutes = parseInt(String(formData.get("timeoutMinutes") ?? "60"), 10) || 60;
  const notifyOnSuccess = formData.get("notifyOnSuccess") === "on";
  const notifyOnFailure = formData.get("notifyOnFailure") === "on";
  const wecomPushChatId = String(formData.get("wecomPushChatId") ?? "").trim() || null;
  const webhookUrl = String(formData.get("webhookUrl") ?? "").trim() || null;
  const activate = formData.get("activate") === "on";

  const variablesRaw = String(formData.get("variables") ?? "[]");
  const variables = parseVariables(variablesRaw);

  if (!slug || !name) return;

  const existingSlug = await db.agent.findFirst({
    where: { slug, ...(id ? { id: { not: id } } : {}) },
  });
  if (existingSlug) return;

  const schedule = cronToAgentSchedule(cronExpr);
  const trigger = triggerType === "SCHEDULE" ? "SCHEDULE" : "MANUAL";
  const instructions = buildInstructions(taskMd, variables);

  const data = {
    name,
    slug,
    icon: "⚡",
    description,
    instructions,
    skills: JSON.stringify(DEFAULT_AGENT_SKILLS),
    trigger,
    frequency: trigger === "SCHEDULE" ? schedule.frequency : null,
    runHour: schedule.runHour,
    runWeekday: schedule.runWeekday,
    cronExpr: trigger === "SCHEDULE" ? cronExpr : null,
    timezone,
    validityDays,
    variables: JSON.stringify(variables),
    maxIterations,
    timeoutMinutes,
    notifyOnSuccess,
    notifyOnFailure,
    wecomPushChatId,
    webhookUrl: triggerType === "WEBHOOK" ? webhookUrl : webhookUrl,
    scopeType: "ALL" as const,
    partnerId: null,
    shared: true,
    enabled: activate,
    isAutomation: true,
    isTemplate: false,
  };

  let agentId = id;
  if (id) {
    await db.agent.update({ where: { id }, data });
  } else {
    const created = await db.agent.create({ data: { ...data, createdById: user.id } });
    agentId = created.id;
  }

  const agent = await db.agent.findUniqueOrThrow({ where: { id: agentId } });
  const nextRunAt =
    agent.trigger === "SCHEDULE" && agent.enabled
      ? agent.cronExpr
        ? computeNextRunFromCron(agent.cronExpr)
        : computeNextRunAt(agent)
      : null;
  await db.agent.update({ where: { id: agentId }, data: { nextRunAt } });

  revalidatePath("/automations");
  revalidatePath("/ai");
  redirect(`/automations/${agentId}`);
}

export async function toggleAutomationAction(agentId: string) {
  await requireUser();
  const a = await db.agent.findUniqueOrThrow({ where: { id: agentId, isAutomation: true } });
  const enabled = !a.enabled;
  const nextRunAt =
    enabled && a.trigger === "SCHEDULE"
      ? a.cronExpr
        ? computeNextRunFromCron(a.cronExpr)
        : computeNextRunAt(a)
      : null;
  await db.agent.update({ where: { id: agentId }, data: { enabled, nextRunAt } });
  revalidatePath("/automations");
  revalidatePath(`/automations/${agentId}`);
}

export async function deleteAutomationAction(agentId: string) {
  await requireUser();
  await db.agent.delete({ where: { id: agentId, isAutomation: true } });
  revalidatePath("/automations");
  redirect("/automations");
}
