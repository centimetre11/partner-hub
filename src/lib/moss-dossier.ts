import "server-only";

import { callMossTool } from "./moss";

export type MossFitLevel = "hot" | "warm" | "neutral" | "unknown";
/** @deprecated use MossFitLevel */
export type MossRiskLevel = "clear" | "watch" | "alert";
export type MossSectionStatus = "ok" | "empty" | "error" | "unavailable";

export type MossProfileSection = {
  status: MossSectionStatus;
  companyName: string;
  creditCode: string;
  industry?: string;
  establishDate?: string;
  address?: string;
  regStatus?: string;
  error?: string;
};

export type MossScaleSection = {
  status: MossSectionStatus;
  staffRange?: string;
  recruitCount?: number;
  regCapital?: string;
  socialSecurityHint?: string;
  financingSummary?: string;
  highlights?: string[];
  error?: string;
};

export type MossPersonItem = {
  name: string;
  role?: string;
  position?: string;
};

export type MossPersonnelSection = {
  status: MossSectionStatus;
  leaders: MossPersonItem[];
  shareholders: { name: string; ratio?: string }[];
  contacts: MossPersonItem[];
  error?: string;
};

export type MossIndustryItem = {
  title: string;
  detail?: string;
  date?: string;
  type?: string;
};

export type MossIndustrySection = {
  status: MossSectionStatus;
  industry?: string;
  chainNode?: string;
  products?: string[];
  keywords?: string[];
  patents: MossIndustryItem[];
  patentTotal?: number;
  bidSignals: MossIndustryItem[];
  bidTotal?: number;
  news: MossIndustryItem[];
  highlights?: string[];
  error?: string;
};

export type MossNextAction = {
  priority: "high" | "medium" | "low";
  text: string;
};

