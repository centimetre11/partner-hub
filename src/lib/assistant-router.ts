import type { TraceEmitter } from "./ai-trace";
import type { IntakeMessage, IntakeScope } from "./ai-intake";
import { runProposeTurn, shouldUseProposeMode } from "./ai-intake";
import { runQueryAssistant, type AssistantLocale } from "./assistant-core";
import type { Locale } from "./i18n/locale";

export type AssistantQueryResult = {
  mode: "query";
  reply: string;
  actions?: string[];
};

export type AssistantTurnResult = AssistantQueryResult | Awaited<ReturnType<typeof runProposeTurn>>;

/** Route assistant / WeCom messages to Query or collaborative Agent (Propose) mode */
export async function runAssistantTurn(opts: {
  messages: IntakeMessage[];
  userId: string;
  partnerId?: string;
  locale: Locale | AssistantLocale;
  feature: string;
  emit?: TraceEmitter;
  /** When true, always use propose mode (e.g. ongoing WeCom draft session) */
  forcePropose?: boolean;
  /** Sticky scope for multi-turn propose sessions */
  proposeScope?: IntakeScope;
}): Promise<AssistantTurnResult> {
  const usePropose = opts.forcePropose || shouldUseProposeMode(opts.messages);
  if (usePropose) {
    return runProposeTurn({
      messages: opts.messages,
      partnerId: opts.partnerId,
      userId: opts.userId,
      emit: opts.emit,
      locale: opts.locale as Locale,
      scope: opts.proposeScope,
    });
  }
  const result = await runQueryAssistant(opts.messages, opts.userId, {
    locale: opts.locale as AssistantLocale,
    feature: opts.feature,
    emit: opts.emit,
  });
  return { mode: "query", reply: result.reply, actions: result.actions };
}
