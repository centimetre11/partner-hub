/** Build English-only web search queries from CRM lead fields (countryCn may be 中文/Arabic). */

const COUNTRY_ZH_TO_EN: Record<string, string> = {
  沙特阿拉伯: "Saudi Arabia",
  沙特: "Saudi Arabia",
  阿联酋: "United Arab Emirates",
  阿拉伯联合酋长国: "United Arab Emirates",
  卡塔尔: "Qatar",
  科威特: "Kuwait",
  巴林: "Bahrain",
  阿曼: "Oman",
  埃及: "Egypt",
  土耳其: "Turkey",
  以色列: "Israel",
  约旦: "Jordan",
  黎巴嫩: "Lebanon",
  伊拉克: "Iraq",
  伊朗: "Iran",
  巴基斯坦: "Pakistan",
  印度: "India",
  印度尼西亚: "Indonesia",
  马来西亚: "Malaysia",
  新加坡: "Singapore",
  泰国: "Thailand",
  越南: "Vietnam",
  菲律宾: "Philippines",
  日本: "Japan",
  韩国: "South Korea",
  中国: "China",
  美国: "United States",
  英国: "United Kingdom",
  德国: "Germany",
  法国: "France",
  意大利: "Italy",
  西班牙: "Spain",
  荷兰: "Netherlands",
  瑞士: "Switzerland",
  澳大利亚: "Australia",
  加拿大: "Canada",
  巴西: "Brazil",
  墨西哥: "Mexico",
  南非: "South Africa",
  尼日利亚: "Nigeria",
  肯尼亚: "Kenya",
  摩洛哥: "Morocco",
  阿尔及利亚: "Algeria",
  突尼斯: "Tunisia",
};

const DUTY_ZH_TO_EN: Record<string, string> = {
  财务总监: "CFO",
  首席财务官: "CFO",
  财务负责人: "Finance Director",
  财务经理: "Finance Manager",
  财务主管: "Financial Controller",
  销售总监: "Sales Director",
  销售经理: "Sales Manager",
  市场总监: "Marketing Director",
  首席执行官: "CEO",
  总裁: "President",
  总经理: "General Manager",
  副总经理: "Deputy General Manager",
  总监: "Director",
  经理: "Manager",
  工程师: "Engineer",
  技术总监: "CTO",
  信息总监: "CIO",
  采购总监: "Procurement Director",
  采购经理: "Procurement Manager",
};

/** Keep Latin letters, digits, spaces, hyphen; drop CJK / Arabic / parenthetical native names. */
export function latinSearchText(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const withoutParens = raw.replace(/\([^)]*[\u0600-\u06FF\u4e00-\u9fff][^)]*\)/g, " ");
  const latin = withoutParens.match(/[A-Za-z0-9][A-Za-z0-9\s.,&'-]*/g);
  return latin?.join(" ").replace(/\s+/g, " ").trim() ?? "";
}

export function countryToEnglish(countryCn: string | null | undefined): string {
  if (!countryCn?.trim()) return "";
  const trimmed = countryCn.trim();
  if (COUNTRY_ZH_TO_EN[trimmed]) return COUNTRY_ZH_TO_EN[trimmed];
  const latin = latinSearchText(trimmed);
  if (latin) return latin;
  return trimmed;
}

export function dutyToEnglish(contDuty: string | null | undefined): string {
  if (!contDuty?.trim()) return "";
  const trimmed = contDuty.trim();
  if (DUTY_ZH_TO_EN[trimmed]) return DUTY_ZH_TO_EN[trimmed];
  const latin = latinSearchText(trimmed);
  if (latin) return latin;
  return trimmed;
}

export function englishRegionFromLead(lead: {
  countryCn?: string | null;
  city?: string | null;
  province?: string | null;
}): string {
  const parts = [
    countryToEnglish(lead.countryCn),
    latinSearchText(lead.city),
    latinSearchText(lead.province),
  ].filter(Boolean);
  return [...new Set(parts)].join(" ");
}

export function quoteSearchTerm(name: string): string {
  const n = name.trim();
  return /\s/.test(n) ? `"${n}"` : n;
}

const join = (...parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

/** 去掉 region 中已出现在公司名里的词，避免重复（大小写不敏感，整词匹配） */
function dedupeRegion(company: string, region: string): string {
  if (!region) return "";
  const have = new Set(company.toLowerCase().split(/\s+/).filter(Boolean));
  const kept = region.split(/\s+/).filter((w) => w && !have.has(w.toLowerCase()));
  return kept.join(" ");
}

/**
 * 是否值得用「精确短语」检索：词数较少时加引号能提精度；过长（如名字里塞了城市/国家）则放宽，
 * 否则强制整串精确匹配几乎必然零命中。
 */
function shouldQuoteExact(company: string): boolean {
  return company.trim().split(/\s+/).length <= 4;
}

export type LeadSearchBlock = { label: string; query: string; kind: "web" | "linkedin" | "news" };

/**
 * 从线索字段构造多组英文检索词：全部围绕公司（业务、行业、背景、LinkedIn、新闻）。
 * 不再单独检索联系人 LinkedIn/个人页。
 */
export function buildEnglishSearchQueries(lead: {
  name?: string | null;
  countryCn?: string | null;
  city?: string | null;
  province?: string | null;
  contName?: string | null;
  contDuty?: string | null;
}): { company: string; region: string; blocks: LeadSearchBlock[] } | null {
  const company = latinSearchText(lead.name) || lead.name?.trim();
  if (!company) return null;

  const region = englishRegionFromLead(lead);
  const extraRegion = dedupeRegion(company, region);
  const exact = shouldQuoteExact(company);
  const companyTerm = exact ? quoteSearchTerm(company) : company;

  const blocks: LeadSearchBlock[] = [
    { label: "Company site", query: join(companyTerm, extraRegion, "official website"), kind: "web" },
    { label: "Company profile", query: join(company, extraRegion, "company profile about"), kind: "web" },
    { label: "Company business", query: join(company, extraRegion, "what does company do business products services"), kind: "web" },
    { label: "Company industry", query: join(company, extraRegion, "industry sector market"), kind: "web" },
    { label: "Company background", query: join(company, extraRegion, "company history background overview"), kind: "web" },
    { label: "Company LinkedIn", query: join(company, extraRegion, "company LinkedIn page"), kind: "linkedin" },
    { label: "Company news", query: join(company, extraRegion), kind: "news" },
  ];

  const seen = new Set<string>();
  const deduped = blocks.filter((b) => {
    const k = `${b.kind}::${b.query}`;
    if (!b.query || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { company, region, blocks: deduped };
}
