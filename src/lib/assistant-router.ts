import type { TraceEmitter } from "./ai-trace";
import type { IntakeMessage, IntakeScope } from "./ai-intake";
import { runProposeTurn } from "./ai-intake";
import { shouldUseAgentBuilderMode } from "./agent-builder-intent";
import { shouldUseAutomationBuilderMode } from "./automation-builder-intent";
import { runAgentBuilderTurn, type AgentBuilderMessage } from "./agent-builder";
import { runAutomationBuilderTurn, type AutomationBuilderMessage } from "./automation-builder";
import { runQueryAssistant, type AssistantLocale } from "./assistant-core";
import {
  buildFocusFromListItems,
  extractListItemsFromFormattedReply,
  focusIsFresh,
  inferFocusKindFromQueryAction,
  resolveFocusTarget,
  type FocusEntity,
} from "./focus-entity";
import type { Locale } from "./i18n/locale";
import {
  buildIntentConfirmSession,
  formatIntentConfirmReply,
  needsIntentConfirm,
  routeFromConfirmedActionId,
  sourceTextForRouting,
  type IntentConfirmAlternative,
} from "./intake-intent-confirm";
import { normalizeActionText } from "./intake-action-registry";
import { resolveAssistantRoute, type ResolvedAssistantRoute } from "./intake-route-resolver";
import { runPatchAssistant } from "./patch-assistant";
import { db } from "./db";

export type AssistantQueryResult = {
  mode: "query";
  reply: string;
  actions?: string[];
  /** Updated focus after a list query — client/session should persist */
  focus?: FocusEntity | null;
  lastQueryActionId?: string;
};

export type AssistantIntentConfirmResult = {
  mode: "intent_confirm";
  reply: string;
  actionId: string;
  route: ResolvedAssistantRoute["route"];
  alternatives: IntentConfirmAlternative[];
  focus?: FocusEntity;
  patchInstruction?: string;
  patchTargetId?: string;
  patchTargetLabel?: string;
};

export type AssistantAgentBuilderResult = Awaited<ReturnType<typeof runAgentBuilderTurn>> & {
  mode: "agent_builder";
};

export type AssistantAutomationBuilderResult = Awaited<ReturnType<typeof runAutomationBuilderTurn>> & {
  mode: "automation_builder";
};

export type AssistantTurnResult =
  | AssistantQueryResult
  | AssistantIntentConfirmResult
  | Awaited<ReturnType<typeof runProposeTurn>>
  | AssistantAgentBuilderResult
  | AssistantAutomationBuilderResult;

function toAgentBuilderMessages(messages: IntakeMessage[]): AgentBuilderMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

function toAutomationBuilderMessages(messages: IntakeMessage[]): AutomationBuilderMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

function queryFeature(route: ResolvedAssistantRoute, base: string): string {
  if (route.route.mode !== "query") return base;
  const kind = route.route.queryKind;
  if (kind === "list_todos") return `${base} · List todos`;
  if (kind === "list_opportunities") return `${base} · List opportunities`;
  if (kind === "list_business_records") return `${base} · List business records`;
  return base;
}

function lastUserText(messages: IntakeMessage[]): string {
  return normalizeActionText(
    [...messages].reverse().find((m) => m.role === "user")?.content ?? ""
  );
}

function buildFocusAfterQuery(opts: {
  actionId: string;
  reply: string;
  partnerId?: string;
  partnerName?: string;
}): FocusEntity | null {
  const kind = inferFocusKindFromQueryAction(opts.actionId);
  if (!kind) return null;
  const items = extractListItemsFromFormattedReply(opts.reply);
  return buildFocusFromListItems({
    kind,
    items,
    partnerId: opts.partnerId,
    partnerName: opts.partnerName,
  });
}

