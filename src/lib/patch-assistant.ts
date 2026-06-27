import type { ChatMessage } from "./ai";
import { runToolLoop } from "./ai-tool-loop";
import type { TraceEmitter } from "./ai-trace";
import { db } from "./db";
import type { FocusEntity, FocusPatchTarget } from "./focus-entity";
import type { Locale } from "./i18n/locale";
import { newSkillContext, runSkill, skillsToTools } from "./skills";

const PATCH_TOOLS: Record<FocusEntity["kind"], string[]> = {
  todo: ["update_todo"],
  opportunity: ["update_opportunity"],
  business_record: [],
  partner: ["update_partner"],
  contact: [],
};

async function loadFocusContext(focus: FocusEntity, targetId: string): Promise<string> {
  switch (focus.kind) {
    case "todo": {
      const t = await db.todoItem.findUnique({
        where: { id: targetId },
        include: { partner: true, assignee: true },
      });
      if (!t) return `Todo id=${targetId} not found.`;
      return [
        `Target todo id=${t.id}`,
        `Title: ${t.title}`,
        `Detail: ${t.detail ?? "(none)"}`,
        `Partner: ${t.partner?.name ?? "(none)"}`,
        `Assignee: ${t.assignee?.name ?? "(none)"} (assigneeId=${t.assigneeId ?? "null"})`,
        `Due: ${t.dueDate?.toISOString().slice(0, 10) ?? "(none)"}`,
        `Priority: ${t.priority}`,
        `Status: ${t.status}`,
      ].join("\n");
    }
    case "opportunity": {
      const o = await db.opportunity.findUnique({
        where: { id: targetId },
        include: { partner: true },
      });
      if (!o) return `Opportunity id=${targetId} not found.`;
      return [
        `Target opportunity id=${o.id}`,
        `Name: ${o.name}`,
        `Client: ${o.client ?? "(none)"}`,
        `Partner: ${o.partner?.name ?? "(none)"}`,
        `Stage: ${o.stage}`,
        `Amount: ${o.amount ?? "(none)"}`,
        `Next step: ${o.nextStep ?? "(none)"}`,
        `Status: ${o.status}`,
        `Notes: ${o.notes ?? "(none)"}`,
      ].join("\n");
    }
    case "partner": {
      const p = await db.partner.findUnique({ where: { id: targetId } });
      if (!p) return `Partner id=${targetId} not found.`;
      return `Target partner id=${p.id}\nName: ${p.name}\nStage: ${p.pipelineStage}\nTier: ${p.tier ?? "-"}`;
    }
    default:
      return `Entity kind=${focus.kind} id=${targetId}`;
  }
}

function buildPatchSystem(locale: Locale, entityContext: string): string {
  if (locale === "zh") {
    return `你是 Partner Hub 修改助手。用户已确认要修改下方已有记录，请根据用户指令调用工具直接更新，不要新建记录。
${entityContext}

规则：
1. 只改用户提到的字段；未提及的字段不要动。
2. 责任人/assignee 用 assigneeName 参数（姓名模糊匹配）。
3. 执行后用中文简要说明改了什么。`;
  }
  return `You are the Partner Hub patch assistant. The user confirmed modifying the record below — call the update tool with only the fields they asked to change.
${entityContext}

Rules:
1. Only update fields the user mentioned.
2. For assignee, use assigneeName (fuzzy name match).
3. Summarize what changed.`;
}

/** Execute a confirmed patch against a focused entity. */
export async function runPatchAssistant(opts: {
  focus: FocusEntity;
  targetId: string;
  targetLabel: string;
  instruction: string;
  userId: string;
  locale: Locale;
  emit?: TraceEmitter;
  feature?: string;
}): Promise<{ reply: string; actions: string[] }> {
  const tools = PATCH_TOOLS[opts.focus.kind];
  if (!tools.length) {
    return {
      reply:
        opts.locale === "zh"
          ? `暂不支持直接修改「${opts.focus.kind}」类记录，请用录入流程。`
          : `Direct patch not supported for ${opts.focus.kind}.`,
      actions: [],
    };
  }

  const entityContext = await loadFocusContext(opts.focus, opts.targetId);
  const chat: ChatMessage[] = [
    { role: "system", content: buildPatchSystem(opts.locale, entityContext) },
    {
      role: "user",
      content: `请修改「${opts.targetLabel}」：${opts.instruction}`,
    },
  ];
  const ctx = newSkillContext({ mode: "assistant", userId: opts.userId });
  const toolDefs = await skillsToTools(tools);

  const content = await runToolLoop({
    chat,
    tools: toolDefs,
    feature: opts.feature ?? "Patch assistant",
    userId: opts.userId,
    maxSteps: 4,
    requireToolsOnFirstTurn: true,
    emit: opts.emit,
    executeTool: async (tc) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        /* ignore */
      }
      if (!args.todoId && opts.focus.kind === "todo") args.todoId = opts.targetId;
      if (!args.opportunityId && opts.focus.kind === "opportunity") args.opportunityId = opts.targetId;
      if (!args.name && opts.focus.kind === "partner") {
        args.name = opts.focus.partnerName ?? opts.targetLabel;
      }
      return runSkill(tc.function.name, args, ctx);
    },
  });

  return {
    reply: content?.trim() || (opts.locale === "zh" ? "已完成修改。" : "Update applied."),
    actions: ctx.actions,
  };
}

/** Execute multiple confirmed patches in order (compound follow-up). */
export async function runBatchPatchAssistant(opts: {
  focus: FocusEntity;
  patches: FocusPatchTarget[];
  userId: string;
  locale: Locale;
  emit?: TraceEmitter;
  feature?: string;
}): Promise<{ reply: string; actions: string[] }> {
  if (!opts.patches.length) {
    return {
      reply: opts.locale === "zh" ? "没有可执行的修改。" : "No patches to apply.",
      actions: [],
    };
  }
  const replies: string[] = [];
  const actions: string[] = [];
  for (const patch of opts.patches) {
    const result = await runPatchAssistant({
      focus: opts.focus,
      targetId: patch.id,
      targetLabel: patch.label,
      instruction: patch.instruction,
      userId: opts.userId,
      locale: opts.locale,
      emit: opts.emit,
      feature: opts.feature,
    });
    replies.push(result.reply);
    actions.push(...result.actions);
  }
  return { reply: replies.join("\n\n"), actions };
}
