import type { ToolLogEntry } from "@/lib/ai-trace";

export type AutomationRunStatus = "RUNNING" | "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";

const PUSH_RESULT_ZH = /\n\n\*\*推送结果：\*\* ([\s\S]+)$/;
const PUSH_RESULT_EN = /\n\n\*\*Delivery:\*\* ([\s\S]+)$/;

const FAILURE_PATTERNS =
  /未发出|推送失败|未注册|failed|Email failed|WeCom app failed|skipped \(no creator\)/i;
const SUCCESS_PATTERNS =
  /已推|已发送|Pushed|Email sent|sent per assignee|WeCom app message sent|queued/i;

export function extractPushResultLine(output: string | null | undefined): string | null {
  if (!output) return null;
  const zh = output.match(PUSH_RESULT_ZH);
  if (zh) return zh[1].trim();
  const en = output.match(PUSH_RESULT_EN);
  if (en) return en[1].trim();
  return null;
}

export function splitAutomationOutput(output: string | null | undefined): {
  preview: string | null;
  pushResult: string | null;
} {
  if (!output) return { preview: null, pushResult: null };
  const pushResult = extractPushResultLine(output);
  if (!pushResult) return { preview: output, pushResult: null };
  const preview = output.replace(PUSH_RESULT_ZH, "").replace(PUSH_RESULT_EN, "").trim();
  return { preview, pushResult };
}

export function isPushResultFailure(pushResult: string): boolean {
  const parts = pushResult
    .split(/[；;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  return parts.some((part) => FAILURE_PATTERNS.test(part) && !SUCCESS_PATTERNS.test(part));
}

export function deliveryFailedFromToolLog(toolLog: ToolLogEntry[]): boolean {
  return toolLog.some(({ tool, result }) => {
    if (tool === "send_wecom_app") return !/sent to/i.test(result);
    if (tool === "push_wecom") return /not registered|failed/i.test(result) && !/queued/i.test(result);
    if (tool === "send_email") return !/Email sent/i.test(result);
    return false;
  });
}

export function deliverySucceededFromToolLog(toolLog: ToolLogEntry[]): boolean {
  return toolLog.some(({ tool, result }) => {
    if (tool === "send_wecom_app") return /sent to/i.test(result);
    if (tool === "push_wecom") return /queued/i.test(result);
    if (tool === "send_email") return /Email sent/i.test(result);
    return false;
  });
}

function hasDeliveryToolCall(toolLog: ToolLogEntry[]): boolean {
  return toolLog.some((entry) =>
    ["send_wecom_app", "push_wecom", "send_email"].includes(entry.tool)
  );
}

export function resolveDeliveryRunStatus(
  pushNotes: string[],
  toolLog: ToolLogEntry[]
): "SUCCESS" | "PARTIAL_SUCCESS" {
  const notesFailed = pushNotes.some((note) => FAILURE_PATTERNS.test(note));
  const logFailed = deliveryFailedFromToolLog(toolLog);
  if (notesFailed || logFailed) return "PARTIAL_SUCCESS";
  return "SUCCESS";
}

/** 兼容历史记录：库中仍为 SUCCESS 但推送实际失败时，UI 显示部分成功 */
export function effectiveRunStatus(
  status: string,
  output: string | null | undefined,
  toolLog: ToolLogEntry[]
): AutomationRunStatus {
  if (status === "RUNNING" || status === "FAILED" || status === "PARTIAL_SUCCESS") {
    return status as AutomationRunStatus;
  }
  if (status !== "SUCCESS") return "SUCCESS";

  const pushResult = extractPushResultLine(output);
  if (pushResult && isPushResultFailure(pushResult)) return "PARTIAL_SUCCESS";
  if (hasDeliveryToolCall(toolLog) && deliveryFailedFromToolLog(toolLog) && !deliverySucceededFromToolLog(toolLog)) {
    return "PARTIAL_SUCCESS";
  }
  if (hasDeliveryToolCall(toolLog) && deliveryFailedFromToolLog(toolLog) && deliverySucceededFromToolLog(toolLog)) {
    return "PARTIAL_SUCCESS";
  }
  return "SUCCESS";
}

export type AutomationRunBadgeTone = "green" | "red" | "amber";

export function automationRunBadge(
  status: string,
  output: string | null | undefined,
  toolLog: ToolLogEntry[],
  labels: { success: string; failed: string; running: string; partialSuccess: string }
): { tone: AutomationRunBadgeTone; label: string; effectiveStatus: AutomationRunStatus } {
  const effectiveStatus = effectiveRunStatus(status, output, toolLog);
  if (effectiveStatus === "FAILED") {
    return { tone: "red", label: labels.failed, effectiveStatus };
  }
  if (effectiveStatus === "RUNNING") {
    return { tone: "amber", label: labels.running, effectiveStatus };
  }
  if (effectiveStatus === "PARTIAL_SUCCESS") {
    return { tone: "amber", label: labels.partialSuccess, effectiveStatus };
  }
  return { tone: "green", label: labels.success, effectiveStatus };
}
