import type { ChatMessage, ToolCall, ToolDef } from "./ai";
import { chatCompletion } from "./ai";
import {
  emitReplyChunks,
  emitTraceResultChunks,
  nextTraceId,
  summarizeToolResult,
  toolTraceStep,
  type TraceEmitter,
} from "./ai-trace";

export type ToolLoopOptions = {
  chat: ChatMessage[];
  tools: (ToolDef | Record<string, unknown>)[];
  temperature?: number;
  feature: string;
  userId?: string;
  maxSteps?: number;
  /** Force specific API config (e.g. web search) */
  apiConfigId?: string;
  emit?: TraceEmitter;
  /** Stream final reply to frontend (default true). Set false for research/JSON output */
  streamReply?: boolean;
  onToolDone?: (tc: ToolCall, result: string) => void | Promise<void>;
  executeTool: (tc: ToolCall) => Promise<string>;
};

function parseToolArgs(tc: ToolCall): Record<string, unknown> {
  if (tc.function.name === "$web_search") {
    try {
      return JSON.parse(tc.function.arguments || "{}");
    } catch {
      return { query: tc.function.arguments };
    }
  }
  try {
    return JSON.parse(tc.function.arguments || "{}");
  } catch {
    return {};
  }
}

export async function runToolLoop(opts: ToolLoopOptions): Promise<string | null> {
  const max = opts.maxSteps ?? 8;
  let lastContent: string | null = null;

  const streamReply = opts.streamReply !== false;

  for (let i = 0; i < max; i++) {
    let streamed = "";
    // True streaming: clear reply buffer each round to avoid leftover intermediate text from tool rounds
    if (opts.emit && streamReply) opts.emit({ event: "reply_reset" });

    const { content, toolCalls, volcengineReplay } = await chatCompletion(opts.chat, {
      tools: opts.tools,
      temperature: opts.temperature ?? 0.3,
      feature: opts.feature,
      userId: opts.userId,
      apiConfigId: opts.apiConfigId,
      // True streaming: push text deltas to frontend while generating (query scenarios only; off for JSON)
      onDelta:
        opts.emit && streamReply
          ? (d) => {
              streamed += d;
              opts.emit!({ event: "reply_delta", delta: d });
            }
          : undefined,
    });
    lastContent = content;

    if (!toolCalls.length) {
      if (opts.emit && streamReply) {
        // Final reply: true streaming already pushed; if no deltas (fallback), simulate character-by-character
        if (!streamed && content?.trim()) {
          await emitReplyChunks(opts.emit, content.trim());
        } else {
          opts.emit({ event: "reply_done" });
        }
      } else if (opts.emit && content?.trim()) {
        // Non-streaming reply: emit as reasoning trace (reply handled by caller)
        const rid = nextTraceId("reason");
        const snippet = content.trim().length > 80 ? `${content.trim().slice(0, 77)}…` : content.trim();
        opts.emit({ event: "trace", step: { type: "reasoning", id: rid, content: snippet, status: "done" } });
      }
      return content;
    }

    // Tool round: retract streamed intermediate text and convert to reasoning trace
    if (opts.emit) {
      if (streamReply && streamed.trim()) opts.emit({ event: "reply_reset" });
      const reasoning = (streamed || content || "").trim();
      if (reasoning) {
        const rid = nextTraceId("reason");
        const snippet = reasoning.length > 80 ? `${reasoning.slice(0, 77)}…` : reasoning;
        opts.emit({
          event: "trace",
          step: { type: "reasoning", id: rid, content: snippet, status: "done" },
        });
      }
    }

    opts.chat.push({ role: "assistant", content: content ?? "", tool_calls: toolCalls, volcengineReplay });
    for (const tc of toolCalls) {
      const args = parseToolArgs(tc);
      const step = toolTraceStep(tc.function.name, args);
      opts.emit?.({ event: "trace", step });

      try {
        const result = await opts.executeTool(tc);
        const summary = summarizeToolResult(tc.function.name, result);
        await emitTraceResultChunks(opts.emit, step.id, summary);
        opts.emit?.({
          event: "trace_patch",
          id: step.id,
          patch: { status: "done" },
        });
        // Proposal extraction does not block next tool/stream output
        void opts.onToolDone?.(tc, result);
        opts.chat.push({ role: "tool", content: result, tool_call_id: tc.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        opts.emit?.({
          event: "trace_patch",
          id: step.id,
          patch: { status: "error", error: msg.slice(0, 120) },
        });
        opts.chat.push({ role: "tool", content: `Error: ${msg}`, tool_call_id: tc.id });
      }
    }
  }
  return lastContent;
}
