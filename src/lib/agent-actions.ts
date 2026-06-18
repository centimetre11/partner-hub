"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireUser } from "./session";
import { computeNextRunAt } from "./agent-runner";
import { applyProposal } from "./proposals";
import { getLocale } from "./i18n/locale-server";
import type { AgentBuilderDraft } from "./agent-builder";
import type { AgentFieldProposal } from "./skills";

// ============ Agent CRUD ============

export async function upsertAgentAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const trigger = String(formData.get("trigger") ?? "MANUAL");
  const frequency = String(formData.get("frequency") ?? "DAILY");
  const data = {
    name: String(formData.get("name") ?? "").trim(),
    icon: String(formData.get("icon") ?? "🤖").trim() || "🤖",
    description: String(formData.get("description") ?? "") || null,
    instructions: String(formData.get("instructions") ?? "").trim(),
    skills: JSON.stringify(formData.getAll("skills").map(String)),
    trigger,
    frequency: trigger === "SCHEDULE" ? frequency : null,
    runHour: parseInt(String(formData.get("runHour") ?? "9"), 10) || 9,
    runWeekday: parseInt(String(formData.get("runWeekday") ?? "1"), 10) || 1,
    scopeType: String(formData.get("scopeType") ?? "ALL"),
    partnerId: String(formData.get("partnerId") ?? "") || null,
    shared: formData.get("shared") === "on",
    enabled: formData.get("enabled") !== "off",
    webhookUrl: String(formData.get("webhookUrl") ?? "").trim() || null,
  };
  if (!data.name || !data.instructions) return;
  if (data.scopeType === "PARTNER" && !data.partnerId) data.scopeType = "ALL";

  const skillIds = formData.getAll("skillIds").map(String);

  let agentId = id;
  if (id) {
    const updated = await db.agent.update({ where: { id }, data });
    await db.agent.update({
      where: { id },
      data: { nextRunAt: updated.trigger === "SCHEDULE" ? computeNextRunAt(updated) : null },
    });
  } else {
    const created = await db.agent.create({ data: { ...data, createdById: user.id } });
    agentId = created.id;
    if (created.trigger === "SCHEDULE") {
      await db.agent.update({ where: { id: created.id }, data: { nextRunAt: computeNextRunAt(created) } });
    }
  }

  await db.agentSkill.deleteMany({ where: { agentId } });
  for (const skillId of skillIds) {
    await db.agentSkill.create({ data: { agentId, skillId } });
  }
  revalidatePath("/agents");
  redirect(`/agents/${agentId}`);
}

export async function createAgentFromBuilderAction(formData: FormData) {
  const user = await requireUser();
  const raw = String(formData.get("draft") ?? "");
  if (!raw) return;
  const draft = JSON.parse(raw) as AgentBuilderDraft;
  const trigger = draft.trigger === "SCHEDULE" ? "SCHEDULE" : "MANUAL";
  const scopeType = draft.scopeType === "PARTNER" && draft.partnerId ? "PARTNER" : "ALL";
  const data = {
    name: draft.name.trim(),
    icon: draft.icon?.trim() || "🤖",
    description: draft.description?.trim() || null,
    instructions: draft.instructions.trim(),
    skills: JSON.stringify(Array.isArray(draft.skills) ? draft.skills : []),
    trigger,
    frequency: trigger === "SCHEDULE" ? draft.frequency : null,
    runHour: Number.isInteger(draft.runHour) ? draft.runHour : 9,
    runWeekday: Number.isInteger(draft.runWeekday) ? draft.runWeekday : 1,
    scopeType,
    partnerId: scopeType === "PARTNER" ? draft.partnerId : null,
    shared: draft.shared !== false,
    enabled: true,
    webhookUrl: draft.webhookUrl?.trim() || null,
    createdById: user.id,
  };
  if (!data.name || !data.instructions) return;

  const created = await db.agent.create({ data });
  if (created.trigger === "SCHEDULE") {
    await db.agent.update({ where: { id: created.id }, data: { nextRunAt: computeNextRunAt(created) } });
  }

  const skillIds = Array.isArray(draft.skillIds) ? draft.skillIds : [];
  for (const skillId of skillIds) {
    await db.agentSkill.create({ data: { agentId: created.id, skillId } });
  }
  revalidatePath("/agents");
  revalidatePath("/ai");
  redirect(`/agents/${created.id}`);
}

