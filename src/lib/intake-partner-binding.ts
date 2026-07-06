import { db } from "./db";
import type { IntakeClarification, IntakeProposal } from "./ai-intake";
import type { IntakeScope } from "./ai-locale";
import type { Locale } from "./i18n/locale";
import { END_CUSTOMER_WHERE } from "./customer-filters";
import { lookupSingleCustomerByName } from "./business-record-intake";
import { isLikelyHubAssigneeName } from "./hub-assignee-names";
import { isLikelyWecomBotMentionName, stripWecomCommandPrefixForIntake } from "./wecom-bot-guide";

/** Scopes whose primary payload must belong to a specific partner */
export const PARTNER_REQUIRED_SCOPES: IntakeScope[] = [
  "powermap",
  "profile",
  "training",
  "solution",
  "business_record",
];

export function intakeScopeRequiresPartner(scope: IntakeScope): boolean {
  return PARTNER_REQUIRED_SCOPES.includes(scope);
}

export type IntakePartnerBinding =
  | { mode: "bound"; partnerId: string; partnerName: string }
  | { mode: "open" };

export async function loadIntakePartnerBinding(partnerId?: string): Promise<IntakePartnerBinding> {
  if (!partnerId) return { mode: "open" };
  const partner = await db.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, name: true },
  });
  if (!partner) return { mode: "open" };
  return { mode: "bound", partnerId: partner.id, partnerName: partner.name };
}

async function findCustomersByName(query: string, limit = 6) {
  const q = query.trim();
  if (!q) return [];
  const baseWhere = { ...END_CUSTOMER_WHERE };
  const exact = await db.customer.findMany({
    where: { ...baseWhere, name: { equals: q } },
    select: { id: true, name: true },
    take: limit,
  });
  if (exact.length) return exact;
  return db.customer.findMany({
    where: { ...baseWhere, name: { contains: q } },
    select: { id: true, name: true },
    take: limit,
    orderBy: { name: "asc" },
  });
}

async function findPartnersByName(query: string, limit = 6) {
  const q = query.trim();
  if (!q) return [];
  const exact = await db.partner.findMany({
    where: { name: { equals: q } },
    select: { id: true, name: true },
    take: limit,
  });
  if (exact.length) return exact;
  return db.partner.findMany({
    where: { name: { contains: q } },
    select: { id: true, name: true },
    take: limit,
  });
}

/** Single unambiguous partner match by name (exact or contains). */
export async function lookupSinglePartnerByName(query: string) {
  const matches = await findPartnersByName(query);
  return matches.length === 1 ? matches[0]! : null;
}

/** Partner name candidates for clarification buttons (Partner Hub). */
export async function suggestPartnersFromIntakeText(text: string, limit = 6) {
  const stripped = stripWecomCommandPrefixForIntake(text).trim();
  const extracted = extractPartnerNameFromIntakeText(stripped);
  if (extracted) {
    if (isLikelyWecomBotMentionName(extracted, text)) return [];
    const matches = await findPartnersByName(extracted, limit);
    if (matches.length) return matches;
  }
  const slice = stripped.slice(0, 40).trim();
  if (!slice || isLikelyWecomBotMentionName(slice, text)) return [];
  return findPartnersByName(slice, limit);
}

/** Open intake: drop @机器人 / 负责人 误写入的 partnerName */
export async function sanitizeOpenIntakePartnerName(
  proposal: IntakeProposal,
  opts?: { userText?: string; boundPartnerId?: string; boundCustomerId?: string },
): Promise<IntakeProposal> {
  if (opts?.boundPartnerId || opts?.boundCustomerId) return proposal;
  const pn = proposal.partnerName?.trim();
  if (!pn) return proposal;
  if (isLikelyWecomBotMentionName(pn, opts?.userText)) {
    return { ...proposal, partnerName: undefined, hubPartnerId: undefined };
  }
  if (await isLikelyHubAssigneeName(pn)) {
    return { ...proposal, partnerName: undefined, hubPartnerId: undefined };
  }
  return proposal;
}

