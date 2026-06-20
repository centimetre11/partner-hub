import type { TraceEmitter } from "./ai-trace";
import type { IntakeMessage, IntakeScope } from "./ai-intake";
import { runProposeTurn, shouldUseProposeMode, isTodoListQueryIntent } from "./ai-intake";
import { shouldUseAgentBuilderMode } from "./agent-builder-intent";
import { runAgentBuilderTurn, type AgentBuilderMessage } from "./agent-builder";
import { runQueryAssistant, type AssistantLocale } from "./assistant-core";
import type { Locale } from "./i18n/locale";

export type AssistantQueryResult = {
  mode: "query";
  reply: string;
  actions?: string[];
};

export type AssistantAgentBuilderResult = Awaited<ReturnType<typeof runAgentBuilderTurn>> & {
  mode: "agent_builder";
};

export type AssistantTurnResult =
  | AssistantQueryResult
  | Awaited<ReturnType<typeof runProposeTurn>>
  | AssistantAgentBuilderResult;

function toAgentBuilderMessages(messages: IntakeMessage[]): AgentBuilderMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

/** Route assistant / WeCom messages: AgentBuilder > Propose > Query */
export async function runAssistantTurn(opts: {
  messages: IntakeMessage[];
  userId: string;
  partnerId?: string;
  partnerName?: string;
  locale: Locale | AssistantLocale;
  feature: string;
  emit?: TraceEmitter;
  /** When true, always use propose mode (e.g. ongoing WeCom draft session) */
  forcePropose?: boolean;
  /** When true, always use agent builder mode (e.g. ongoing WeCom agent draft) */
  forceAgentBuilder?: boolean;
  /** Prior turn scope — hint for AI continuity, not a hard lock */
  previousScope?: IntakeScope;
  /** Context hint injected into agent builder (WeCom group/partner binding) */
  agentBuilderContext?: string;
}): Promise<AssistantTurnResult> {
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  const todoListQuery = lastUser ? isTodoListQueryIntent(lastUser.content) : false;
  const useAgentBuilder =
    !todoListQuery && (opts.forceAgentBuilder || shouldUseAgentBuilderMode(opts.messages));
  const usePropose =
    !todoListQuery && !useAgentBuilder && (opts.forcePropose || shouldUseProposeMode(opts.messages));

  if (useAgentBuilder) {
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
      locale: opts.locale as Locale,
    });
    return { ...turn, mode: "agent_builder" };
  }

  if (usePropose) {
    return runProposeTurn({
      messages: opts.messages,
      partnerId: opts.partnerId,
      partnerName: opts.partnerName,
      userId: opts.userId,
      emit: opts.emit,
      locale: opts.locale as Locale,
      previousScope: opts.previousScope,
    });
  }

  const result = await runQueryAssistant(opts.messages, opts.userId, {
    locale: opts.locale as AssistantLocale,
    feature: opts.feature,
    emit: opts.emit,
  });
  return { mode: "query", reply: result.reply, actions: result.actions };
}
