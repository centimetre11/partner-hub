"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { db } from "./db";
import { requireUser } from "./session";
import { computeNextRunAt } from "./agent-runner";
import { cronToAgentSchedule } from "./cron";
import { createAutomationFromDraft, buildAutomationInstructions, ensureUniqueAutomationSlug } from "./automation-create";
import { isAutomationDraftReady } from "./builder-context-prompt";
import {
  defaultAutomationName,
  defaultAutomationSlug,
  resolveAutomationRuntimeSkills,
  buildAutomationVariables,
  pickAutomationTaskMd,
  inferDueWithinDays,
} from "./automation-push";
import {
  parseAutomationQuery,
  serializeAutomationQuery,
  describeAutomationQuery,
  buildStructuredInstructions,
  resolveQueryRuntimeSkills,
  DEFAULT_AUTOMATION_QUERY,
} from "./automation-query";
import { hasAutomationDeliveryChannel } from "./automation-delivery";
import type { AutomationBuilderDraft, AutomationVariable } from "./automation-builder-types";

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
  const cronExpr = String(formData.get("cronExpr") ?? "0 9 * * *").trim();
  const timezone = String(formData.get("timezone") ?? "Asia/Shanghai").trim();
  const wecomPushChatId = String(formData.get("wecomPushChatId") ?? "").trim() || null;
  const pushEmailTo = String(formData.get("pushEmailTo") ?? "").trim() || null;
  const pushWecomAppTo = String(formData.get("pushWecomAppTo") ?? "").trim() || null;
  const notifyOnSuccess = formData.get("notifyOnSuccess") !== "off";
  const notifyOnFailure = formData.get("notifyOnFailure") === "on";
  const enabledInput = formData.get("enabled");
  const enabled =
    enabledInput === "on" || enabledInput === "off" ? enabledInput === "on" : true;
  const nameInput = String(formData.get("name") ?? "").trim();

  const query =
    parseAutomationQuery({
      source: formData.get("source"),
      scope: formData.get("scope"),
      partnerId: formData.get("partnerId"),
      customerId: formData.get("customerId"),
      assigneeId: formData.get("assigneeId"),
      dueFilter: formData.get("dueFilter"),
      dueWithinDays: formData.get("dueWithinDays"),
      opportunityStatus: formData.get("opportunityStatus"),
      aiGoal: formData.get("aiGoal"),
    }) ?? { ...DEFAULT_AUTOMATION_QUERY };

  if (!hasAutomationDeliveryChannel({ wecomPushChatId, pushEmailTo, pushWecomAppTo }))
    return { ok: false, error: "delivery_required" };
  if (query.scope === "partner" && !query.partnerId) return { ok: false, error: "partner_required" };
  if (query.scope === "customer" && !query.customerId) return { ok: false, error: "customer_required" };
  if (query.source === "ai" && !query.aiGoal) return { ok: false, error: "goal_required" };

  let partnerName = "";
  let customerName = "";
  let assigneeName = "";
  if (query.partnerId) {
    const p = await db.partner.findUnique({ where: { id: query.partnerId }, select: { name: true } });
    if (!p) return { ok: false, error: "partner_not_found" };
    partnerName = p.name;
  }
  if (query.customerId) {
    const c = await db.customer.findUnique({ where: { id: query.customerId }, select: { name: true } });
    if (!c) return { ok: false, error: "customer_not_found" };
    customerName = c.name;
  }
  if (query.assigneeId) {
    const u = await db.user.findUnique({ where: { id: query.assigneeId }, select: { name: true } });
    assigneeName = u?.name ?? "";
  }
  const names = { partnerName, customerName, assigneeName };

  const description =
    query.source === "ai" ? query.aiGoal!.trim() : describeAutomationQuery(query, names, "zh");

  let slug = slugify(String(formData.get("slug") ?? ""));
  let name = nameInput;
  if (!slug) slug = defaultAutomationSlug(partnerName || customerName || description.slice(0, 24));
  if (!name) name = defaultAutomationName(description, "zh");

  if (id) {
    const existingSlug = await db.agent.findFirst({ where: { slug, id: { not: id } } });
    if (existingSlug) return { ok: false, error: "slug_exists" };
  } else {
    slug = await ensureUniqueAutomationSlug(slug);
  }

  let instructions: string;
  let skills: string[];
  let variables: AutomationVariable[] = [];

  if (query.source === "ai") {
    const goal = query.aiGoal!.trim();
    const dueWithinDays = inferDueWithinDays(goal, query.dueWithinDays);
    variables = buildAutomationVariables({
      goal,
      partnerId: query.partnerId,
      partnerName,
      dueWithinDays,
      wecomPushChatId: wecomPushChatId ?? "",
      pushEmailTo: pushEmailTo ?? "",
      pushWecomAppTo: pushWecomAppTo ?? "",
      locale: "zh",
    });
    const taskMd = pickAutomationTaskMd({
      goal,
      partnerId: query.partnerId,
      partnerName: partnerName || undefined,
      dueWithinDays,
      wecomPushChatId: wecomPushChatId ?? "",
      pushEmailTo: pushEmailTo ?? "",
      pushWecomAppTo: pushWecomAppTo ?? "",
      locale: "zh",
    });
    instructions = buildAutomationInstructions(taskMd, variables);
    skills = resolveAutomationRuntimeSkills({ wecomPushChatId, pushEmailTo, pushWecomAppTo });
  } else {
    instructions = buildStructuredInstructions(query, names, "zh");
    skills = resolveQueryRuntimeSkills(query, { wecomPushChatId, pushEmailTo, pushWecomAppTo });
  }

  const schedule = cronToAgentSchedule(cronExpr);
  const agentPartnerId = query.scope === "partner" ? query.partnerId! : null;

  const data = {
    name,
    slug,
    icon: "⚡",
    description,
    instructions,
    skills: JSON.stringify(skills),
    trigger: "SCHEDULE" as const,
    frequency: schedule.frequency,
    runHour: schedule.runHour,
    runWeekday: schedule.runWeekday,
    cronExpr,
    timezone,
    validityDays: 7,
    variables: JSON.stringify(variables),
    queryConfig: serializeAutomationQuery(query),
    maxIterations: 30,
    timeoutMinutes: 60,
    notifyOnSuccess,
    notifyOnFailure,
    wecomPushChatId,
    pushEmailTo,
    pushWecomAppTo,
    webhookUrl: null,
    scopeType: agentPartnerId ? ("PARTNER" as const) : ("ALL" as const),
    partnerId: agentPartnerId,
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
