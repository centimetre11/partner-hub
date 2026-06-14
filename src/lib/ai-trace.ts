import { getToolLabel } from "./tools-registry";

/** 单步 AI 过程轨迹（思维链 / 工具调用），与 ChatGPT、Claude、Vercel AI SDK tool-invocation 同类概念 */
export type AiTraceStep =
  | {
      type: "reasoning";
      id: string;
      content: string;
      status: "running" | "done";
    }
  | {
      type: "tool";
      id: string;
      name: string;
      label: string;
      args: Record<string, unknown>;
      result?: string;
      status: "running" | "done" | "error";
      error?: string;
    };

export type AiTracePatch = {
  status?: AiTraceStep["status"];
  content?: string;
  result?: string;
  error?: string;
};

export type AiStreamEvent =
  | { event: "trace"; step: AiTraceStep }
  | { event: "trace_patch"; id: string; patch: AiTracePatch }
  | { event: "text_delta"; delta: string }
  | { event: "text_done" }
  | { event: "done"; data: unknown }
  | { event: "error"; message: string };

export type AiStreamState = {
  trace: AiTraceStep[];
  liveText: string;
};

export type TraceEmitter = (ev: AiStreamEvent) => void;

let traceId = 0;
export function nextTraceId(prefix = "t") {
  traceId += 1;
  return `${prefix}-${traceId}`;
}

export function formatToolArgs(name: string, args: Record<string, unknown>): string {
  const q = args.query ?? args.q ?? args.keyword;
  if (typeof q === "string" && q) return q;
  const partner = args.partnerName ?? args.name ?? args.partner;
  if (typeof partner === "string" && partner) return partner;
  if (name === "read_kms" && args.pageId) return `pageId: ${args.pageId}`;
  if (name === "update_partner" && args.field) return `${String(args.field)} → ${String(args.value ?? "")}`;
  const compact = JSON.stringify(args);
  return compact.length > 80 ? `${compact.slice(0, 77)}…` : compact;
}

export function toolTraceStep(name: string, args: Record<string, unknown>, id?: string): Extract<AiTraceStep, { type: "tool" }> {
  return {
    type: "tool",
    id: id ?? nextTraceId("tool"),
    name,
    label: getToolLabel(name === "$web_search" ? "web_search" : name),
    args,
    status: "running",
  };
}

/** 服务端 SSE：将 handler 中的 trace 事件推送给前端 */
export function createSseResponse(handler: (emit: TraceEmitter) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit: TraceEmitter = (ev) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      };
      try {
        await handler(emit);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        emit({ event: "error", message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/** 将完整文本分块模拟流式输出（火山等非 SSE 模型用） */
export function emitTextChunks(emit: TraceEmitter | undefined, text: string, chunkSize = 12) {
  if (!emit || !text) return;
  for (let i = 0; i < text.length; i += chunkSize) {
    emit({ event: "text_delta", delta: text.slice(i, i + chunkSize) });
  }
  emit({ event: "text_done" });
}

/** 客户端：消费 SSE 并维护 trace + liveText */
export async function consumeAiSse(
  res: Response,
  onEvent: (ev: AiStreamEvent, state: AiStreamState) => void
): Promise<{ data: unknown; trace: AiTraceStep[]; liveText: string }> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "请求失败");
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("响应不支持流式读取");

  const decoder = new TextDecoder();
  let buffer = "";
  let result: unknown;
  const trace: AiTraceStep[] = [];
  let liveText = "";

  const state = (): AiStreamState => ({ trace: [...trace], liveText });

  const apply = (ev: AiStreamEvent) => {
    if (ev.event === "trace") {
      trace.push(ev.step);
    } else if (ev.event === "trace_patch") {
      const idx = trace.findIndex((s) => s.id === ev.id);
      if (idx >= 0) trace[idx] = { ...trace[idx], ...ev.patch } as AiTraceStep;
    } else if (ev.event === "text_delta") {
      liveText += ev.delta;
    } else if (ev.event === "text_done") {
      /* keep liveText */
    } else if (ev.event === "done") {
      result = ev.data;
    } else if (ev.event === "error") {
      throw new Error(ev.message);
    }
    onEvent(ev, state());
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        apply(JSON.parse(line.slice(6)) as AiStreamEvent);
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  if (result === undefined) throw new Error("流式响应未返回结果");
  return { data: result, trace, liveText };
}
