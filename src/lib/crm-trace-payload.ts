import type { BusinessRecordCategory } from "./business-record-core";

const PRODUCT_REPLACEMENTS: { pattern: RegExp; to: string }[] = [
  { pattern: /(fine[\s-]*bi|finbi|fanebi|帆软\s*bi|帆软BI|数据驾驶舱)/gi, to: "FineBI" },
  {
    pattern: /(fine[\s-]*report|finerepot|fine[\s-]*reprot|帆软报表|报表工具)/gi,
    to: "FineReport",
  },
  { pattern: /(fine[\s-]*data[\s-]*link|fdl|data[\s-]*link|数据集成工具)/gi, to: "FineDataLink" },
  { pattern: /(简道云|jodoo|jodo|jo[\s-]*doo|low[\s-]*code|低代码平台)/gi, to: "Jodoo" },
];

const CRM_TRACE_ACTIONS = ["电话", "会议", "微信", "邮件", "拜访", "其他"] as const;
export type CrmTraceAction = (typeof CRM_TRACE_ACTIONS)[number];

export function normalizeProductTerms(text: string): string {
  if (!text) return text;
  let out = text;
  for (const { pattern, to } of PRODUCT_REPLACEMENTS) {
    out = out.replace(pattern, to);
  }
  return out;
}

function combineText(title: string, content?: string | null) {
  const parts = [title.trim(), content?.trim()].filter(Boolean);
  return parts.join("\n");
}

export function inferTraceNature(
  title: string,
  content: string | null | undefined,
  category: BusinessRecordCategory,
): "现场" | "非现场" {
  const text = combineText(title, content);
  if (/现场|拜访|到访|面谈|当面/i.test(text) || category === "VISIT") {
    return "现场";
  }
  return "非现场";
}

export function mapToCrmTraceAction(
  title: string,
  content: string | null | undefined,
  category: BusinessRecordCategory,
): CrmTraceAction {
  const text = combineText(title, content);
  if (/电话|通话|call/i.test(text)) return "电话";
  if (/微信|wechat/i.test(text)) return "微信";
  if (/邮件|email|e-mail/i.test(text)) return "邮件";
  if (/会议|meeting|培训/i.test(text)) return "会议";
  if (/拜访|visit|到访|见面/i.test(text)) return "拜访";

  if (category === "VISIT") return "拜访";
  if (category === "TRAINING" || category === "NEGOTIATION") return "会议";
  return "其他";
}

export function buildTraceKeyword(title: string, content?: string | null): string {
  const normalized = normalizeProductTerms(combineText(title, content));
  for (const name of ["FineBI", "FineReport", "FineDataLink", "Jodoo"]) {
    if (normalized.includes(name)) return name;
  }
  const compact = normalized.replace(/\s+/g, " ").trim();
  if (!compact) return "商务跟进";
  const first = compact.split(/[，。,.;；\n]/)[0]?.trim() ?? compact;
  const keyword = first.slice(0, 12);
  return keyword || "商务跟进";
}

export function buildTraceDetail(title: string, content?: string | null): string {
  const raw = combineText(title, content).replace(/\s+/g, " ").trim();
  const normalized = normalizeProductTerms(raw);
  if (!normalized) return "";
  return normalized.length > 500 ? normalized.slice(0, 500) : normalized;
}

export function buildCrmTraceFields(opts: {
  title: string;
  content?: string | null;
  category: BusinessRecordCategory;
}) {
  return {
    traceNature: inferTraceNature(opts.title, opts.content, opts.category),
    traceAction: mapToCrmTraceAction(opts.title, opts.content, opts.category),
    traceDetail: buildTraceDetail(opts.title, opts.content),
    traceKeyword: buildTraceKeyword(opts.title, opts.content),
  };
}