export async function deleteAgentAction(agentId: string) {
  await requireUser();
  await db.agent.delete({ where: { id: agentId } });
  revalidatePath("/agents");
  redirect("/agents");
}

export async function toggleAgentAction(agentId: string) {
  await requireUser();
  const a = await db.agent.findUniqueOrThrow({ where: { id: agentId } });
  await db.agent.update({
    where: { id: agentId },
    data: {
      enabled: !a.enabled,
      nextRunAt: !a.enabled && a.trigger === "SCHEDULE" ? computeNextRunAt(a) : a.nextRunAt,
    },
  });
  revalidatePath("/agents");
  revalidatePath(`/agents/${agentId}`);
}

// 从模板或共享 Agent 克隆一个自己的
export async function cloneAgentAction(sourceId: string) {
  const user = await requireUser();
  const src = await db.agent.findUniqueOrThrow({ where: { id: sourceId } });
  const created = await db.agent.create({
    data: {
      name: src.isTemplate ? src.name : `${src.name} (copy)`,
      icon: src.icon,
      description: src.description,
      instructions: src.instructions,
      skills: src.skills,
      trigger: src.trigger,
      frequency: src.frequency,
      runHour: src.runHour,
      runWeekday: src.runWeekday,
      scopeType: src.scopeType,
      partnerId: src.partnerId,
      shared: true,
      enabled: true,
      isTemplate: false,
      createdById: user.id,
    },
  });
  if (created.trigger === "SCHEDULE") {
    await db.agent.update({ where: { id: created.id }, data: { nextRunAt: computeNextRunAt(created) } });
  }
  const srcLinks = await db.agentSkill.findMany({ where: { agentId: sourceId } });
  for (const link of srcLinks) {
    await db.agentSkill.create({ data: { agentId: created.id, skillId: link.skillId } });
  }
  revalidatePath("/agents");
  redirect(`/agents/${created.id}`);
}

/** 从模板克隆并绑定到指定伙伴 */
export async function clonePartnerAgentAction(templateId: string, partnerId: string) {
  const user = await requireUser();
  const src = await db.agent.findUniqueOrThrow({ where: { id: templateId } });
  const created = await db.agent.create({
    data: {
      name: src.name,
      icon: src.icon,
      description: src.description,
      instructions: src.instructions,
      skills: src.skills,
      trigger: src.trigger,
      frequency: src.frequency,
      runHour: src.runHour,
      runWeekday: src.runWeekday,
      scopeType: "PARTNER",
      partnerId,
      shared: true,
      enabled: true,
      isTemplate: false,
      createdById: user.id,
    },
  });
  const links = await db.agentSkill.findMany({ where: { agentId: templateId } });
  for (const link of links) {
    await db.agentSkill.create({ data: { agentId: created.id, skillId: link.skillId } });
  }
  if (created.trigger === "SCHEDULE") {
    await db.agent.update({ where: { id: created.id }, data: { nextRunAt: computeNextRunAt(created) } });
  }
  revalidatePath(`/partners/${partnerId}`);
  revalidatePath("/agents");
  redirect(`/agents/${created.id}`);
}

// ============ 收件箱 ============

export async function markReadAction(notificationId: string) {
  await requireUser();
  await db.notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });
  revalidatePath("/inbox");
  revalidatePath("/");
}

export async function markAllReadAction() {
  await requireUser();
  await db.notification.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/inbox");
  revalidatePath("/");
}

// 应用 Agent 生成的档案变更提案（人工确认）
export async function applyAgentProposalAction(notificationId: string) {
  const user = await requireUser();
  const n = await db.notification.findUniqueOrThrow({ where: { id: notificationId } });
  if (!n.proposal || n.appliedAt) return;
  const p: AgentFieldProposal = JSON.parse(n.proposal);
  const locale = await getLocale();
  await applyProposal({
    partnerId: p.partnerId,
    proposal: {
      summaryTitle: `Agent proposal: ${n.title}`,
      summary: "Agent profile change proposal applied after manual confirmation.",
      fieldUpdates: p.fieldUpdates,
      contacts: [],
      opportunities: [],
      todos: [],
      signals: [],
    },
    userId: user.id,
    eventType: "CHANGE",
    locale,
  });
  await db.notification.update({
    where: { id: notificationId },
    data: { appliedAt: new Date(), readAt: n.readAt ?? new Date() },
  });
  revalidatePath("/inbox");
  revalidatePath(`/partners/${p.partnerId}`);
  revalidatePath("/partners");
}
