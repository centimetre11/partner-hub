import "server-only";

import { callMossTool } from "./moss";

export type MossRiskLevel = "clear" | "watch" | "alert";
export type MossSectionStatus = "ok" | "empty" | "error" | "unavailable";

export type MossProfileSection = {
  status: MossSectionStatus;
  companyName: string;
  creditCode: string;
  legalPerson?: string;
  regStatus?: string;
  address?: string;
  industry?: string;
  scale?: string;
  establishDate?: string;
  keywords?: string[];
  highlights?: string[];
  error?: string;
};

export type MossRiskItem = {
  tool: string;
  label: string;
  status: MossSectionStatus;
  count: number;
  summary?: string;
  error?: string;
};

export type MossOpinionItem = {
  title?: string;
  sentiment?: string;
  date?: string;
  source?: string;
  url?: string;
};

export type MossOpinionSection = {
  status: MossSectionStatus;
  items: MossOpinionItem[];
  error?: string;
};

export type MossDossier = {
  creditCode: string;
  companyName: string;
  fetchedAt: string;
  riskLevel: MossRiskLevel;
  riskTriggers: string[];
  humanSummary: string;
  profile: MossProfileSection;
  risks: MossRiskItem[];
  opinion: MossOpinionSection;
};

const RISK_TOOLS: { name: string; label: string }[] = [
  { name: "moss_company_get_operation_abnormal", label: "经营异常" },
  { name: "moss_company_get_illegal_info", label: "严重违法" },
  { name: "moss_company_get_litigation_count", label: "司法风险" },
  { name: "moss_company_get_administrative_punishment", label: "行政处罚" },
  { name: "moss_company_get_major_tax_violation", label: "重大税收违法" },
];

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function parseJsonText(text: string): unknown {
  const t = text.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function normalizePayload(data: unknown, text: string): Record<string, unknown> | null {
  return asRecord(data) ?? asRecord(parseJsonText(text));
}

function parseRowsPayload(data: unknown, text: string): { total: number; rows: unknown[] } {
  const root = normalizePayload(data, text);
  if (!root) return { total: 0, rows: [] };
  const rows = Array.isArray(root.rows) ? root.rows : [];
  const total =
    typeof root.total === "number" && Number.isFinite(root.total) ? root.total : rows.length;
  return { total, rows };
}

function summarizeRows(rows: unknown[], max = 2): string | undefined {
  const bits: string[] = [];
  for (const row of rows.slice(0, max)) {
    const r = asRecord(row);
    if (!r) continue;
    const line = pickString(
      r.reason,
      r.abnormal_reason,
      r.punish_reason,
      r.case_name,
      r.title,
      r.content,
      r.detail,
    );
    if (line) bits.push(line);
  }
  return bits.length ? bits.join("；") : undefined;
}

function parseProfile(data: unknown, text: string, creditCode: string, companyName: string): MossProfileSection {
  const root = normalizePayload(data, text);
  if (!root) {
    return {
      status: text ? "error" : "empty",
      companyName,
      creditCode,
      error: text || "未返回画像数据",
    };
  }

  const keywordsRaw = root.keywords ?? root.tech_keywords;
  const keywords = Array.isArray(keywordsRaw)
    ? keywordsRaw.map((k) => String(k).trim()).filter(Boolean).slice(0, 8)
    : typeof keywordsRaw === "string"
      ? keywordsRaw
          .split(/[,，]/)
          .map((k) => k.trim())
          .filter(Boolean)
          .slice(0, 8)
      : undefined;

  const mainProduct = root.main_product;
  const highlights: string[] = [];
  const rankName = pickString(root.rank_name, root.rankName);
  if (rankName) highlights.push(`榜单/荣誉：${rankName.slice(0, 120)}${rankName.length > 120 ? "…" : ""}`);
  if (Array.isArray(mainProduct) && mainProduct.length) {
    highlights.push(`主营：${mainProduct.slice(0, 6).join("、")}`);
  }

  return {
    status: "ok",
    companyName: pickString(root.company_name, root.name, companyName) || companyName,
    creditCode: pickString(root.credit_code, root.creditCode, creditCode) || creditCode,
    legalPerson: pickString(root.legal_person, root.oper_name, root.legalPerson) || undefined,
    regStatus: pickString(root.reg_status, root.status, root.enterprise_status) || undefined,
    address: pickString(root.business_address, root.reg_location, root.address) || undefined,
    industry: pickString(root.industry, root.industry_name, root.industryName) || undefined,
    scale: pickString(root.staff_num_range, root.social_security_num, root.reg_capital, root.capital) || undefined,
    establishDate: pickString(root.establish_date, root.start_date, root.found_date) || undefined,
    keywords,
    highlights: highlights.length ? highlights : undefined,
  };
}

function parseOpinionItems(data: unknown, text: string): MossOpinionItem[] {
  const root = normalizePayload(data, text);
  if (!root) return [];

  const candidates = [
    root.items,
    root.list,
    root.rows,
    root.records,
    asRecord(root.data)?.items,
    asRecord(root.data)?.list,
  ];
  const list = candidates.find((c) => Array.isArray(c) && c.length) as unknown[] | undefined;
  if (!list) return [];

  return list.slice(0, 10).map((item) => {
    const r = asRecord(item) ?? {};
    return {
      title: pickString(r.title, r.news_title, r.name, r.content) || undefined,
      sentiment: pickString(r.sentiment, r.emotion, r.tendency) || undefined,
      date: pickString(r.publish_time, r.publishTime, r.date, r.time) || undefined,
      source: pickString(r.source, r.media, r.site) || undefined,
      url: pickString(r.url, r.link) || undefined,
    };
  });
}

function computeRiskLevel(risks: MossRiskItem[], opinion: MossOpinionSection): {
  riskLevel: MossRiskLevel;
  triggers: string[];
} {
  const triggers: string[] = [];
  let hasAlert = false;
  let hasWatch = false;

  for (const risk of risks) {
    if (risk.status === "ok" && risk.count > 0) {
      hasAlert = true;
      triggers.push(`${risk.label} ${risk.count} 条${risk.summary ? `：${risk.summary}` : ""}`);
    } else if (risk.status === "error" || risk.status === "unavailable") {
      hasWatch = true;
    }
  }

  if (opinion.status === "error" || opinion.status === "unavailable") {
    hasWatch = true;
  }

  if (hasAlert) return { riskLevel: "alert", triggers };
  if (hasWatch) return { riskLevel: "watch", triggers };
  return { riskLevel: "clear", triggers };
}

export function buildMossHumanSummary(dossier: Pick<MossDossier, "companyName" | "creditCode" | "riskLevel" | "riskTriggers" | "profile" | "opinion">): string {
  const lines: string[] = [];
  lines.push(`【Moss 外部背调】${dossier.companyName}（${dossier.creditCode}）`);
  lines.push(
    `风险等级：${dossier.riskLevel === "alert" ? "需关注" : dossier.riskLevel === "watch" ? "观察" : "未见明显风险信号"}`,
  );
  if (dossier.riskTriggers.length) {
    lines.push(`触发项：${dossier.riskTriggers.join("；")}`);
  } else if (dossier.riskLevel === "clear") {
    lines.push("经营异常/违法/处罚等快扫维度当前无命中记录（空结果不等于无风险）。");
  }
  if (dossier.profile.address) lines.push(`地址：${dossier.profile.address}`);
  if (dossier.opinion.items.length) {
    const headlines = dossier.opinion.items
      .slice(0, 3)
      .map((i) => i.title)
      .filter(Boolean);
    if (headlines.length) lines.push(`舆情摘录：${headlines.join("；")}`);
  }
  return lines.join("\n");
}

export function parseMossDossier(raw: unknown): MossDossier | null {
  const root = asRecord(raw);
  if (!root || typeof root.creditCode !== "string") return null;
  return raw as MossDossier;
}

export function parseMossRiskLevelFromSnapshot(snapshot: unknown): MossRiskLevel | null {
  const dossier = parseMossDossier(snapshot);
  return dossier?.riskLevel ?? null;
}

async function fetchRiskItem(
  tool: string,
  label: string,
  creditCode: string,
): Promise<MossRiskItem> {
  try {
    const res = await callMossTool(tool, { credit_code: creditCode });
    const { total, rows } = parseRowsPayload(res.data, res.text);
    if (total > 0) {
      return {
        tool,
        label,
        status: "ok",
        count: total,
        summary: summarizeRows(rows),
      };
    }
    return { tool, label, status: "empty", count: 0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const unavailable =
      /未配置|not configured|数据源|UNAVAILABLE|404|403/i.test(msg) ||
      /ZHONGZHOU|LITIGATION_API/i.test(msg);
    return {
      tool,
      label,
      status: unavailable ? "unavailable" : "error",
      count: 0,
      error: msg,
    };
  }
}

export async function fetchMossDossier(input: {
  creditCode: string;
  companyName?: string;
}): Promise<MossDossier> {
  const creditCode = input.creditCode.trim();
  const companyName = input.companyName?.trim() || creditCode;
  if (!creditCode) throw new Error("缺少 credit_code");

  const profilePromise = callMossTool("moss_company_profile", { credit_code: creditCode }).catch(
    (e): { text: string; data: unknown; error: string } => ({
      text: "",
      data: null,
      error: e instanceof Error ? e.message : String(e),
    }),
  );

  const [profileRes, ...riskResults] = await Promise.all([
    profilePromise,
    ...RISK_TOOLS.map((t) => fetchRiskItem(t.name, t.label, creditCode)),
  ]);

  let profile: MossProfileSection;
  if ("error" in profileRes && profileRes.error) {
    profile = {
      status: "error",
      companyName,
      creditCode,
      error: profileRes.error,
    };
  } else {
    profile = parseProfile(
      "data" in profileRes ? profileRes.data : null,
      "text" in profileRes ? profileRes.text : "",
      creditCode,
      companyName,
    );
  }

  const risks = riskResults as MossRiskItem[];

  let opinion: MossOpinionSection = { status: "empty", items: [] };
  try {
    const res = await callMossTool("moss_public_opinion_search", {
      keyword: companyName || creditCode,
      limit: 8,
    });
    const items = parseOpinionItems(res.data, res.text);
    opinion = items.length
      ? { status: "ok", items }
      : { status: "empty", items: [], error: res.text ? undefined : "未解析到舆情条目" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    opinion = {
      status: /未配置|数据源|404|403/i.test(msg) ? "unavailable" : "error",
      items: [],
      error: msg,
    };
  }

  const { riskLevel, triggers } = computeRiskLevel(risks, opinion);
  const dossier: MossDossier = {
    creditCode,
    companyName: profile.companyName || companyName,
    fetchedAt: new Date().toISOString(),
    riskLevel,
    riskTriggers: triggers,
    humanSummary: "",
    profile,
    risks,
    opinion,
  };
  dossier.humanSummary = buildMossHumanSummary(dossier);
  return dossier;
}
