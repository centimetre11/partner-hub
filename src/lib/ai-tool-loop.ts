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
  /** 联网搜索等场景：强制走指定 API 配置 */
  apiConfigId?: string;
  emit?: TraceEmitter;
  /** 是否把最终回复真·流式推送给前端（默认 true）。research/JSON 输出场景应设为 false */
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
    // 真流式模式：每轮开始清空回复缓冲，避免上一轮（工具轮）的中间文本残留
    if (opts.emit && streamReply) opts.emit({ event: "reply_reset" });

    const { content, toolCalls, volcengineReplay } = await chatCompletion(opts.chat, {
      tools: opts.tools,
      temperature: opts.temperature ?? 0.3,
      feature: opts.feature,
      userId: opts.userId,
      apiConfigId: opts.apiConfigId,
      // 真·流式：边生成边把文本增量推送给前端（仅 query 类场景；JSON 输出场景关闭）
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
        // 最终回复：真流式已实时推送完毕；若未触发增量（兜底），再模拟逐字
        if (!streamed && content?.trim()) {
          await emitReplyChunks(opts.emit, content.trim());
        } else {
          opts.emit({ event: "reply_done" });
        }
      } else if (opts.emit && content?.trim()) {
        // 非流式回复场景：把内容作为思考轨迹（reply 由上层处理）
        const rid = nextTraceId("reason");
        const snippet = content.trim().length > 80 ? `${content.trim().slice(0, 77)}…` : content.trim();
        opts.emit({ event: "trace", step: { type: "reasoning", id: rid, content: snippet, status: "done" } });
      }
      return content;
    }

    // 本轮要调用工具：把已流式推送的中间文本撤回，并转成「思考」轨迹
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
