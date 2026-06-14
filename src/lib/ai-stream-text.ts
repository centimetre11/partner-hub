import type { ChatMessage } from "./ai";
import { chatCompletion } from "./ai";
import { emitTextChunks, type TraceEmitter } from "./ai-trace";

/** 单次文本生成 + SSE 流式输出（摘要、周报等） */
export async function streamTextCompletion(
  messages: ChatMessage[],
  opts: {
    feature: string;
    userId?: string;
    temperature?: number;
    emit?: TraceEmitter;
  }
): Promise<string> {
  let streamed = "";
  const { content } = await chatCompletion(messages, {
    temperature: opts.temperature ?? 0.3,
    feature: opts.feature,
    userId: opts.userId,
    onDelta: opts.emit
      ? (delta) => {
          streamed += delta;
          opts.emit!({ event: "text_delta", delta });
        }
      : undefined,
  });
  const text = content ?? streamed;
  if (opts.emit) {
    if (!streamed && text) emitTextChunks(opts.emit, text);
    else opts.emit({ event: "text_done" });
  }
  return text;
}
