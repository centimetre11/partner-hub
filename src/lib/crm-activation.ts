/** Hub → CRM 海外激活填报表：字段映射与载荷构造 */

export const CRM_ACTIVATION_URL =
  "https://crm.finereporthelp.com/WebReport/decision/view/report?viewlet=sale%252Foversea%252Foversea_activation_single.cpt&ref_t=design&op=write&ref_c=33896294-5d32-461f-97d7-d3a23e0cf834";

export const CRM_ACTIVATION_REGION = "中东-ME";
export const CRM_ACTIVATION_PARTNER_TYPE = "经销商伙伴（Reseller）";
export const CRM_ACTIVATION_CONTACT_TITLE = "IT Manager";
/** Products of interest 勾选第一项 */
export const CRM_ACTIVATION_PRODUCT = "FineReport";
/** Current demand 单选第一项 */
export const CRM_ACTIVATION_CURRENT_DEMAND =
  "Enterprise demands - quickly build BI/ Reporting or other systems";
export const CRM_ACTIVATION_FAKE_PHONE = "+966500000000";
export const CRM_ACTIVATION_FAKE_DIAL_CODE = "+966";
export const CRM_ACTIVATION_FAKE_PHONE_LOCAL = "500000000";

/** 创建人是售前时，销售固定填此人 */
export const CRM_ACTIVATION_DEFAULT_SALES = "chenmin";
/** 创建人是销售时，售前固定填此人 */
export const CRM_ACTIVATION_DEFAULT_PRESALES = "Zayne.Zhao";

/** 中东常用国家别名 → 用于匹配 CRM 下拉选项全文 */
export const COUNTRY_ALIAS_GROUPS: string[][] = [
  ["saudi arabia", "ksa", "saudi", "沙特", "沙特阿拉伯", "riyadh", "利雅得", "jeddah", "吉达", "dammam", "达曼"],
  ["united arab emirates", "uae", "emirates", "阿联酋", "阿拉伯联合酋长国", "dubai", "迪拜", "abu dhabi", "阿布扎比"],
  ["qatar", "qat", "卡塔尔", "qatar", "doha", "多哈"],
  ["bahrain", "bhr", "巴林", "manama", "麦纳麦"],
  ["kuwait", "kwt", "科威特"],
  ["oman", "omn", "阿曼", "muscat", "马斯喀特"],
  ["egypt", "egy", "埃及", "cairo", "开罗"],
  ["jordan", "jor", "约旦", "amman", "安曼"],
  ["lebanon", "lbn", "黎巴嫩", "beirut", "贝鲁特"],
  ["iraq", "irq", "伊拉克", "baghdad", "巴格达"],
  ["iran", "irn", "伊朗", "tehran", "德黑兰"],
  ["turkey", "turkiye", "türkiye", "土耳其", "istanbul", "伊斯坦布尔", "ankara", "安卡拉"],
  ["israel", "isr", "以色列", "tel aviv", "特拉维夫"],
  ["palestine", "pse", "巴勒斯坦"],
  ["yemen", "yem", "也门"],
  ["syria", "syr", "叙利亚"],
  ["kazakhstan", "kaz", "哈萨克斯坦", "қазақстан"],
  ["pakistan", "pak", "巴基斯坦"],
  ["afghanistan", "afg", "阿富汗"],
  ["morocco", "mar", "摩洛哥"],
  ["algeria", "dza", "阿尔及利亚"],
  ["tunisia", "tun", "突尼斯"],
  ["libya", "lby", "利比亚"],
  ["sudan", "sdn", "苏丹"],
];

export type CrmActivationEntityType = "partner" | "customer";

export type CrmActivationContactInput = {
  name: string;
  role?: string | null;
  title?: string | null;
  contactInfo?: string | null;
  updatedAt?: Date | string | null;
};

export type CrmActivationEntityInput = {
  id: string;
  name: string;
  country?: string | null;
  city?: string | null;
  /** 客户主联系人字段 */
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
};

