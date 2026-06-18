import { db } from "./db";
import type { IntakeProposal } from "./ai-intake";
import type { IntakeScope } from "./ai-locale";
import type { Locale } from "./i18n/locale";

/** Scopes whose primary payload must belong to a specific partner */
export const PARTNER_REQUIRED_SCOPES: IntakeScope[] = [
  "powermap",
  "opportunity",
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

export type ResolveIntakePartnerResult =
  | { ok: true; partnerId: string; partnerName: string }
  | { ok: false; error: string };

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
      return {
        ok: false,
        error:
          opts.locale === "zh"
            ? `找到多家匹配伙伴：${matches.map((m) => m.name).join("、")}，请说明具体是哪家`
            : `Multiple partners match: ${matches.map((m) => m.name).join(", ")} — specify which one`,
      };
    }
    return { ok: true, partnerId: "", partnerName: name };
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
    return opts.locale === "zh"
      ? `[伙伴绑定 · 已锁定]\n当前录入会话已绑定伙伴「${partnerName}」。商务记录、商机、联系人、待办、培训、联合方案等默认全部归属该伙伴；不要追问属于哪家公司。\nproposal.partnerName 必须设为「${partnerName}」。信息足够时 ready=true（系统将自动保存，无需用户确认）。`
      : `[Partner binding · locked]\nThis session is bound to "${partnerName}". All records belong to this partner.\nSet proposal.partnerName to "${partnerName}". Set ready=true when extraction is complete (system auto-saves).`;
  }

  if (opts.scope === "todo") {
    return opts.locale === "zh"
      ? `[开放式录入 · 待办]\n未预选伙伴。待办可全局（不关联伙伴），若用户提到公司名则写入 proposal.partnerName 以便关联。`
      : `[Open intake · todo]\nNo partner pre-selected. Todos may be global; set proposal.partnerName when the user names a company.`;
  }

  if (intakeScopeRequiresPartner(opts.scope)) {
    return opts.locale === "zh"
      ? `[开放式录入]\n未预选伙伴。必须从用户描述中提取公司名称并写入 proposal.partnerName；若无法确定，发出 partnerName 澄清项（kind:"identity", blocking:true）。`
      : `[Open intake]\nNo partner pre-selected. Extract the company name into proposal.partnerName; if unclear, emit a blocking partnerName clarification.`;
  }

  return "";
}