/** Try to pull a company/partner name from free-form intake text. */
export function extractPartnerNameFromIntakeText(text: string): string | null {
  const t = text.trim();
  if (!t) return null;

  const skip = /^(商务|记录|一下|个|这条|电话|微信|帮我|请)/i;
  const patterns: RegExp[] = [
    /(?:联系|拜访|走访|对接|跟进|会见|见了|去了|电话(?:给|联系)?|微信(?:联系)?|约了)\s*(?:了|过|一下)?\s*([A-Za-z0-9\u4e00-\u9fa5][A-Za-z0-9\u4e00-\u9fa5\s.&'-]{0,48}?)\s*(?:的|负责人|联系人|VP|CEO|CTO|总经理|总监|team|团队)/i,
    /\b([A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,4}(?:\s+(?:Group|Corp|Ltd|LLC|Inc|Co|Technology|Solutions))?)\b\s*(?:的|负责人|联系人)/,
    /(?:伙伴|客户|公司|partner|customer)[：:\s]+([^\n,，。；;]{2,48})/i,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    const name = m?.[1]?.trim().replace(/\s+/g, " ");
    if (name && name.length >= 2 && !skip.test(name)) return name;
  }
  return null;
}

/** Attach partnerName from user text when open intake missed it in the proposal. */
export async function enrichProposalPartnerFromText(
  proposal: IntakeProposal,
  userText: string,
  boundPartnerId?: string
): Promise<IntakeProposal> {
  if (boundPartnerId || proposal.partnerName?.trim()) {
    return sanitizeOpenIntakePartnerName(proposal, { userText, boundPartnerId });
  }
  const stripped = stripWecomCommandPrefixForIntake(userText);
  const extracted = extractPartnerNameFromIntakeText(stripped);
  if (!extracted || isLikelyWecomBotMentionName(extracted, userText)) {
    return sanitizeOpenIntakePartnerName(proposal, { userText, boundPartnerId });
  }
  if (await isLikelyHubAssigneeName(extracted)) return proposal;
  const match = await lookupSinglePartnerByName(extracted);
  return sanitizeOpenIntakePartnerName(
    { ...proposal, partnerName: match?.name ?? extracted },
    { userText, boundPartnerId },
  );
}

export type ResolveIntakePartnerResult =
  | { ok: true; partnerId: string; partnerName: string }
  | { ok: false; error: string };

export type ResolveIntakeTodoOwnerResult =
  | { ok: true; partnerId: string; partnerName: string; customerId: string; customerName: string }
  | { ok: false; error: string };

/** Resolve todo owner: bound customer/partner wins, else match Hub partner or customer entity by name. */
export async function resolveIntakeTodoOwner(opts: {
  boundPartnerId?: string;
  boundCustomerId?: string;
  proposal: IntakeProposal;
  locale: Locale;
}): Promise<ResolveIntakeTodoOwnerResult> {
  const empty = { partnerId: "", partnerName: "", customerId: "", customerName: "" };

  if (opts.boundPartnerId) {
    const partner = await db.partner.findUnique({
      where: { id: opts.boundPartnerId },
      select: { id: true, name: true },
    });
    if (!partner) {
      return {
        ok: false,
        error: opts.locale === "zh" ? "绑定的伙伴不存在或已被删除" : "Bound partner not found",
      };
    }
    return { ok: true, ...empty, partnerId: partner.id, partnerName: partner.name };
  }

  if (opts.boundCustomerId) {
    const customer = await db.customer.findUnique({
      where: { id: opts.boundCustomerId },
      select: { id: true, name: true },
    });
    if (!customer) {
      return {
        ok: false,
        error: opts.locale === "zh" ? "绑定的客户不存在或已被删除" : "Bound customer not found",
      };
    }
    return { ok: true, ...empty, customerId: customer.id, customerName: customer.name };
  }

  if (opts.proposal.customerId) {
    const customer = await db.customer.findUnique({
      where: { id: opts.proposal.customerId },
      select: { id: true, name: true },
    });
    if (customer) {
      return { ok: true, ...empty, customerId: customer.id, customerName: customer.name };
    }
  }

  const customerName = opts.proposal.customerName?.trim();
  if (customerName) {
    const matches = await findCustomersByName(customerName);
    if (matches.length === 1) {
      return { ok: true, ...empty, customerId: matches[0]!.id, customerName: matches[0]!.name };
    }
    if (matches.length > 1) {
      const exact = matches.find((m) => m.name.toLowerCase() === customerName.toLowerCase());
      if (exact) return { ok: true, ...empty, customerId: exact.id, customerName: exact.name };
      return {
        ok: false,
        error:
          opts.locale === "zh"
            ? `找到多家匹配客户：${matches.map((m) => m.name).join("、")}，请确认具体是哪家`
            : `Multiple customers match: ${matches.map((m) => m.name).join(", ")} — specify which one`,
      };
    }
  }

  const partnerName = opts.proposal.partnerName?.trim();
  if (!partnerName) return { ok: true, ...empty };

  const partnerMatches = await findPartnersByName(partnerName);
  if (partnerMatches.length === 1) {
    return {
      ok: true,
      partnerId: partnerMatches[0]!.id,
      partnerName: partnerMatches[0]!.name,
      customerId: "",
      customerName: "",
    };
  }
  if (partnerMatches.length > 1) {
    const exact = partnerMatches.find((m) => m.name.toLowerCase() === partnerName.toLowerCase());
    if (exact) {
      return { ok: true, partnerId: exact.id, partnerName: exact.name, customerId: "", customerName: "" };
    }
    return {
      ok: false,
      error:
        opts.locale === "zh"
          ? `找到多家匹配伙伴：${partnerMatches.map((m) => m.name).join("、")}，请确认具体是哪家`
          : `Multiple partners match: ${partnerMatches.map((m) => m.name).join(", ")} — specify which one`,
    };
  }

  const customer = await lookupSingleCustomerByName(partnerName);
  if (customer) {
    return { ok: true, ...empty, customerId: customer.id, customerName: customer.name };
  }

  return {
    ok: false,
    error:
      opts.locale === "zh"
        ? `未找到名为「${partnerName}」的伙伴或客户，请确认是否创建不关联待办`
        : `No partner or customer found for "${partnerName}" — confirm an unlinked todo before saving`,
  };
}

/** Resolve which partner an intake apply belongs to (bound context wins). */
export async function resolveIntakePartner(opts: {
  scope: IntakeScope;
  boundPartnerId?: string;
  proposal: IntakeProposal;
  locale: Locale;
}): Promise<ResolveIntakePartnerResult> {
  if (opts.boundPartnerId) {
    const partner = await db.partner.findUnique({
      where: { id: opts.boundPartnerId },
      select: { id: true, name: true },
    });
    if (!partner) {
      return {
        ok: false,
        error: opts.locale === "zh" ? "绑定的伙伴不存在或已被删除" : "Bound partner not found",
      };
    }
    return { ok: true, partnerId: partner.id, partnerName: partner.name };
  }

  if (opts.scope === "todo") {
    const name = opts.proposal.partnerName?.trim();
    if (!name) return { ok: true, partnerId: "", partnerName: "" };
    const matches = await findPartnersByName(name);
    if (matches.length === 1) return { ok: true, partnerId: matches[0]!.id, partnerName: matches[0]!.name };
    if (matches.length > 1) {
      const exact = matches.find((m) => m.name.toLowerCase() === name.toLowerCase());
      if (exact) return { ok: true, partnerId: exact.id, partnerName: exact.name };
      return {
        ok: false,
        error:
          opts.locale === "zh"
            ? `找到多家匹配伙伴：${matches.map((m) => m.name).join("、")}，请确认具体是哪家`
            : `Multiple partners match: ${matches.map((m) => m.name).join(", ")} — specify which one`,
      };
    }
    return {
      ok: false,
      error:
        opts.locale === "zh"
          ? `未找到名为「${name}」的伙伴，请确认是否创建不关联待办`
          : `No partner found for "${name}" — confirm an unlinked todo before saving`,
    };
  }

  if (!intakeScopeRequiresPartner(opts.scope)) {
    return { ok: true, partnerId: "", partnerName: "" };
  }

  const name = opts.proposal.partnerName?.trim();
  if (!name) {
    return {
      ok: false,
      error:
        opts.locale === "zh"
          ? "请说明这条记录属于哪个伙伴/客户（说出公司名称），或在伙伴详情页 / 已绑定企微群中录入"
          : "Say which partner/customer this belongs to, or log it from a partner page / bound WeCom group",
    };
  }

  const matches = await findPartnersByName(name);
  if (matches.length === 1) return { ok: true, partnerId: matches[0]!.id, partnerName: matches[0]!.name };
  if (matches.length > 1) {
    return {
      ok: false,
      error:
        opts.locale === "zh"
          ? `「${name}」匹配到多家伙伴：${matches.map((m) => m.name).join("、")}，请用更准确的公司全称`
          : `"${name}" matches multiple partners: ${matches.map((m) => m.name).join(", ")} — use the full company name`,
    };
  }

  return {
    ok: false,
    error:
      opts.locale === "zh"
        ? `未找到名为「${name}」的伙伴，请先在系统中建档或核对公司名称`
        : `No partner found for "${name}" — onboard them first or check the company name`,
  };
}

export function buildPartnerBindingPrompt(opts: {
  locale: Locale;
  scope: IntakeScope;
  binding: IntakePartnerBinding;
}): string {
  if (opts.binding.mode === "bound") {
    const { partnerName } = opts.binding;
    if (opts.scope === "business_record") {
      return opts.locale === "zh"
        ? `[伙伴绑定 · 已锁定]\n当前录入会话已绑定伙伴「${partnerName}」。商务记录默认归属该伙伴；不要追问属于哪家公司。\nproposal.partnerName 必须设为「${partnerName}」。\nbusinessRecords 至少一条；必须填写 title、traceNature（现场/非现场）与 traceAction（CRM 商务行为）；ready=true 仅当上述字段齐全。\n用户回复「确认」（企微/Web 均可）后才会保存并同步 CRM。`
        : `[Partner binding · locked]\nBound to "${partnerName}". Set proposal.partnerName to "${partnerName}". businessRecords must have ≥1 item with title, traceNature, traceAction; ready=true only when complete. User replies「确认」(WeCom or Web) before CRM sync.`;
    }
    return opts.locale === "zh"
      ? `[伙伴绑定 · 已锁定]\n当前录入会话已绑定伙伴「${partnerName}」。商务记录、商机、联系人、待办、培训、联合方案等默认全部归属该伙伴；不要追问属于哪家公司。\nproposal.partnerName 必须设为「${partnerName}」。\n「给 X / 负责人 X」中的 X 是 Hub 团队成员 assigneeName；「给我/帮我加个待办」表示负责人为当前操作人（assigneeName=「我」），不是 partnerName。\n任务内容里提到的客户/公司名（如华为云金融）不要写入 partnerName。\n信息足够时 ready=true；企微群需用户 @机器人 回复「确认」后才会保存。`
      : `[Partner binding · locked]\nThis session is bound to "${partnerName}". All records belong to this partner.\nSet proposal.partnerName to "${partnerName}". Names after「给/for」or「负责人/owner」go in assigneeName, not partnerName.\nSet ready=true when extraction is complete; WeCom groups require @bot confirm before save.`;
  }

  if (opts.scope === "todo") {
    return opts.locale === "zh"
      ? `[开放式录入 · 待办]\n未预选伙伴/客户。优先从用户描述中提取公司名：先匹配 Partner Hub 伙伴（proposal.partnerName），若无伙伴则匹配 Hub 客户档案（proposal.customerName / customerId）。唯一匹配则自动关联；多家匹配须 blocking 澄清。若提到公司名但伙伴与客户均未找到，须 blocking 确认是否创建不关联待办。未提及公司名则可创建全局待办。`
      : `[Open intake · todo]\nLink to a Hub partner (proposal.partnerName) or end-customer (proposal.customerName/customerId) when the user names a company. Single match → auto-link; multiple → blocking disambiguation. If neither found, require blocking confirmation before an unlinked todo. No company → global todo OK.`;
  }

  if (intakeScopeRequiresPartner(opts.scope)) {
    return opts.locale === "zh"
      ? `[开放式录入]\n未预选伙伴。必须从用户描述中提取公司名称并写入 proposal.partnerName；若无法确定，发出 partnerName 澄清项（kind:"identity", blocking:true）。`
      : `[Open intake]\nNo partner pre-selected. Extract the company name into proposal.partnerName; if unclear, emit a blocking partnerName clarification.`;
  }

  return "";
}

export function buildCustomerBindingPrompt(opts: {
  locale: Locale;
  scope: IntakeScope;
  customerName: string;
  customerId: string;
}): string {
  const { customerName, customerId } = opts;
  if (opts.scope === "business_record") {
    return opts.locale === "zh"
      ? `[客户绑定 · 已锁定]\n当前录入会话已绑定客户「${customerName}」。商务记录默认归属该客户；不要追问属于哪家公司。\nproposal.customerName 必须设为「${customerName}」，proposal.customerId 设为「${customerId}」。\nbusinessRecords 至少一条；必须填写 title、traceNature（现场/非现场）与 traceAction（CRM 商务行为）；ready=true 仅当上述字段齐全。\n用户回复「确认」后才会保存。`
      : `[Customer binding · locked]\nBound to "${customerName}". Set proposal.customerName/customerId. businessRecords must have ≥1 item with title, traceNature, traceAction; ready=true only when complete.`;
  }
  if (opts.scope === "todo") {
    return opts.locale === "zh"
      ? `[客户绑定 · 已锁定]\n当前录入会话已绑定客户「${customerName}」。待办默认归属该客户；不要追问属于哪家公司。\nproposal.customerName 必须设为「${customerName}」，proposal.customerId 设为「${customerId}」。信息足够时 ready=true。`
      : `[Customer binding · locked]\nBound to "${customerName}". Set proposal.customerName/customerId. Set ready=true when the todo title is clear.`;
  }
  return opts.locale === "zh"
    ? `[客户绑定 · 已锁定]\n当前录入会话已绑定客户「${customerName}」。默认全部归属该客户；不要追问属于哪家公司。`
    : `[Customer binding · locked]\nBound to customer "${customerName}". All records belong to this customer.`;
}

export const TODO_PARTNER_NOT_FOUND_ID = "todo-partner-not-found";

const CONFIRM_UNLINKED_TODO_ZH = "是，创建不关联待办";
const CONFIRM_UNLINKED_TODO_EN = "Yes, create without linking";

export function confirmUnlinkedTodoOption(locale: Locale): string {
  return locale === "zh" ? CONFIRM_UNLINKED_TODO_ZH : CONFIRM_UNLINKED_TODO_EN;
}

export function isConfirmUnlinkedTodoOption(value: string): boolean {
  const v = value.trim();
  return (
    v === CONFIRM_UNLINKED_TODO_ZH ||
    v === CONFIRM_UNLINKED_TODO_EN ||
    /^是[，,]?\s*创建不关联/i.test(v)
  );
}

/** Try to link a todo to a partner or customer; confirm before saving unlinked when lookup fails. */
export async function enrichTodoPartnerBinding(opts: {
  proposal: IntakeProposal;
  userText?: string;
  boundPartnerId?: string;
  boundCustomerId?: string;
  locale: Locale;
  existingClarifications: IntakeClarification[];
}): Promise<{ proposal: IntakeProposal; clarifications: IntakeClarification[] }> {
  if (opts.boundPartnerId) {
    const partner = await db.partner.findUnique({
      where: { id: opts.boundPartnerId },
      select: { id: true, name: true },
    });
    if (!partner) return { proposal: opts.proposal, clarifications: [] };
    return {
      proposal: {
        ...opts.proposal,
        partnerName: partner.name,
        hubPartnerId: partner.id,
        customerId: undefined,
        customerName: undefined,
      },
      clarifications: [],
    };
  }
  if (opts.boundCustomerId) {
    const customer = await db.customer.findUnique({
      where: { id: opts.boundCustomerId },
      select: { id: true, name: true },
    });
    if (customer) {
      return {
        proposal: {
          ...opts.proposal,
          customerId: customer.id,
          customerName: customer.name,
          partnerName: undefined,
        },
        clarifications: [],
      };
    }
    return { proposal: opts.proposal, clarifications: [] };
  }
  if (
    opts.existingClarifications.some(
      (c) => c.id === "partnerName" || c.id === TODO_PARTNER_NOT_FOUND_ID
    )
  ) {
    return { proposal: opts.proposal, clarifications: [] };
  }

  let proposal = opts.proposal;
  proposal = await sanitizeOpenIntakePartnerName(proposal, {
    userText: opts.userText,
    boundPartnerId: opts.boundPartnerId,
    boundCustomerId: opts.boundCustomerId,
  });
  if (opts.userText?.trim()) {
    proposal = await enrichProposalPartnerFromText(proposal, opts.userText, opts.boundPartnerId);
  }

  const clarifications: IntakeClarification[] = [];
  const name = proposal.customerName?.trim() || proposal.partnerName?.trim();

  if (name) {
    const partnerMatches = await findPartnersByName(name);
    if (partnerMatches.length === 1) {
      return {
        proposal: { ...proposal, partnerName: partnerMatches[0]!.name, customerId: undefined, customerName: undefined },
        clarifications: [],
      };
    }
    if (partnerMatches.length > 1) {
      clarifications.push({
        id: "partnerName",
        question:
          opts.locale === "zh"
            ? "找到多家匹配伙伴，请确认要关联哪家："
            : "Multiple partners match — which one should this todo link to?",
        options: partnerMatches.map((m) => m.name),
        multi: false,
        allowOther: true,
        apply: "direct",
        kind: "identity",
        blocking: true,
      });
      return { proposal, clarifications };
    }

    const customerMatches = await findCustomersByName(name);
    if (customerMatches.length === 1) {
      return {
        proposal: {
          ...proposal,
          customerId: customerMatches[0]!.id,
          customerName: customerMatches[0]!.name,
          partnerName: undefined,
        },
        clarifications: [],
      };
    }
    if (customerMatches.length > 1) {
      clarifications.push({
        id: "customerName",
        question:
          opts.locale === "zh"
            ? "找到多家匹配客户，请确认要关联哪家："
            : "Multiple customers match — which one should this todo link to?",
        options: customerMatches.map((m) => m.name),
        multi: false,
        allowOther: true,
        apply: "direct",
        kind: "identity",
        blocking: true,
      });
      return { proposal, clarifications };
    }

    clarifications.push({
      id: TODO_PARTNER_NOT_FOUND_ID,
      question:
        opts.locale === "zh"
          ? `未在系统中找到「${name}」（伙伴或客户均未匹配）。是否创建不关联待办？也可在下方输入正确公司名。`
          : `"${name}" was not found as a partner or customer. Create an unlinked todo? Or enter the correct company name below.`,
      options: [confirmUnlinkedTodoOption(opts.locale)],
      multi: false,
      allowOther: true,
      apply: "direct",
      kind: "identity",
      blocking: true,
    });
    return { proposal, clarifications };
  }

  if (opts.userText?.trim()) {
    const suggestions = await suggestPartnersFromIntakeText(opts.userText, 5);
    if (suggestions.length === 1) {
      proposal = { ...proposal, partnerName: suggestions[0]!.name };
    } else if (suggestions.length > 1) {
      clarifications.push({
        id: "partnerName",
        question:
          opts.locale === "zh"
            ? "找到多家可能相关的伙伴，请确认要关联哪家："
            : "Several partners may match — which one should this todo link to?",
        options: suggestions.map((m) => m.name),
        multi: false,
        allowOther: true,
        apply: "direct",
        kind: "identity",
        blocking: true,
      });
    }
  }

  return { proposal, clarifications };
}
