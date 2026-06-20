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

/** 补足 AI 未生成的必答澄清（伙伴 / 企微群） */
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
}): AutomationBuilderClarification[] {
  const userText = extractLastUserPlainText(opts.messages);
  const out = [...opts.clarifications];

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
