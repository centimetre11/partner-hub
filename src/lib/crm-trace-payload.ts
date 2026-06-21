import type { BusinessRecordCategory } from "./business-record-core";
import {
  CRM_TRACE_ACTIONS,
  type CrmTraceAction,
  type CrmTraceNature,
  normalizeCrmTraceAction,
  normalizeCrmTraceNature,
} from "./crm-trace-constants";

export { CRM_TRACE_ACTIONS, CRM_TRACE_NATURES, normalizeCrmTraceAction, normalizeCrmTraceNature } from "./crm-trace-constants";
export type { CrmTraceAction, CrmTraceNature } from "./crm-trace-constants";

const PRODUCT_REPLACEMENTS: { pattern: RegExp; to: string }[] = [
  { pattern: /(fine[\s-]*bi|finbi|fanebi|帆软\s*bi|帆软BI|数据驾驶舱)/gi, to: "FineBI" },
  {
    pattern: /(fine[\s-]*report|finerepot|fine[\s-]*reprot|帆软报表|报表工具)/gi,
    to: "FineReport",
  },
  { pattern: /(fine[\s-]*data[\s-]*link|fdl|data[\s-]*link|数据集成工具)/gi, to: "FineDataLink" },
  { pattern: /(简道云|jodoo|jodo|jo[\s-]*doo|low[\s-]*code|低代码平台)/gi, to: "Jodoo" },
];

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
): CrmTraceNature {
  const text = combineText(title, content);
  if (/现场|拜访|到访|面谈|当面|见面|吃饭|接待/i.test(text) || category === "VISIT") {
    return "现场";
  }
  return "非现场";
}

export function inferTraceAction(
  title: string,
  content: string | null | undefined,
  category: BusinessRecordCategory,
): CrmTraceAction {
  const text = combineText(title, content);
  if (/催款|收款|回款|payment/i.test(text)) return "催款";
  if (/培训|认证|training|fca/i.test(text)) return "培训";
  if (/方案|proposal|demo/i.test(text)) return "方案";
  if (/调研|research|需求/i.test(text)) return "调研";
  if (/服务|support|售后/i.test(text)) return "服务";
  if (/客情|关系维护|送礼|节日/i.test(text)) return "客情";
  if (/远程会议|视频会议|zoom|teams|腾讯会议|线上会议|meeting/i.test(text)) return "远程会议";
  if (/whatsapp|wechat|微信|line|电话|通话/i.test(text)) return "WhatsApp or Line";
  if (/邮件|email|e-mail/i.test(text)) return "Email";
  if (/拜访|visit|到访|见面|吃饭|接待/i.test(text)) return "接待";
  if (/确认|同步|进展|跟进|配合|迁移|测试|评估/i.test(text)) return "其它";

  if (category === "VISIT") return "接待";
  if (category === "TRAINING") return "培训";
  if (category === "NEGOTIATION") return "方案";
  if (category === "RELATIONSHIP") return "客情";
  if (category === "DELIVERY") return "服务";
  return "其它";
}

export function mapToCrmTraceAction(
  title: string,
  content: string | null | undefined,
  category: BusinessRecordCategory,
): CrmTraceAction {
  return inferTraceAction(title, content, category);
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

export function resolveCrmTraceFields(opts: {
  title: string;
  content?: string | null;
  category: BusinessRecordCategory;
  traceNature?: string | null;
  traceAction?: string | null;
}) {
  const category = opts.category;
  return {
    traceNature:
      normalizeCrmTraceNature(opts.traceNature) ??
      inferTraceNature(opts.title, opts.content, category),
    traceAction:
      normalizeCrmTraceAction(opts.traceAction) ??
      inferTraceAction(opts.title, opts.content, category),
    traceDetail: buildTraceDetail(opts.title, opts.content),
    traceKeyword: buildTraceKeyword(opts.title, opts.content),
  };
}

/** @deprecated use resolveCrmTraceFields */
export function buildCrmTraceFields(opts: {
  title: string;
  content?: string | null;
  category: BusinessRecordCategory;
}) {
  return resolveCrmTraceFields(opts);
}

export function businessRecordCrmFieldsComplete(records: { traceNature?: string; traceAction?: string; title?: string }[]) {
  return records.every((r) => {
    if (!r.title?.trim()) return false;
    return !!normalizeCrmTraceNature(r.traceNature) && !!normalizeCrmTraceAction(r.traceAction);
  });
}
