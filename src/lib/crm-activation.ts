/** Hub → CRM 海外激活填报表：字段映射与载荷构造 */

import { buildCountryAliases } from "./country";

export { COUNTRY_ALIAS_GROUPS, buildCountryAliases } from "./country";

export const CRM_ACTIVATION_URL =
  "https://crm.finereporthelp.com/WebReport/decision/view/report?viewlet=sale%252Foversea%252Foversea_activation_single.cpt&ref_t=design&op=write&ref_c=33896294-5d32-461f-97d7-d3a23e0cf834";

export const CRM_ACTIVATION_REGION = "中东-ME";
export const CRM_ACTIVATION_PARTNER_TYPE = "经销商伙伴（Reseller）";
export const CRM_ACTIVATION_CONTACT_TITLE = "IT Manager";
/** Customer Source 固定：伙伴/客户介绍 */
export const CRM_ACTIVATION_CUSTOMER_SOURCE =
  "partner_referral-Partner/Customer introduction";
/** Products of interest 勾选第一项 */
export const CRM_ACTIVATION_PRODUCT = "FineReport";
/** Current demand 单选第一项 */
export const CRM_ACTIVATION_CURRENT_DEMAND =
  "Enterprise demands - quickly build BI/ Reporting or other systems";
export const CRM_ACTIVATION_FAKE_PHONE = "+966500000000";
export const CRM_ACTIVATION_FAKE_DIAL_CODE = "+966";
/** @deprecated 勿再用固定本地号；请用 fakePhoneLocalRandom()，避免 CRM 电话查重 */
export const CRM_ACTIVATION_FAKE_PHONE_LOCAL = "500000000";

/** 伪造沙特手机本地号：5 + 8 位随机数字（每次新建不同，避开 CRM 查重） */
export function fakePhoneLocalRandom(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let tail = "";
  for (let i = 0; i < 8; i++) tail += String(bytes[i] % 10);
  return `5${tail}`;
}

export function fakePhoneParts(): {
  phone: string;
  phoneDialCode: string;
  phoneLocal: string;
} {
  const phoneLocal = fakePhoneLocalRandom();
  const phoneDialCode = CRM_ACTIVATION_FAKE_DIAL_CODE;
  return {
    phone: `${phoneDialCode}${phoneLocal}`,
    phoneDialCode,
    phoneLocal,
  };
}

/** 创建人是售前时，销售固定填此人 */
export const CRM_ACTIVATION_DEFAULT_SALES = "chenmin";
/** 创建人是销售时，售前固定填此人 */
export const CRM_ACTIVATION_DEFAULT_PRESALES = "Zayne.Zhao";

export type CrmActivationEntityType = "partner" | "customer";

export type CrmActivationContactInput = {
  name: string;
  role?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
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
  /** Customer Source */
  customerSource: string;
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

/** 优先读独立 email/phone，旧数据回退解析 contactInfo */
export function resolveContactEmailPhone(c: {
  email?: string | null;
  phone?: string | null;
  contactInfo?: string | null;
}): { email?: string; phone?: string } {
  const parsed = parseContactInfo(c.contactInfo);
  return {
    email: c.email?.trim() || parsed.email,
    phone: c.phone?.trim() || parsed.phone,
  };
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
        const parsed = resolveContactEmailPhone(c);
        if (!email && parsed.email) email = parsed.email;
        if (!phone && parsed.phone) phone = parsed.phone;
      }
    }
  } else {
    const c = pickPartnerContact(contacts);
    if (c) {
      contactName = c.name;
      const parsed = resolveContactEmailPhone(c);
      email = parsed.email || "";
      phone = parsed.phone || "";
    }
  }

  if (!contactName) contactName = fakeContactNameForEntity(entity.id);
  if (!email) email = fakeEmailForEntity(entity.id);

  let phoneDialCode = "";
  let phoneLocal = "";
  if (!phone) {
    const fake = fakePhoneParts();
    phone = fake.phone;
    phoneDialCode = fake.phoneDialCode;
    phoneLocal = fake.phoneLocal;
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
    customerSource: CRM_ACTIVATION_CUSTOMER_SOURCE,
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