export type CrmActivationFields = {
  region: string;
  /** 首选展示/输入值（常为 Hub country 原文） */
  country: string;
  /** 扩展侧用于匹配下拉的别名列表（含英文正式名等） */
  countryAliases: string[];
  sales: string;
  /** 售前 CRM 英文名 */
  preSales: string;
  companyName: string;
  /** 伙伴填经销商；客户为空字符串表示不填 */
  partnerType: string;
  contactName: string;
  contactTitle: string;
  /** 感兴趣产品（多选，默认 FineReport） */
  productsOfInterest: string;
  /** 当前需求（单选） */
  currentDemand: string;
  email: string;
  /** 完整电话（兼容）；优先用 dialCode + phoneLocal */
  phone: string;
  phoneDialCode: string;
  phoneLocal: string;
};

export type CrmActivationPayload = {
  url: string;
  fields: CrmActivationFields;
};

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(?:\+?\d[\d\s\-().]{6,}\d)/;

export function parseContactInfo(info: string | null | undefined): { email?: string; phone?: string } {
  if (!info) return {};
  const email = info.match(EMAIL_RE)?.[0];
  const withoutEmail = email ? info.replace(email, " ") : info;
  const phone = withoutEmail.match(PHONE_RE)?.[0]?.replace(/\s+/g, "") || undefined;
  return { email, phone };
}

export function fakeEmailForEntity(entityId: string): string {
  const short = entityId.replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "x";
  // 不要用 +（会触发 FineReport 电话区号控件）
  return `noreply.${short}@placeholder.local`;
}

/** 无联系人时伪造一个可识别的占位姓名（稳定可复现）。 */
export function fakeContactNameForEntity(entityId: string): string {
  const short = entityId.replace(/[^a-zA-Z0-9]/g, "").slice(-6) || "x";
  return `Auto Contact ${short}`;
}

/** 给 FineReport 下拉输入过滤用的短关键词：优先中文，其次短码 */
export function pickDropdownTypeQuery(aliases: string[]): string {
  const list = aliases.map((a) => String(a || "").trim()).filter(Boolean);
  if (!list.length) return "";
  const withCn = list.filter((a) => /[\u4e00-\u9fff]/.test(a));
  if (withCn.length) {
    const best = withCn.sort((a, b) => a.length - b.length)[0];
    if (best.includes("沙特")) return "沙特";
    if (best.includes("阿联酋") || best.includes("迪拜")) return "阿联酋";
    if (best.length > 6) return best.slice(0, 4);
    return best;
  }
  const short = list.find((a) => a.length <= 4);
  return short || list[0];
}

/** 从 Hub country/city 文本展开为 CRM 下拉匹配别名 */
export function buildCountryAliases(country?: string | null, city?: string | null): string[] {
  const raw = [country, city].filter(Boolean).join(" / ");
  if (!raw.trim()) return [];

  const aliases = new Set<string>();
  // 按 / , ; | 拆多值
  for (const part of raw.split(/[/|,;]+/).map((s) => s.trim()).filter(Boolean)) {
    aliases.add(part);
  }

  const lower = raw.toLowerCase();
  for (const group of COUNTRY_ALIAS_GROUPS) {
    if (group.some((a) => lower.includes(a.toLowerCase()))) {
      for (const a of group) aliases.add(a);
    }
  }
  return [...aliases];
}

function pickPartnerContact(contacts: CrmActivationContactInput[]): CrmActivationContactInput | null {
  if (!contacts.length) return null;
  const decision = contacts.find((c) => c.role === "DECISION_MAKER");
  if (decision) return decision;
  const sorted = [...contacts].sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  });
  return sorted[0] ?? null;
}

