import type { AutomationBuilderClarification, AutomationBuilderDraft, AutomationBuilderMessage } from "./automation-builder-types";
import { getClarificationTier, normalizeAiClarifications } from "./ai-clarifications";
import type { BuilderDeliveryPrefs } from "./builder-context-prompt";
import type { Locale } from "./i18n/locale";

export function extractLastUserPlainText(messages: AutomationBuilderMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  const content = last.content;
  for (const marker of ["用户需求：", "User request:"]) {
    const idx = content.indexOf(marker);
    if (idx >= 0) return content.slice(idx + marker.length).trim();
  }
  return content.trim();
}

export function mentionsPartnerRef(text: string): boolean {
  return /这个伙伴|该伙伴|这个客户|该客户|本伙伴|this partner|this customer|bound partner/i.test(text);
}

export function mentionsWecomPush(text: string): boolean {
  return /发到.*群|推到.*群|推送.*群|推送到.*群|企微|微信群|微信.*群|wecom|wechat.*group|push to (the )?group/i.test(text);
}

export function mentionsEmailPush(text: string): boolean {
  return /发邮件|邮件给我|email me|send email|push.*email/i.test(text);
}

type WecomOption = { chatId: string; label: string | null; partnerName: string | null };
type PartnerOption = { id: string; name: string };

function wecomOptionLabel(c: WecomOption): string {
  const parts = [c.partnerName, c.label].filter(Boolean);
  return parts.length ? parts.join(" · ") : c.chatId.slice(0, 12);
}

function hasClarificationAbout(clarifications: AutomationBuilderClarification[], hint: RegExp): boolean {
  return clarifications.some((c) => hint.test(c.question) || hint.test(c.id));
}

const DROPDOWN_CLARIFICATION_IDS = new Set(["partner-pick", "wecom-pick", "delivery-pick"]);

/** Web 构建器已有下拉：去掉伙伴/群/chatId/推送渠道类对话选项 */
export function isDropdownResolvableClarification(
  c: AutomationBuilderClarification,
  partners: PartnerOption[] = []
): boolean {
  if (DROPDOWN_CLARIFICATION_IDS.has(c.id)) return true;
  const q = c.question;
  const optText = c.options.join(" ");
  if (/chatId|chat_id|群\s*ID/i.test(q) || /chatId|chat_id/i.test(optText)) return true;
  if (/企微|微信群|WeCom|wecom/i.test(q) && /群|group|chatId/i.test(q + optText)) return true;
  if (/伙伴|客户|partner|customer/i.test(q) && partners.some((p) => c.options.includes(p.name))) return true;
  if (/推送到哪里|推送.*哪里|delivery channel|where.*deliver/i.test(q)) return true;
  if (/邮件|email/i.test(q) && /推送|push|deliver/i.test(q)) return true;
  return false;
}

export function filterDropdownClarifications(
  clarifications: AutomationBuilderClarification[],
  partners: PartnerOption[] = []
): AutomationBuilderClarification[] {
  return clarifications.filter((c) => !isDropdownResolvableClarification(c, partners));
}

export type DropdownGap = "partner" | "wecom" | "email" | "delivery";

/** 底部栏待选项（用于提示，不阻塞对话） */
export function computeDropdownGaps(opts: {
  messages: AutomationBuilderMessage[];
  partnerId: string;
  wecomPushChatId: string;
  pushEmailTo: string;
  boundPartnerId?: string;
}): DropdownGap[] {
  const userText = extractLastUserPlainText(opts.messages);
  const gaps: DropdownGap[] = [];
  const wantsPartner = mentionsPartnerRef(userText);
  const wantsWecom = mentionsWecomPush(userText);
  const wantsEmail = mentionsEmailPush(userText);

  if (wantsPartner && !opts.partnerId.trim() && !opts.boundPartnerId) {
    gaps.push("partner");
  }
  if (wantsWecom && !opts.wecomPushChatId.trim()) {
    gaps.push("wecom");
  }
  if (wantsEmail && !opts.pushEmailTo.trim()) {
    gaps.push("email");
  }
  if (
    !opts.wecomPushChatId.trim() &&
    !opts.pushEmailTo.trim() &&
    !wantsWecom &&
    !wantsEmail &&
    userText.length > 0
  ) {
    gaps.push("delivery");
  }
  return gaps;
}

