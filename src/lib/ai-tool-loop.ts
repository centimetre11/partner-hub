import type { ChatMessage, ToolCall, ToolDef } from "./ai";
import { chatCompletion } from "./ai";
import {
  emitProcessStep,
  nextTraceId,
  toolTraceStep,
  formatToolArgs,
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
  /** 每步工具完成后立即推送摘要到对话区 */
  emitToolFindings?: boolean;
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

/** 通用多轮 tool calling 循环，边执行边推送 trace + 文字流（SSE 流式展示用） */
export async function runToolLoop(opts: ToolLoopOptions): Promise<string | null> {
  const max = opts.maxSteps ?? 8;
  let lastContent: string | null = null;

  for (let i = 0; i < max; i++) {
    const { content, toolCalls, volcengineReplay } = await chatCompletion(opts.chat, {
      tools: opts.tools,
      temperature: opts.temperature ?? 0.3,
      feature: opts.feature,
      userId: opts.userId,
      onDelta: opts.emit
        ? (delta) => opts.emit!({ event: "text_delta", delta })
        : undefined,
    });
    lastContent = content;

    if (content?.trim() && opts.emit) {
      const rid = nextTraceId("reason");
      opts.emit({
        event: "trace",
        step: { type: "reasoning", id: rid, content: content.trim(), status: "done" },
      });
      opts.emit({ event: "text_delta", delta: `\n\n💭 **分析**\n${content.trim()}\n` });
      opts.emit({ event: "text_done" });
    }

    if (!toolCalls.length) return content;

    opts.chat.push({ role: "assistant", content: content ?? "", tool_calls: toolCalls, volcengineReplay });
    for (const tc of toolCalls) {
      const args = parseToolArgs(tc);
      const step = toolTraceStep(tc.function.name, args);
      const argHint = formatToolArgs(tc.function.name, args);
      if (opts.emitToolFindings !== false) {
        emitProcessStep(opts.emit, "start", step.label, argHint);
      }
      opts.emit?.({ event: "trace", step });

      try {
        const result = await opts.executeTool(tc);
        opts.emit?.({
          event: "trace_patch",
          id: step.id,
          patch: { status: "done", result: result.slice(0, 1200) },
        });
        if (opts.emitToolFindings !== false) {
          emitProcessStep(opts.emit, "done", step.label, argHint, result);
        }
        opts.chat.push({ role: "tool", content: result, tool_call_id: tc.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        opts.emit?.({ event: "trace_patch", id: step.id, patch: { status: "error", error: msg } });
        if (opts.emitToolFindings !== false) {
          emitProcessStep(opts.emit, "error", step.label, argHint, msg);
        }
        opts.chat.push({ role: "tool", content: `错误：${msg}`, tool_call_id: tc.id });
      }
    }
  }
  return lastContent;
}
