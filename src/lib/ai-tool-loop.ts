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
  emit?: TraceEmitter;
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

  for (let i = 0; i < max; i++) {
    const { content, toolCalls, volcengineReplay } = await chatCompletion(opts.chat, {
      tools: opts.tools,
      temperature: opts.temperature ?? 0.3,
      feature: opts.feature,
      userId: opts.userId,
      onDelta: undefined,
    });
    lastContent = content;

    if (content?.trim() && opts.emit) {
      const rid = nextTraceId("reason");
      const snippet = content.trim().length > 80 ? `${content.trim().slice(0, 77)}…` : content.trim();
      opts.emit({
        event: "trace",
        step: { type: "reasoning", id: rid, content: snippet, status: "done" },
      });
    }

    if (!toolCalls.length) {
      if (content?.trim() && opts.emit) {
        await emitReplyChunks(opts.emit, content.trim());
      }
      return content;
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
        // 提案抽取不阻塞下一步工具/流式输出
        void opts.onToolDone?.(tc, result);
        opts.chat.push({ role: "tool", content: result, tool_call_id: tc.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        opts.emit?.({
          event: "trace_patch",
          id: step.id,
          patch: { status: "error", error: msg.slice(0, 120) },
        });
        opts.chat.push({ role: "tool", content: `错误：${msg}`, tool_call_id: tc.id });
      }
    }
  }
  return lastContent;
}
