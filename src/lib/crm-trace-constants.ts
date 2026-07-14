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
  if (!s) return undefined;
  if (s === "现场" || s === "非现场") return s;
  // English UI / AI aliases → canonical CRM values
  const aliases: Record<string, CrmTraceNature> = {
    "On-site": "现场",
    Onsite: "现场",
    "on-site": "现场",
    Remote: "非现场",
    "Off-site": "非现场",
    Offsite: "非现场",
    "off-site": "非现场",
  };
  return aliases[s];
}

export function normalizeCrmTraceAction(raw: string | undefined | null): CrmTraceAction | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  if ((CRM_TRACE_ACTIONS as readonly string[]).includes(s)) return s as CrmTraceAction;
  // legacy / AI / English UI aliases → canonical CRM values
  const aliases: Record<string, CrmTraceAction> = {
    其他: "其它",
    电话: "WhatsApp or Line",
    微信: "WhatsApp or Line",
    邮件: "Email",
    拜访: "接待",
    会议: "远程会议",
    Reception: "接待",
    Training: "培训",
    Service: "服务",
    Research: "调研",
    Solution: "方案",
    "Payment follow-up": "催款",
    Collection: "催款",
    Relationship: "客情",
    Other: "其它",
    "Remote meeting": "远程会议",
  };
  return aliases[s];
}
