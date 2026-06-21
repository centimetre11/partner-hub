"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { db } from "./db";
import { requireUser } from "./session";
import { computeNextRunAt } from "./agent-runner";
import { cronToAgentSchedule } from "./cron";
import { createAutomationFromDraft, buildAutomationInstructions, resolveAutomationDraftContent, ensureUniqueAutomationSlug } from "./automation-create";
import { isAutomationDraftReady } from "./builder-context-prompt";
import {
  defaultAutomationName,
  defaultAutomationSlug,
  DEFAULT_AUTOMATION_SKILLS,
  partnerScopeLabel,
} from "./automation-push";
import type { AutomationBuilderDraft } from "./automation-builder-types";

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export type PersistAutomationResult =
  | { ok: true; agentId: string }
  | { ok: false; error: string };

async function persistAutomationFromFormData(formData: FormData): Promise<PersistAutomationResult> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const cronExpr = String(formData.get("cronExpr") ?? "0 9 * * *").trim();
  const timezone = String(formData.get("timezone") ?? "Asia/Shanghai").trim();
  const wecomPushChatId = String(formData.get("wecomPushChatId") ?? "").trim() || null;
  const pushEmailTo = String(formData.get("pushEmailTo") ?? "").trim() || null;
  const notifyOnSuccess = formData.get("notifyOnSuccess") !== "off";
  const notifyOnFailure = formData.get("notifyOnFailure") === "on";
  const enabledInput = formData.get("enabled");
  const enabled =
    enabledInput === "on" || enabledInput === "off" ? enabledInput === "on" : true;
  const description = String(formData.get("description") ?? "").trim();
  const nameInput = String(formData.get("name") ?? "").trim();

  if (!description) return { ok: false, error: "description_required" };
  if (!wecomPushChatId && !pushEmailTo) return { ok: false, error: "delivery_required" };

  let slug = slugify(String(formData.get("slug") ?? ""));
  let name = nameInput;

  const partner = partnerId
    ? await db.partner.findUnique({ where: { id: partnerId }, select: { name: true } })
    : null;
  if (partnerId && !partner) return { ok: false, error: "partner_not_found" };

  if (!slug) slug = defaultAutomationSlug(partner?.name || description.slice(0, 24));
  if (!name) name = defaultAutomationName(description, "zh");

  if (id) {
    const existingSlug = await db.agent.findFirst({ where: { slug, id: { not: id } } });
    if (existingSlug) return { ok: false, error: "slug_exists" };
  } else {
    slug = await ensureUniqueAutomationSlug(slug);
  }

  const draft: AutomationBuilderDraft = {
    slug,
    name,
    description,
    taskMd: "",
    triggerType: "SCHEDULE",
    cronExpr,
    timezone,
    validityDays: 7,
    variables: [],
    maxIterations: 30,
    timeoutMinutes: 60,
    notifyOnSuccess,
    notifyOnFailure,
    wecomPushChatId: wecomPushChatId ?? "",
    webhookUrl: "",
    pushEmailTo: pushEmailTo ?? "",
    partnerId,
    rationale: "",
    questionnaire: [],
    missingSkillNotes: [],
  };

  const schedule = cronToAgentSchedule(cronExpr);
  const { taskMd, variables } = await resolveAutomationDraftContent(draft, { locale: "zh" });
  const instructions = buildAutomationInstructions(taskMd, variables);

  const data = {
    name,
    slug,
    icon: "⚡",
    description,
    instructions,
    skills: JSON.stringify([...DEFAULT_AUTOMATION_SKILLS]),
    trigger: "SCHEDULE" as const,
    frequency: schedule.frequency,
    runHour: schedule.runHour,
    runWeekday: schedule.runWeekday,
    cronExpr,
    timezone,
    validityDays: 7,
    variables: JSON.stringify(variables),
    maxIterations: 30,
    timeoutMinutes: 60,
    notifyOnSuccess,
    notifyOnFailure,
    wecomPushChatId,
    pushEmailTo,
    webhookUrl: null,
    scopeType: partnerId ? ("PARTNER" as const) : ("ALL" as const),
    partnerId: partnerId || null,
    shared: true,
    enabled,
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
    agent.trigger === "SCHEDULE" && agent.enabled ? computeNextRunAt(agent) : null;
  await db.agent.update({ where: { id: agentId }, data: { nextRunAt } });

  return { ok: true, agentId };
}

/** 保存自动化配置（不跳转）— 供「保存并运行」使用 */
export async function saveAutomationAction(formData: FormData): Promise<PersistAutomationResult> {
  const result = await persistAutomationFromFormData(formData);
  if (result.ok) {
    revalidatePath("/automations");
    revalidatePath(`/automations/${result.agentId}`);
    revalidatePath("/ai");
  }
  return result;
}

export async function createAutomationFromBuilderAction(formData: FormData) {
  const user = await requireUser();
  const raw = String(formData.get("draft") ?? "");
  if (!raw) redirect("/automations/new?error=empty_draft");

  let draft: AutomationBuilderDraft;
  try {
    draft = JSON.parse(raw) as AutomationBuilderDraft;
  } catch {
    redirect("/automations/new?error=invalid_draft");
  }

  if (!isAutomationDraftReady(draft)) redirect("/automations/new?error=not_ready");

  try {
    const created = await createAutomationFromDraft(draft, user.id, { locale: "zh" });
    revalidatePath("/automations");
    revalidatePath("/ai");
    redirect(`/automations/${created.id}`);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    console.error("[createAutomationFromBuilderAction]", e);
    redirect("/automations/new?error=create_failed");
  }
}

export async function upsertAutomationAction(formData: FormData) {
  const result = await persistAutomationFromFormData(formData);
  if (!result.ok) return;
  revalidatePath("/automations");
  revalidatePath("/ai");
  redirect(`/automations/${result.agentId}`);
}

export async function toggleAutomationAction(agentId: string) {
  await requireUser();
  const a = await db.agent.findUniqueOrThrow({ where: { id: agentId, isAutomation: true } });
  const enabled = !a.enabled;
  const nextRunAt =
    enabled && a.trigger === "SCHEDULE" ? computeNextRunAt(a) : null;
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
