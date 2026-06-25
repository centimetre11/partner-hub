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

export function buildEnglishSearchQueries(lead: {
  name?: string | null;
  countryCn?: string | null;
  city?: string | null;
  province?: string | null;
  contName?: string | null;
  contDuty?: string | null;
}): { company: string; region: string; blocks: { label: string; query: string; kind: "web" | "linkedin" }[] } | null {
  const company = latinSearchText(lead.name) || lead.name?.trim();
  if (!company) return null;

  const region = englishRegionFromLead(lead);
  const companyTerm = quoteSearchTerm(company);
  const companyQuery = [companyTerm, region, "company official website"].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  const blocks: { label: string; query: string; kind: "web" | "linkedin" }[] = [
    { label: "Company", query: companyQuery, kind: "web" },
  ];

  const person = latinSearchText(lead.contName) || lead.contName?.trim();
  if (person) {
    const title = dutyToEnglish(lead.contDuty);
    const contactQuery = [person, title, companyTerm, region].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    blocks.push({ label: "Contact", query: contactQuery, kind: "linkedin" });
  }

  return { company, region, blocks };
}
