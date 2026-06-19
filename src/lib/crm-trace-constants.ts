/** CRM 商务记录 trace_nature（销售 KPI） */
export const CRM_TRACE_NATURES = ["现场", "非现场"] as const;
export type CrmTraceNature = (typeof CRM_TRACE_NATURES)[number];

/** CRM 商务行为 trace_action（与 CRM 下拉一致） */
export const CRM_TRACE_ACTIONS = [
  "接待",
  "培训",
  "服务",
  "调研",
  "方案",
  "催款",
  "客情",
  "其它",
  "远程会议",
  "WhatsApp or Line",
  "Email",
] as const;
export type CrmTraceAction = (typeof CRM_TRACE_ACTIONS)[number];

export function normalizeCrmTraceNature(raw: string | undefined | null): CrmTraceNature | undefined {
  const s = raw?.trim();
  if (s === "现场" || s === "非现场") return s;
  return undefined;
}

export function normalizeCrmTraceAction(raw: string | undefined | null): CrmTraceAction | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  if ((CRM_TRACE_ACTIONS as readonly string[]).includes(s)) return s as CrmTraceAction;
  // legacy / AI aliases
  const aliases: Record<string, CrmTraceAction> = {
    其他: "其它",
    电话: "WhatsApp or Line",
    微信: "WhatsApp or Line",
    邮件: "Email",
    拜访: "接待",
    会议: "远程会议",
  };
  return aliases[s];
}
