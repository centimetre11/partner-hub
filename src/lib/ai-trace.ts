import { getToolLabel } from "./tools-registry";
import type { IntakeProposal, IntakeClarification } from "./ai-intake";
import type { ContactProposal, OpportunityProposal, TodoProposal } from "./proposals";
import type { ProposalChanges } from "./proposal-merge";

/** 单步 AI 过程轨迹 */
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
      argHint?: string;
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

/** 工具步骤下方详情流式追加（见 trace_result_delta 事件） */

export type ProposalPatchOp =
  | { op: "set_partner"; name: string; source?: string }
  | { op: "set_summary"; summary: string }
  | {
      op: "upsert_field";
      key: string;
      field: string;
      label: string;
      newValue: string;
      oldValue?: string;
      reason?: string;
      source?: string;
    }
  | { op: "upsert_contact"; key: string; contact: ContactProposal; reason?: string }
  | { op: "upsert_opportunity"; key: string; opportunity: OpportunityProposal }
  | { op: "upsert_todo"; key: string; todo: TodoProposal }
  | { op: "remove"; key: string };

export type AiPhase = "idle" | "research" | "extract" | "reply";

export type AiStreamEvent =
  | { event: "trace"; step: AiTraceStep }
  | { event: "trace_patch"; id: string; patch: AiTracePatch }
  | { event: "trace_result_delta"; id: string; delta: string }
  | { event: "phase"; phase: AiPhase; label?: string }
  | { event: "reply_delta"; delta: string }
  | { event: "reply_reset" }
  | { event: "reply_done" }
  | { event: "text_delta"; delta: string }
  | { event: "text_done" }
  | { event: "proposal_patch"; ops: ProposalPatchOp[] }
  | {
      event: "proposal_update";
      proposal: IntakeProposal;
      questions?: string[];
      clarifications?: IntakeClarification[];
      ready?: boolean;
    }
  | { event: "done"; data: unknown }
  | { event: "error"; message: string };

export type AiStreamState = {
  trace: AiTraceStep[];
  replyText: string;
  liveText: string;
  proposal: IntakeProposal | null;
  questions: string[];
  clarifications: IntakeClarification[];
  ready: boolean;
  phase: AiPhase;
  phaseLabel: string;
  lastPatchChanges: ProposalChanges | null;
};

export type TraceEmitter = (ev: AiStreamEvent) => void | Promise<void>;