export type MossDossier = {
  creditCode: string;
  companyName: string;
  fetchedAt: string;
  fitLevel: MossFitLevel;
  fitSummary: string;
  nextActions: MossNextAction[];
  humanSummary: string;
  profile: MossProfileSection;
  scale: MossScaleSection;
  personnel: MossPersonnelSection;
  industry: MossIndustrySection;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickNumber(...values: unknown[]): number | undefined {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
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

function toolUnavailable(msg: string): boolean {
  return /未配置|not configured|数据源|UNAVAILABLE|404|403/i.test(msg);
}

async function fetchMossSection<T>(
  tool: string,
  args: Record<string, unknown>,
  parse: (data: unknown, text: string) => T,
): Promise<{ ok: true; value: T } | { ok: false; error: string; unavailable: boolean }> {
  try {
    const res = await callMossTool(tool, args);
    return { ok: true, value: parse(res.data, res.text) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, unavailable: toolUnavailable(msg) };
  }
}

function parseProfile(data: unknown, text: string, creditCode: string, companyName: string): MossProfileSection {
  const root = normalizePayload(data, text);
  if (!root) {
    return {
      status: text ? "error" : "empty",
      companyName,
      creditCode,
      error: text || "未返回企业画像",
    };
  }

  return {
    status: "ok",
    companyName: pickString(root.company_name, root.name, companyName) || companyName,
    creditCode: pickString(root.credit_code, root.creditCode, creditCode) || creditCode,
    industry: pickString(root.industry, root.industry_name, root.gm_level_4, root.gm_level_3) || undefined,
    establishDate: pickString(root.establish_date, root.start_date, root.found_date) || undefined,
    address: pickString(root.business_address, root.reg_location, root.address) || undefined,
    regStatus: pickString(root.reg_status, root.status, root.enterprise_status) || undefined,
  };
}

function parseScaleFromProfile(root: Record<string, unknown>): Partial<MossScaleSection> {
  const staffRange = pickString(root.staff_num_range, root.social_security_num);
  const recruitCount = pickNumber(root.recruit_num, root.recruitNum);
  const regCapital = pickString(root.reg_capital, root.capital, root.registered_capital);
  const highlights: string[] = [];
  const rankName = pickString(root.rank_name, root.rankName);
  if (rankName) {
    const short = rankName.length > 100 ? `${rankName.slice(0, 100)}…` : rankName;
    highlights.push(`榜单/荣誉：${short}`);
  }
  if (recruitCount && recruitCount > 0) highlights.push(`在招岗位约 ${recruitCount} 个`);
  return { staffRange: staffRange || undefined, recruitCount, regCapital: regCapital || undefined, highlights };
}

function parseLeaders(data: unknown, text: string): MossPersonItem[] {
  const { rows } = parseRowsPayload(data, text);
  const items: MossPersonItem[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const r = asRecord(row);
    if (!r) continue;
    const incumbent = r.Incumbent ?? r.incumbent;
    if (incumbent === 0 || incumbent === "0") continue;
    const name = pickString(r.LeaderName, r.leader_name, r.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    items.push({
      name,
      role: pickString(r.PositionTypeDesc, r.position_type_desc) || undefined,
      position: pickString(r.PostNameStd, r.PostName, r.post_name) || undefined,
    });
    if (items.length >= 8) break;
  }

  const priority = (p?: string) => {
    if (!p) return 99;
    if (/董事长|总经理|CEO|总裁|创始人/.test(p)) return 0;
    if (/副董事|副总|董事|高管/.test(p)) return 1;
    return 2;
  };
  items.sort((a, b) => priority(a.position) - priority(b.position));
  return items;
}

function parseShareholders(data: unknown, text: string): { name: string; ratio?: string }[] {
  const { rows } = parseRowsPayload(data, text);
  return rows.slice(0, 6).map((row) => {
    const r = asRecord(row) ?? {};
    const ratioRaw = pickNumber(r.INSTO, r.insto, r.share_ratio, r.ratio);
    return {
      name: pickString(r.INV, r.inv, r.shareholder_name, r.name) || "—",
      ratio: ratioRaw !== undefined ? `${ratioRaw}%` : undefined,
    };
  });
}

function parseContacts(data: unknown, text: string): MossPersonItem[] {
  const root = normalizePayload(data, text);
  if (!root) return [];
  const rows = Array.isArray(root.rows)
    ? root.rows
    : Array.isArray(root.contacts)
      ? root.contacts
      : Array.isArray(root.list)
        ? root.list
        : [];
  return rows.slice(0, 5).map((row) => {
    const r = asRecord(row) ?? {};
    return {
      name: pickString(r.name, r.contact_name, r.person_name) || "—",
      role: pickString(r.position, r.duty, r.role) || undefined,
      position: pickString(r.phone, r.mobile, r.email) || undefined,
    };
  });
}

function parsePatents(data: unknown, text: string): { total: number; items: MossIndustryItem[] } {
  const { total, rows } = parseRowsPayload(data, text);
  const items = rows.slice(0, 4).map((row) => {
    const r = asRecord(row) ?? {};
    return {
      title: pickString(r.patent_name, r.patentName, r.title) || "—",
      type: pickString(r.patent_type, r.patentType) || undefined,
      date: pickString(r.apply_date, r.applyDate) || undefined,
    };
  });
  return { total, items };
}

function parseBidding(data: unknown, text: string): { total: number; items: MossIndustryItem[] } {
  const { total, rows } = parseRowsPayload(data, text);
  const items = rows.slice(0, 4).map((row) => {
    const r = asRecord(row) ?? {};
    return {
      title: pickString(r.Title, r.title, r.ProjectName, r.project_name) || "—",
      type: pickString(r.BiddingTypeIName, r.BiddingTypeIIName, r.bidding_type) || undefined,
      date: pickString(r.InfoPublDate, r.info_publ_date, r.PubDate) || undefined,
      detail: pickString(r.IndustryName, r.industry_name) || undefined,
    };
  });
  return { total, items };
}

function parseNews(data: unknown, text: string): MossIndustryItem[] {
  const { rows } = parseRowsPayload(data, text);
  return rows.slice(0, 5).map((row) => {
    const r = asRecord(row) ?? {};
    return {
      title: pickString(r.title, r.news_title, r.Title, r.content) || "—",
      date: pickString(r.publish_time, r.publishTime, r.date, r.PubDate) || undefined,
      type: pickString(r.source, r.media, r.category) || undefined,
    };
  });
}

function parseIndustryFromProfile(root: Record<string, unknown>): Partial<MossIndustrySection> {
  const mainProduct = root.main_product;
  const products = Array.isArray(mainProduct)
    ? mainProduct.map((p) => String(p).trim()).filter(Boolean).slice(0, 10)
    : undefined;
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
  const highlights: string[] = [];
  const chainNode = pickString(root.gm_level_4, root.gm_level_3, root.industry);
  if (chainNode) highlights.push(`产业节点：${chainNode}`);
  if (products?.length) highlights.push(`主营方向：${products.slice(0, 4).join("、")}`);
  return {
    industry: pickString(root.industry, root.industry_name, root.gm_level_4) || undefined,
    chainNode: chainNode || undefined,
    products,
    keywords,
    highlights: highlights.length ? highlights : undefined,
  };
}

function computeFitLevel(input: {
  profile: MossProfileSection;
  scale: MossScaleSection;
  industry: MossIndustrySection;
}): { fitLevel: MossFitLevel; fitSummary: string } {
  const { profile, scale, industry } = input;
  if (profile.status !== "ok") {
    return { fitLevel: "unknown", fitSummary: "主体画像未就绪，请先确认企业名称与 credit_code。" };
  }

  let score = 0;
  const signals: string[] = [];

  if (scale.recruitCount && scale.recruitCount >= 50) {
    score += 2;
    signals.push("招聘活跃");
  } else if (scale.recruitCount && scale.recruitCount > 0) {
    score += 1;
  }
  if (industry.bidTotal && industry.bidTotal >= 20) {
    score += 2;
    signals.push("招投标活跃");
  } else if (industry.bidTotal && industry.bidTotal > 0) {
    score += 1;
  }
  if (industry.patentTotal && industry.patentTotal >= 50) {
    score += 1;
    signals.push("知识产权储备较多");
  }
  if (industry.products?.length || industry.keywords?.length) {
    score += 1;
    signals.push("产业定位较清晰");
  }
  if (scale.staffRange || scale.regCapital) {
    score += 1;
  }

  let fitLevel: MossFitLevel = "neutral";
  if (score >= 4) fitLevel = "hot";
  else if (score >= 2) fitLevel = "warm";

  const fitSummary =
    signals.length > 0
      ? `${profile.companyName}：${signals.slice(0, 3).join("、")}，适合结合业务场景评估跟进优先级。`
      : `${profile.companyName}：公开信号有限，建议先确认采购场景与关键联系人后再推进。`;

  return { fitLevel, fitSummary };
}

function buildNextActions(input: {
  profile: MossProfileSection;
  scale: MossScaleSection;
  personnel: MossPersonnelSection;
  industry: MossIndustrySection;
  fitLevel: MossFitLevel;
}): MossNextAction[] {
  const actions: MossNextAction[] = [];

  if (input.profile.status !== "ok") {
    actions.push({
      priority: "high",
      text: "主体未锁定或画像失败：请在线索/客户详情重新搜索并点选正确企业。",
    });
    return actions;
  }

  if (input.industry.bidTotal && input.industry.bidTotal > 0) {
    actions.push({
      priority: "high",
      text: "近期有招投标/采购动态，可围绕在投项目、预算窗口与交付能力准备切入话术。",
    });
  }
  if (input.scale.recruitCount && input.scale.recruitCount >= 20) {
    actions.push({
      priority: "medium",
      text: "招聘扩张明显，可结合组织投入方向（研发/销售/交付）判断需求紧迫度与触达时机。",
    });
  }
  if (input.personnel.leaders.length) {
    const names = input.personnel.leaders
      .slice(0, 3)
      .map((l) => (l.position ? `${l.name}（${l.position}）` : l.name))
      .join("、");
    actions.push({
      priority: "medium",
      text: `核心管理层：${names}。跟进前确认决策链与对口角色。`,
    });
  }
  if (input.industry.products?.length) {
    actions.push({
      priority: "medium",
      text: `产业方向含「${input.industry.products.slice(0, 3).join("、")}」，可对照我方方案匹配场景与案例。`,
    });
  }
  if (input.fitLevel === "neutral" || input.fitLevel === "unknown") {
    actions.push({
      priority: "low",
      text: "公开信号偏少：补充一次人工调研（官网、年报、现有联系人）后再定下一步。",
    });
  }
  if (!actions.length) {
    actions.push({
      priority: "medium",
      text: "信息已就绪：安排首次触达，围绕客户当前业务重点与采购节奏展开对话。",
    });
  }
  return actions.slice(0, 5);
}

export function buildMossHumanSummary(
  dossier: Pick<
    MossDossier,
    "companyName" | "creditCode" | "fitLevel" | "fitSummary" | "nextActions" | "profile" | "scale" | "personnel" | "industry"
  >,
): string {
  const lines: string[] = [];
  lines.push(`【Moss 客户洞察】${dossier.companyName}（${dossier.creditCode}）`);
  lines.push(`判断：${dossier.fitSummary}`);
  lines.push(
    `跟进优先级：${
      dossier.fitLevel === "hot"
        ? "高"
        : dossier.fitLevel === "warm"
          ? "中"
          : dossier.fitLevel === "neutral"
            ? "待补充信息"
            : "未知"
    }`,
  );

  const scaleBits = [
    dossier.scale.staffRange ? `人员规模 ${dossier.scale.staffRange}` : "",
    dossier.scale.regCapital ? `注册资本 ${dossier.scale.regCapital}` : "",
    dossier.scale.recruitCount ? `在招 ${dossier.scale.recruitCount} 岗` : "",
  ].filter(Boolean);
  if (scaleBits.length) lines.push(`规模：${scaleBits.join(" · ")}`);

  if (dossier.personnel.leaders.length) {
    lines.push(
      `核心人员：${dossier.personnel.leaders
        .slice(0, 4)
        .map((l) => (l.position ? `${l.name}/${l.position}` : l.name))
        .join("；")}`,
    );
  }

  if (dossier.industry.industry || dossier.industry.products?.length) {
    lines.push(
      `产业：${[dossier.industry.industry, dossier.industry.products?.slice(0, 4).join("、")]
        .filter(Boolean)
        .join(" · ")}`,
    );
  }

  if (dossier.nextActions.length) {
    lines.push(`下一步：${dossier.nextActions.map((a) => a.text).join(" ")}`);
  }
  return lines.join("\n");
}

export function parseMossDossier(raw: unknown): MossDossier | null {
  const root = asRecord(raw);
  if (!root || typeof root.creditCode !== "string") return null;
  return raw as MossDossier;
}

export function parseMossFitLevelFromSnapshot(snapshot: unknown): MossFitLevel | null {
  const dossier = parseMossDossier(snapshot);
  if (dossier?.fitLevel) return dossier.fitLevel;
  return null;
}

/** @deprecated use parseMossFitLevelFromSnapshot */
export function parseMossRiskLevelFromSnapshot(snapshot: unknown): MossRiskLevel | null {
  const dossier = parseMossDossier(snapshot);
  if (dossier && "riskLevel" in dossier) {
    return (dossier as MossDossier & { riskLevel?: MossRiskLevel }).riskLevel ?? null;
  }
  return null;
}

export async function fetchMossDossier(input: {
  creditCode: string;
  companyName?: string;
}): Promise<MossDossier> {
  const creditCode = input.creditCode.trim();
  const companyName = input.companyName?.trim() || creditCode;
  if (!creditCode) throw new Error("缺少 credit_code");

  const baseArgs = { credit_code: creditCode, page_num: 1, page_size: 5 };

  const profilePromise = callMossTool("moss_company_profile", { credit_code: creditCode }).catch(
    (e): { error: string; unavailable: boolean } => ({
      error: e instanceof Error ? e.message : String(e),
      unavailable: toolUnavailable(e instanceof Error ? e.message : String(e)),
    }),
  );

  const [profileRaw, leadersRes, shareholdersRes, contactsRes, hiringRes, biddingRes, patentsRes, newsRes] =
    await Promise.all([
      profilePromise,
      fetchMossSection("moss_company_get_leader_positions", baseArgs, parseLeaders),
      fetchMossSection("moss_company_get_stockholders", baseArgs, parseShareholders),
      fetchMossSection("moss_company_get_contact", { credit_code: creditCode }, parseContacts),
      fetchMossSection("moss_company_get_hiring", { ...baseArgs, page_size: 3 }, (d, t) => parseRowsPayload(d, t)),
      fetchMossSection("moss_company_get_bidding", { ...baseArgs, page_size: 4 }, parseBidding),
      fetchMossSection("moss_company_get_patents", { ...baseArgs, page_size: 4 }, parsePatents),
      fetchMossSection("moss_company_get_news", baseArgs, parseNews),
    ]);

  let profile: MossProfileSection;
  let profileRoot: Record<string, unknown> | null = null;
  if ("error" in profileRaw) {
    profile = {
      status: profileRaw.unavailable ? "unavailable" : "error",
      companyName,
      creditCode,
      error: profileRaw.error,
    };
  } else {
    profile = parseProfile(profileRaw.data, profileRaw.text, creditCode, companyName);
    profileRoot = normalizePayload(profileRaw.data, profileRaw.text);
  }

  const scaleFromProfile = profileRoot ? parseScaleFromProfile(profileRoot) : {};
  const hiringTotal = hiringRes.ok ? hiringRes.value.total : undefined;
  const scale: MossScaleSection = {
    status:
      profile.status === "ok" || (hiringRes.ok && hiringTotal !== undefined)
        ? "ok"
        : profile.status === "unavailable"
          ? "unavailable"
          : profile.status === "error"
            ? "error"
            : "empty",
    ...scaleFromProfile,
    recruitCount: hiringTotal ?? scaleFromProfile.recruitCount,
    highlights: [
      ...(scaleFromProfile.highlights ?? []),
      hiringRes.ok && hiringTotal ? `公开在招岗位 ${hiringTotal} 个` : "",
    ].filter(Boolean),
    error: profile.error,
  };

  const leaders = leadersRes.ok ? leadersRes.value : [];
  const shareholders = shareholdersRes.ok ? shareholdersRes.value : [];
  const contacts = contactsRes.ok ? contactsRes.value : [];
  const personnel: MossPersonnelSection = {
    status:
      leaders.length || shareholders.length || contacts.length
        ? "ok"
        : leadersRes.ok && shareholdersRes.ok
          ? "empty"
          : leadersRes.ok === false && leadersRes.unavailable
            ? "unavailable"
            : "error",
    leaders,
    shareholders,
    contacts,
    error: !leadersRes.ok ? leadersRes.error : !shareholdersRes.ok ? shareholdersRes.error : undefined,
  };

  const industryFromProfile = profileRoot ? parseIndustryFromProfile(profileRoot) : {};
  const patents = patentsRes.ok ? patentsRes.value : { total: 0, items: [] };
  const bidding = biddingRes.ok ? biddingRes.value : { total: 0, items: [] };
  const news = newsRes.ok ? newsRes.value : [];
  const industry: MossIndustrySection = {
    status:
      industryFromProfile.industry ||
      industryFromProfile.products?.length ||
      patents.items.length ||
      bidding.items.length ||
      news.length
        ? "ok"
        : profile.status === "ok"
          ? "empty"
          : "error",
    ...industryFromProfile,
    patents: patents.items,
    patentTotal: patents.total,
    bidSignals: bidding.items,
    bidTotal: bidding.total,
    news,
  };

  const { fitLevel, fitSummary } = computeFitLevel({ profile, scale, industry });
  const nextActions = buildNextActions({ profile, scale, personnel, industry, fitLevel });

  const dossier: MossDossier = {
    creditCode,
    companyName: profile.companyName || companyName,
    fetchedAt: new Date().toISOString(),
    fitLevel,
    fitSummary,
    nextActions,
    humanSummary: "",
    profile,
    scale,
    personnel,
    industry,
  };
  dossier.humanSummary = buildMossHumanSummary(dossier);
  return dossier;
}