/** 补足 AI 未生成的必答澄清（仅企微 Bot 等无下拉场景） */
export function enrichAutomationClarifications(opts: {
  clarifications: AutomationBuilderClarification[];
  messages: AutomationBuilderMessage[];
  partnerId: string;
  wecomPushChatId: string;
  pushEmailTo: string;
  partners: PartnerOption[];
  wecomChats: WecomOption[];
  locale: Locale;
  boundPartnerId?: string;
  /** Web 构建器用 dropdown，不在对话里重复问伙伴/群/邮箱 */
  deliveryPicker?: "dropdown" | "chat";
}): AutomationBuilderClarification[] {
  const userText = extractLastUserPlainText(opts.messages);
  const picker = opts.deliveryPicker ?? "chat";
  let out = filterDropdownClarifications([...opts.clarifications], opts.partners);

  if (picker === "dropdown") {
    return normalizeAiClarifications(out, { max: 5, defaultTier: "required" }) as AutomationBuilderClarification[];
  }

  const needPartner =
    mentionsPartnerRef(userText) && !opts.partnerId.trim() && !opts.boundPartnerId && opts.partners.length > 0;
  if (needPartner && !hasClarificationAbout(out, /伙伴|partner|客户/i)) {
    const options = opts.partners.slice(0, 6).map((p) => p.name);
    if (opts.locale === "zh") {
      options.push("暂不指定（与伙伴无关）");
    } else {
      options.push("None (not partner-scoped)");
    }
    out.unshift({
      id: "partner-pick",
      question:
        opts.locale === "zh"
          ? "你提到「这个伙伴/客户」— 具体是哪位？"
          : "You mentioned “this partner/customer” — which one?",
      options,
      tier: "required",
    });
  }

  const userWantsWecom = mentionsWecomPush(userText);
  const userWantsEmail = mentionsEmailPush(userText);
  const needWecom = userWantsWecom && !opts.wecomPushChatId.trim() && opts.wecomChats.length > 0;
  if (needWecom && !hasClarificationAbout(out, /企微|wecom|群/i)) {
    const options = opts.wecomChats.slice(0, 6).map((c) => wecomOptionLabel(c));
    out.unshift({
      id: "wecom-pick",
      question: opts.locale === "zh" ? "推送到哪个企微群？" : "Which WeCom group should receive pushes?",
      options,
      tier: "required",
    });
  }

  const needDelivery =
    !opts.wecomPushChatId.trim() &&
    !opts.pushEmailTo.trim() &&
    !userWantsWecom &&
    !userWantsEmail &&
    !hasClarificationAbout(out, /推送|delivery|渠道/i);
  if (needDelivery) {
    out.unshift({
      id: "delivery-pick",
      question: opts.locale === "zh" ? "结果推送到哪里？" : "Where should results be delivered?",
      options:
        opts.locale === "zh"
          ? ["企微群", "邮件", "企微群 + 邮件"]
          : ["WeCom group", "Email", "WeCom + Email"],
      tier: "required",
    });
  }

  return normalizeAiClarifications(out, { max: 5, defaultTier: "required" }) as AutomationBuilderClarification[];
}

export function clarificationsBlockReady(clarifications: AutomationBuilderClarification[]): boolean {
  return clarifications.some((c) => getClarificationTier(c) === "required");
}

/** 按用户原文 + 显式配置修正草案，去掉 AI 臆造的默认邮箱/伙伴/企微 */
export function applyUserDeliveryIntent(
  draft: AutomationBuilderDraft,
  opts: {
    messages: AutomationBuilderMessage[];
    deliveryPrefs?: Partial<BuilderDeliveryPrefs>;
    boundPartnerId?: string;
    sourceChatId?: string;
  }
): AutomationBuilderDraft {
  const userText = extractLastUserPlainText(opts.messages);
  const wantsWecom = mentionsWecomPush(userText);
  const wantsEmail = mentionsEmailPush(userText);
  const wantsPartner = mentionsPartnerRef(userText);

  const prefPartner = opts.deliveryPrefs?.partnerId?.trim() ?? "";
  const prefWecom = opts.deliveryPrefs?.wecomChatId?.trim() ?? "";
  const prefEmail = opts.deliveryPrefs?.email?.trim() ?? "";

  let partnerId = draft.partnerId.trim();
  let wecomPushChatId = draft.wecomPushChatId.trim();
  let pushEmailTo = draft.pushEmailTo.trim();

  if (prefPartner) partnerId = prefPartner;
  else if (wantsPartner && opts.boundPartnerId) partnerId = opts.boundPartnerId;
  else if (wantsPartner && !prefPartner && !opts.boundPartnerId) partnerId = "";

  if (prefWecom) wecomPushChatId = prefWecom;
  else if (wantsWecom && opts.sourceChatId) wecomPushChatId = opts.sourceChatId;
  else if (wantsWecom && !prefWecom) wecomPushChatId = wecomPushChatId || "";

  if (prefEmail) pushEmailTo = prefEmail;
  else if (wantsEmail) pushEmailTo = pushEmailTo;
  else pushEmailTo = "";

  if (wantsWecom && !wantsEmail && !prefEmail) pushEmailTo = "";

  return { ...draft, partnerId, wecomPushChatId, pushEmailTo };
}