/** Load focus items from DB when reply text lacks [id:…] lines (LLM reformatted output). */
async function buildFocusAfterQueryAsync(opts: {
  actionId: string;
  reply: string;
  partnerId?: string;
  partnerName?: string;
}): Promise<FocusEntity | null> {
  const fromReply = buildFocusAfterQuery(opts);
  if (fromReply?.listItems?.length || fromReply?.id) return fromReply;

  const kind = inferFocusKindFromQueryAction(opts.actionId);
  if (!kind) return null;

  if (kind === "todo") {
    const todos = await db.todoItem.findMany({
      where: {
        status: "OPEN",
        ...(opts.partnerId ? { partnerId: opts.partnerId } : {}),
      },
      orderBy: { dueDate: "asc" },
      take: 50,
    });
    return buildFocusFromListItems({
      kind,
      items: todos.map((t) => ({ id: t.id, label: t.title })),
      partnerId: opts.partnerId,
      partnerName: opts.partnerName,
    });
  }
  if (kind === "opportunity" && opts.partnerId) {
    const rows = await db.opportunity.findMany({
      where: { partnerId: opts.partnerId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });
    return buildFocusFromListItems({
      kind,
      items: rows.map((o) => ({ id: o.id, label: o.name })),
      partnerId: opts.partnerId,
      partnerName: opts.partnerName,
    });
  }
  if (kind === "business_record" && opts.partnerId) {
    const rows = await db.businessRecord.findMany({
      where: { partnerId: opts.partnerId },
      orderBy: { occurredAt: "desc" },
      take: 20,
    });
    return buildFocusFromListItems({
      kind,
      items: rows.map((r) => ({ id: r.id, label: r.title })),
      partnerId: opts.partnerId,
      partnerName: opts.partnerName,
    });
  }
  return fromReply;
}

function disambiguationReply(
  items: Array<{ id: string; label: string }>,
  locale: Locale
): string {
  if (locale === "zh") {
    return (
      "有多条记录，请指明要改哪一条：\n" +
      items.map((it, i) => `${i + 1}️⃣ ${it.label}`).join("\n") +
      "\n\n回复 @我 **1** / **2** … 或包含标题关键词。"
    );
  }
  return (
    "Multiple records match — which one?\n" +
    items.map((it, i) => `${i + 1}. ${it.label}`).join("\n")
  );
}

/** Route assistant / WeCom messages: AgentBuilder > FocusPatch > Query > IntentConfirm > Propose */
export async function runAssistantTurn(opts: {
  messages: IntakeMessage[];
  userId: string;
  partnerId?: string;
  partnerName?: string;
  locale: Locale | AssistantLocale;
  feature: string;
  emit?: TraceEmitter;
  forcePropose?: boolean;
  forceAgentBuilder?: boolean;
  forceAutomationBuilder?: boolean;
  previousScope?: IntakeScope;
  agentBuilderContext?: string;
  confirmedActionId?: string;
  skipIntentConfirm?: boolean;
  /** Active focus from prior list/query in this chat */
  focus?: FocusEntity | null;
  /** Execute patch after user confirmed (from intent session) */
  patchTargetId?: string;
  patchTargetLabel?: string;
  patchInstruction?: string;
}): Promise<AssistantTurnResult> {
  const locale = opts.locale as Locale;

  if (opts.forceAutomationBuilder || shouldUseAutomationBuilderMode(opts.messages)) {
    const turn = await runAutomationBuilderTurn({
      messages: toAutomationBuilderMessages(opts.messages),
      userId: opts.userId,
      emit: opts.emit,
      locale,
    });
    return { ...turn, mode: "automation_builder" };
  }

  if (opts.forceAgentBuilder || shouldUseAgentBuilderMode(opts.messages)) {
    const builderMessages = toAgentBuilderMessages(opts.messages);
    if (opts.agentBuilderContext && builderMessages.length) {
      const last = builderMessages[builderMessages.length - 1];
      if (last.role === "user") {
        builderMessages[builderMessages.length - 1] = {
          role: "user",
          content: last.content + `\n\n（${opts.agentBuilderContext}）`,
        };
      }
    }
    const turn = await runAgentBuilderTurn({
      messages: builderMessages,
      userId: opts.userId,
      emit: opts.emit,
      locale,
    });
    return { ...turn, mode: "agent_builder" };
  }

  // Confirmed patch execution (after intent confirm)
  if (
    opts.patchTargetId &&
    opts.patchInstruction &&
    opts.focus &&
    opts.confirmedActionId?.startsWith("patch.")
  ) {
    const patch = await runPatchAssistant({
      focus: opts.focus,
      targetId: opts.patchTargetId,
      targetLabel: opts.patchTargetLabel ?? opts.focus.label,
      instruction: opts.patchInstruction,
      userId: opts.userId,
      locale,
      emit: opts.emit,
      feature: opts.feature,
    });
    return {
      mode: "query",
      reply: patch.reply,
      actions: patch.actions,
      focus: { ...opts.focus, id: opts.patchTargetId, label: opts.patchTargetLabel ?? opts.focus.label, updatedAt: Date.now() },
    };
  }

  let route: ResolvedAssistantRoute;
  if (opts.confirmedActionId) {
    const confirmed = routeFromConfirmedActionId(opts.confirmedActionId);
    if (!confirmed) {
      route = await resolveAssistantRoute({
        messages: opts.messages,
        partnerId: opts.partnerId,
        partnerName: opts.partnerName,
        userId: opts.userId,
        locale,
        previousScope: opts.previousScope,
        focus: opts.focus,
      });
    } else {
      route = confirmed;
    }
  } else {
    route = await resolveAssistantRoute({
      messages: opts.messages,
      partnerId: opts.partnerId,
      partnerName: opts.partnerName,
      userId: opts.userId,
      locale,
      previousScope: opts.previousScope,
      focus: opts.focus,
    });
  }

  if (route.route.mode === "query") {
    const result = await runQueryAssistant(opts.messages, opts.userId, {
      locale: opts.locale as AssistantLocale,
      feature: queryFeature(route, opts.feature),
      emit: opts.emit,
      queryKind: route.route.queryKind,
    });
    const focus = await buildFocusAfterQueryAsync({
      actionId: route.actionId,
      reply: result.reply,
      partnerId: opts.partnerId,
      partnerName: opts.partnerName,
    });
    return {
      mode: "query",
      reply: result.reply,
      actions: result.actions,
      focus,
      lastQueryActionId: route.actionId,
    };
  }

  if (route.route.mode === "automation_builder") {
    const turn = await runAutomationBuilderTurn({
      messages: toAutomationBuilderMessages(opts.messages),
      userId: opts.userId,
      emit: opts.emit,
      locale,
    });
    return { ...turn, mode: "automation_builder" };
  }

  if (route.route.mode === "agent_builder") {
    const turn = await runAgentBuilderTurn({
      messages: toAgentBuilderMessages(opts.messages),
      userId: opts.userId,
      emit: opts.emit,
      locale,
    });
    return { ...turn, mode: "agent_builder" };
  }

  if (route.route.mode === "patch") {
    const instruction = lastUserText(opts.messages);
    if (!opts.focus || !focusIsFresh(opts.focus)) {
      return {
        mode: "query",
        reply:
          locale === "zh"
            ? "请先查询要修改的记录（如「有多少待办」「有哪些商机」），再说要改什么。"
            : "List the records first (e.g. todos/opportunities), then say what to change.",
        focus: null,
      };
    }
    const resolved = resolveFocusTarget(opts.focus, instruction);
    if (!resolved) {
      return {
        mode: "query",
        reply: locale === "zh" ? "找不到要修改的目标记录。" : "No target record to patch.",
        focus: opts.focus,
      };
    }
    if ("ambiguous" in resolved) {
      return {
        mode: "query",
        reply: disambiguationReply(resolved.ambiguous, locale),
        focus: opts.focus,
      };
    }
    if (
      needsIntentConfirm(route) &&
      !opts.confirmedActionId &&
      !opts.skipIntentConfirm
    ) {
      const sourceText = sourceTextForRouting(opts.messages);
      const session = buildIntentConfirmSession({
        route,
        sourceText,
        locale,
        partnerName: opts.partnerName,
        focus: opts.focus,
        patchInstruction: instruction,
        patchTargetId: resolved.id,
        patchTargetLabel: resolved.label,
      });
      return {
        mode: "intent_confirm",
        reply: formatIntentConfirmReply(session, locale),
        actionId: session.actionId,
        route: session.route,
        alternatives: session.alternatives,
        focus: opts.focus,
        patchInstruction: instruction,
        patchTargetId: resolved.id,
        patchTargetLabel: resolved.label,
      };
    }
  }

  if (
    route.route.mode === "propose" &&
    needsIntentConfirm(route) &&
    !opts.confirmedActionId &&
    !opts.skipIntentConfirm &&
    !opts.forcePropose
  ) {
    const sourceText = sourceTextForRouting(opts.messages);
    const session = buildIntentConfirmSession({
      route,
      sourceText,
      locale,
      partnerName: opts.partnerName,
    });
    return {
      mode: "intent_confirm",
      reply: formatIntentConfirmReply(session, locale),
      actionId: session.actionId,
      route: session.route,
      alternatives: session.alternatives,
    };
  }

  const scope =
    route.route.mode === "propose" ? route.route.scope : opts.previousScope ?? "todo";

  return runProposeTurn({
    messages: opts.messages,
    partnerId: opts.partnerId,
    partnerName: opts.partnerName,
    userId: opts.userId,
    emit: opts.emit,
    locale,
    scope,
    previousScope: opts.previousScope,
  });
}
