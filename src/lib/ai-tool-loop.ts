import type { ChatMessage, ToolCall, ToolDef } from "./ai";
import { chatCompletion } from "./ai";
import {
  nextTraceId,
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
  executeTool: (tc: ToolCall) => Promise<string>;
};

/** 通用多轮 tool calling 循环，边执行边推送 trace（SSE 流式展示用） */
export async function runToolLoop(opts: ToolLoopOptions): Promise<string | null> {
  const max = opts.maxSteps ?? 8;
  let lastContent: string | null = null;

  for (let i = 0; i < max; i++) {
    const { content, toolCalls, volcengineReplay } = await chatCompletion(opts.chat, {
      tools: opts.tools,
      temperature: opts.temperature ?? 0.3,
      feature: opts.feature,
      userId: opts.userId,
    });
    lastContent = content;

    if (content?.trim() && opts.emit) {
      const rid = nextTraceId("reason");
      opts.emit({
        event: "trace",
        step: { type: "reasoning", id: rid, content: content.trim(), status: "running" },
      });
      opts.emit({ event: "trace_patch", id: rid, patch: { status: "done" } });
    }

    if (!toolCalls.length) return content;

    opts.chat.push({ role: "assistant", content: content ?? "", tool_calls: toolCalls, volcengineReplay });
    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {};
      if (tc.function.name !== "$web_search") {
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          /* ignore */
        }
      } else {
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          args = { query: tc.function.arguments };
        }
      }

      const step = toolTraceStep(tc.function.name, args);
      opts.emit?.({ event: "trace", step });

      try {
        const result = await opts.executeTool(tc);
        opts.emit?.({
          event: "trace_patch",
          id: step.id,
          patch: { status: "done", result: result.slice(0, 1200) },
        });
        opts.chat.push({ role: "tool", content: result, tool_call_id: tc.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        opts.emit?.({ event: "trace_patch", id: step.id, patch: { status: "error", error: msg } });
        opts.chat.push({ role: "tool", content: `错误：${msg}`, tool_call_id: tc.id });
      }
    }
  }
  return lastContent;
}
