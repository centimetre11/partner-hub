import type { Locale } from "./i18n/locale";

/**
 * Shared first message for partner/customer "AI 补全".
 * Existing archive is injected server-side via partnerContext / customerContext;
 * this prompt tells the model to research blanks without clobbering good data.
 */
export function profileEnrichSeedMessage(locale: Locale, kind: "partner" | "customer"): string {
  if (locale === "zh") {
    return kind === "customer"
      ? "请基于系统里已有的客户档案，联网检索并补全空白字段（行业、规模、城市、国家、官网、细分客群、ICP 优先级、购买触发点、进入路径、主联系人等）。已有准确信息不要随意覆盖；拿不准的用澄清问题确认后再写。"
      : "请基于系统里已有的伙伴档案，联网检索并补全空白字段（Tier、类型、行业、价值模式、画像、官网、城市等）。已有准确信息不要随意覆盖；拿不准的用澄清问题确认后再写。";
  }
  return kind === "customer"
    ? "Using the existing customer profile in the system, research online and fill blank fields (industry, scale, city, country, website, customer segment, ICP tier, buying trigger, entry path, primary contact, etc.). Do not overwrite accurate existing values; ask clarifications when unsure."
    : "Using the existing partner profile in the system, research online and fill blank fields (tier, category, industries, value pattern, portrait, website, city, etc.). Do not overwrite accurate existing values; ask clarifications when unsure.";
}
