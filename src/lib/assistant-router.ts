import type { TraceEmitter } from "./ai-trace";
import type { IntakeMessage, IntakeScope } from "./ai-intake";
import { runProposeTurn } from "./ai-intake";
import { shouldUseAgentBuilderMode } from "./agent-builder-intent";
import { runAgentBuilderTurn, type AgentBuilderMessage } from "./agent-builder";
import { runQueryAssistant, type AssistantLocale } from "./assistant-core";
import type { Locale } from "./i18n/locale";
import {
  buildIntentConfirmSession,
  formatIntentConfirmReply,
  needsIntentConfirm,
  routeFromConfirmedActionId,
  sourceTextForRouting,
  type IntentConfirmAlternative,
} from "./intake-intent-confirm";
import { resolveAssistantRoute, type ResolvedAssistantRoute } from "./intake-route-resolver";

export type AssistantQueryResult = {
  mode: "query";
  reply: string;
  actions?: string[];
};

export type AssistantIntentConfirmResult = {
  mode: "intent_confirm";
  reply: string;
  actionId: string;
  route: ResolvedAssistantRoute["route"];
  alternatives: IntentConfirmAlternative[];
};

export type AssistantAgentBuilderResult = Awaited<ReturnType<typeof runAgentBuilderTurn>> & {
  mode: "agent_builder";
};

export type AssistantTurnResult =
  | AssistantQueryResult
  | AssistantIntentConfirmResult
  | Awaited<ReturnType<typeof runProposeTurn>>
  | AssistantAgentBuilderResult;

function toAgentBuilderMessages(messages: IntakeMessage[]): AgentBuilderMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

function queryFeature(route: ResolvedAssistantRoute, base: string): string {
  if (route.route.mode === "query" && route.route.queryKind === "list_todos") {
    return `${base} · List todos`;
  }
  return base;
}

/** Route assistant / WeCom messages: AgentBuilder > Query > IntentConfirm > Propose */
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
  previousScope?: IntakeScope;
  agentBuilderContext?: string;
  /** User confirmed intent — skip intent confirm gate */
  confirmedActionId?: string;
  /** Skip intent confirm (e.g. continuing propose draft session) */
  skipIntentConfirm?: boolean;
}): Promise<AssistantTurnResult> {
  const locale = opts.locale as Locale;

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
    });
  }

  if (route.route.mode === "query") {
    const result = await runQueryAssistant(opts.messages, opts.userId, {
      locale: opts.locale as AssistantLocale,
      feature: queryFeature(route, opts.feature),
      emit: opts.emit,
    });
    return { mode: "query", reply: result.reply, actions: result.actions };
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