let traceId = 0;
export function nextTraceId(prefix = "t") {
  traceId += 1;
  return `${prefix}-${traceId}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function yieldEventLoop() {
  await new Promise<void>((r) => {
    if (typeof setImmediate === "function") setImmediate(r);
    else setTimeout(r, 0);
  });
}

export function formatToolArgs(name: string, args: Record<string, unknown>): string {
  const q = args.query ?? args.q ?? args.keyword;
  if (typeof q === "string" && q) return q.length > 60 ? `${q.slice(0, 57)}…` : q;
  const partner = args.partnerName ?? args.name ?? args.partner;
  if (typeof partner === "string" && partner) return partner;
  if (name === "read_kms" && args.pageId) return `pageId: ${args.pageId}`;
  if (name === "update_partner" && args.field) return `${String(args.field)} → ${String(args.value ?? "")}`;
  const compact = JSON.stringify(args);
  return compact.length > 60 ? `${compact.slice(0, 57)}…` : compact;
}

export function summarizeToolResult(name: string, result: string): string {
  const clean = result.replace(/\r/g, "").trim();
  if (!clean) return "（无返回）";
  const tool = name === "$web_search" ? "web_search" : name;

  if (tool === "read_kms" || tool === "search_knowledge") {
    const first = clean.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").trim() ?? "";
    return `已读取 ${clean.length} 字${first ? `，含：${first.slice(0, 80)}` : ""}`;
  }
  if (tool === "web_search" || tool === "linkedin_search") {
    const lines = clean.split("\n").filter((l) => l.trim());
    const head = lines[0]?.slice(0, 80) ?? "";
    return `找到 ${Math.max(1, lines.length)} 条${head ? `，首条：${head}` : ""}`;
  }
  if (tool === "get_partner" || tool === "list_partners" || tool === "search_partners") {
    const m = clean.match(/(?:公司|伙伴|name)[：:\s]+([^\n]+)/i) ?? clean.match(/^([^\n]{4,60})/);
    return m ? `匹配：${m[1].trim().slice(0, 80)}` : clean.slice(0, 120);
  }
  return clean.length > 120 ? `${clean.slice(0, 117)}…` : clean;
}

export function toolTraceStep(
  name: string,
  args: Record<string, unknown>,
  id?: string
): Extract<AiTraceStep, { type: "tool" }> {
  const n = name === "$web_search" ? "web_search" : name;
  return {
    type: "tool",
    id: id ?? nextTraceId("tool"),
    name: n,
    label: getToolLabel(n),
    args,
    argHint: formatToolArgs(n, args),
    status: "running",
  };
}

export function emitPhase(emit: TraceEmitter | undefined, phase: AiPhase, label?: string) {
  emit?.({ event: "phase", phase, label });
}

export function emitProposalPatch(emit: TraceEmitter | undefined, ops: ProposalPatchOp[]) {
  if (!emit || !ops.length) return;
  emit({ event: "proposal_patch", ops });
}

export function emitProposalUpdate(
  emit: TraceEmitter | undefined,
  turn: { proposal: IntakeProposal; questions?: string[]; clarifications?: IntakeClarification[]; ready?: boolean }
) {
  if (!emit) return;
  emit({
    event: "proposal_update",
    proposal: turn.proposal,
    questions: turn.questions,
    clarifications: turn.clarifications,
    ready: turn.ready,
  });
}

export async function emitTraceResultChunks(
  emit: TraceEmitter | undefined,
  stepId: string,
  text: string,
  chunkSize = 6,
  delayMs = 18
) {
  if (!emit || !text) return;
  for (let i = 0; i < text.length; i += chunkSize) {
    await emit({ event: "trace_result_delta", id: stepId, delta: text.slice(i, i + chunkSize) });
    if (delayMs > 0) await sleep(delayMs);
  }
}

export async function emitReplyChunks(
  emit: TraceEmitter | undefined,
  text: string,
  chunkSize = 3,
  delayMs = 28
) {
  if (!emit || !text) return;
  for (let i = 0; i < text.length; i += chunkSize) {
    emit({ event: "reply_delta", delta: text.slice(i, i + chunkSize) });
    if (delayMs > 0) await sleep(delayMs);
  }
  emit({ event: "reply_done" });
}

export async function emitTextChunks(
  emit: TraceEmitter | undefined,
  text: string,
  chunkSize = 8,
  delayMs = 20
) {
  return emitReplyChunks(emit, text, chunkSize, delayMs);
}

export function createSseResponse(handler: (emit: TraceEmitter) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit: TraceEmitter = async (ev) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        await yieldEventLoop();
      };
      try {
        await handler(emit);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await emit({ event: "error", message });
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
      "X-Accel-Buffering": "no",
    },
  });
}

export async function consumeAiSse(
  res: Response,
  onEvent: (ev: AiStreamEvent, state: AiStreamState) => void,
  opts?: { excluded?: Set<string> }
): Promise<{
  data: unknown;
  trace: AiTraceStep[];
  replyText: string;
  liveText: string;
  proposal: IntakeProposal | null;
  questions: string[];
  clarifications: IntakeClarification[];
  ready: boolean;
  aborted: boolean;
}> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "请求失败");
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("响应不支持流式读取");

  const { mergeProposalPatch, mergeFinalProposal } = await import("./proposal-merge");

  const decoder = new TextDecoder();
  let buffer = "";
  let result: unknown;
  const trace: AiTraceStep[] = [];
  let replyText = "";
  let proposal: IntakeProposal | null = null;
  let questions: string[] = [];
  let clarifications: IntakeClarification[] = [];
  let ready = false;
  let phase: AiPhase = "idle";
  let phaseLabel = "";
  let lastPatchChanges: ProposalChanges | null = null;
  const excluded = opts?.excluded ?? new Set<string>();

  const state = (): AiStreamState => ({
    trace: [...trace],
    replyText,
    liveText: replyText,
    proposal,
    questions,
    clarifications,
    ready,
    phase,
    phaseLabel,
    lastPatchChanges: lastPatchChanges ? { ...lastPatchChanges, added: [...lastPatchChanges.added], updated: [...lastPatchChanges.updated], removed: [...lastPatchChanges.removed], aiReupdates: [...lastPatchChanges.aiReupdates] } : null,
  });

  const apply = async (ev: AiStreamEvent) => {
    if (ev.event === "trace") {
      if (ev.step.type === "reasoning") {
        const last = trace[trace.length - 1];
        if (last?.type === "reasoning" && last.status === "running") {
          trace[trace.length - 1] = ev.step;
        } else {
          trace.push(ev.step);
        }
      } else {
        trace.push(ev.step);
      }
    } else if (ev.event === "trace_result_delta") {
      const idx = trace.findIndex((s) => s.id === ev.id);
      if (idx >= 0 && trace[idx].type === "tool") {
        const cur = trace[idx];
        trace[idx] = {
          ...cur,
          result: (cur.result ?? "") + ev.delta,
          status: cur.status === "done" ? "done" : "running",
        };
      }
    } else if (ev.event === "trace_patch") {
      const idx = trace.findIndex((s) => s.id === ev.id);
      if (idx >= 0) trace[idx] = { ...trace[idx], ...ev.patch } as AiTraceStep;
    } else if (ev.event === "phase") {
      phase = ev.phase;
      if (ev.label) phaseLabel = ev.label;
    } else if (ev.event === "reply_delta" || ev.event === "text_delta") {
      replyText += ev.delta;
    } else if (ev.event === "reply_reset") {
      replyText = "";
    } else if (ev.event === "proposal_patch") {
      const { draft, changes } = mergeProposalPatch(proposal, ev.ops, excluded);
      proposal = draft;
      lastPatchChanges = changes;
    } else if (ev.event === "proposal_update") {
      proposal = mergeFinalProposal(proposal, ev.proposal, excluded);
      questions = ev.questions ?? [];
      clarifications = ev.clarifications ?? [];
      ready = !!ev.ready;
    } else if (ev.event === "done") {
      result = ev.data;
    } else if (ev.event === "error") {
      throw new Error(ev.message);
    }
    onEvent(ev, state());
    // 让出事件循环，保证 React 逐步渲染（避免一股脑吐出）
    await new Promise<void>((r) => {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => r());
      else setTimeout(r, 0);
    });
  };

  let aborted = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          await apply(JSON.parse(line.slice(6)) as AiStreamEvent);
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
  } catch (e) {
    // 用户主动停止：保留已累积内容，不当作错误
    if (e instanceof DOMException && e.name === "AbortError") {
      aborted = true;
    } else if (e instanceof Error && /aborted|abort/i.test(e.message)) {
      aborted = true;
    } else {
      throw e;
    }
  }
  if (!aborted && result === undefined) throw new Error("流式响应未返回结果");
  return { data: result, trace, replyText, liveText: replyText, proposal, questions, clarifications, ready, aborted };
}