export function resolveCrmActivationSalesPair(input: {
  /** 当前用户 CRM 英文名（crmSalesmanName） */
  selfCrmName: string;
  /** Hub User.role：SALES / PRESALES / ADMIN / OTHER */
  role?: string | null;
}): { sales: string; preSales: string } {
  const self = input.selfCrmName.trim();
  const role = String(input.role ?? "")
    .trim()
    .toUpperCase();

  // Sales / Pre-Sales：售前角色 → Sales=chenmin、Pre-Sales=自己；否则 Sales=自己、Pre-Sales=Zayne.Zhao
  if (role === "PRESALES") {
    return {
      sales: CRM_ACTIVATION_DEFAULT_SALES,
      preSales: self,
    };
  }

  return {
    sales: self,
    preSales: CRM_ACTIVATION_DEFAULT_PRESALES,
  };
}

export function buildCrmActivationFields(input: {
  entityType: CrmActivationEntityType;
  entity: CrmActivationEntityInput;
  contacts?: CrmActivationContactInput[];
  salesman: string;
  /** 当前用户角色，用于分配 Sales / Pre-Sales */
  role?: string | null;
}): CrmActivationFields {
  const { entityType, entity, salesman } = input;
  const contacts = input.contacts ?? [];
  const countryAliases = buildCountryAliases(entity.country, entity.city);

  let contactName = "";
  let email = "";
  let phone = "";

  if (entityType === "customer") {
    contactName = (entity.contactName || "").trim();
    email = (entity.contactEmail || "").trim();
    phone = (entity.contactPhone || "").trim();
    if (!contactName || !email || !phone) {
      const c = pickPartnerContact(contacts);
      if (c) {
        if (!contactName) contactName = c.name;
        const parsed = parseContactInfo(c.contactInfo);
        if (!email && parsed.email) email = parsed.email;
        if (!phone && parsed.phone) phone = parsed.phone;
      }
    }
  } else {
    const c = pickPartnerContact(contacts);
    if (c) {
      contactName = c.name;
      const parsed = parseContactInfo(c.contactInfo);
      email = parsed.email || "";
      phone = parsed.phone || "";
    }
  }

  if (!contactName) contactName = fakeContactNameForEntity(entity.id);
  if (!email) email = fakeEmailForEntity(entity.id);

  let phoneDialCode = "";
  let phoneLocal = "";
  if (!phone) {
    phone = CRM_ACTIVATION_FAKE_PHONE;
    phoneDialCode = CRM_ACTIVATION_FAKE_DIAL_CODE;
    phoneLocal = CRM_ACTIVATION_FAKE_PHONE_LOCAL;
  } else {
    const m = phone.match(/^(\+\d{1,4})\s*(.*)$/);
    if (m) {
      phoneDialCode = m[1];
      phoneLocal = m[2].replace(/\D/g, "") || phone.replace(/\D/g, "");
    } else {
      phoneLocal = phone.replace(/\D/g, "");
      phoneDialCode = CRM_ACTIVATION_FAKE_DIAL_CODE;
    }
  }

  const { sales, preSales } = resolveCrmActivationSalesPair({
    selfCrmName: salesman,
    role: input.role,
  });

  return {
    region: CRM_ACTIVATION_REGION,
    country: (entity.country || countryAliases[0] || "").trim(),
    countryAliases,
    sales,
    preSales,
    companyName: entity.name.trim(),
    partnerType: entityType === "partner" ? CRM_ACTIVATION_PARTNER_TYPE : "",
    contactName,
    contactTitle: CRM_ACTIVATION_CONTACT_TITLE,
    productsOfInterest: CRM_ACTIVATION_PRODUCT,
    currentDemand: CRM_ACTIVATION_CURRENT_DEMAND,
    email,
    phone,
    phoneDialCode,
    phoneLocal,
  };
}

export function buildCrmActivationPayload(input: {
  entityType: CrmActivationEntityType;
  entity: CrmActivationEntityInput;
  contacts?: CrmActivationContactInput[];
  salesman: string;
  role?: string | null;
}): CrmActivationPayload {
  return {
    url: CRM_ACTIVATION_URL,
    fields: buildCrmActivationFields(input),
  };
}
