import { db } from "./db";
import type { AgentBuilderDraft } from "./agent-builder";
import { computeNextRunAt } from "./agent-runner";

export type CreateAgentFromDraftOpts = {
  /** When deliveryMode=wecom_chat, push results to this chat */
  wecomPushChatId?: string;
};

export type CreateAgentResult = {
  id: string;
  name: string;
  nextRunAt: Date | null;
  trigger: string;
};

/** Create a runnable Agent from a builder draft (Web + WeCom shared) */
export async function createAgentFromDraft(
  draft: AgentBuilderDraft,
  userId: string,
  opts: CreateAgentFromDraftOpts = {}
): Promise<CreateAgentResult> {
  const trigger = draft.trigger === "SCHEDULE" ? "SCHEDULE" : "MANUAL";
  const scopeType = draft.scopeType === "PARTNER" && draft.partnerId ? "PARTNER" : "ALL";

  let webhookUrl = draft.webhookUrl?.trim() || null;
  let wecomPushChatId: string | null = null;

  if (draft.deliveryMode === "webhook") {
    webhookUrl = draft.webhookUrl?.trim() || null;
  } else if (draft.deliveryMode === "wecom_chat" && opts.wecomPushChatId?.trim()) {
    wecomPushChatId = opts.wecomPushChatId.trim();
  }

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
    webhookUrl,
    wecomPushChatId,
    createdById: userId,
  };

  if (!data.name || !data.instructions) {
    throw new Error("Agent name and instructions are required");
  }

  const created = await db.agent.create({ data });
  let nextRunAt: Date | null = null;

  if (created.trigger === "SCHEDULE") {
    nextRunAt = computeNextRunAt(created);
    await db.agent.update({ where: { id: created.id }, data: { nextRunAt } });
  }

  const skillIds = Array.isArray(draft.skillIds) ? draft.skillIds : [];
  for (const skillId of skillIds) {
    await db.agentSkill.create({ data: { agentId: created.id, skillId } });
  }

  return {
    id: created.id,
    name: created.name,
    nextRunAt,
    trigger: created.trigger,
  };
}
