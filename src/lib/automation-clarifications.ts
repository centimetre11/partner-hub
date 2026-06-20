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
type EmailOption = { id: string; name: string; email: string };

export type AutomationBuilderOptions = {
  partners: PartnerOption[];
  wecomChats: WecomOption[];
  emails: EmailOption[];
};

function wecomOptionLabel(c: WecomOption): string {
  const parts = [c.partnerName, c.label].filter(Boolean);
  return parts.length ? parts.join(" · ") : c.chatId.slice(0, 12);
}

export function resolveWecomChatByLabel(
  value: string,
  wecomChats: WecomOption[]
): WecomOption | undefined {
  return wecomChats.find((c) => wecomOptionLabel(c) === value);
}

function hasClarificationAbout(clarifications: AutomationBuilderClarification[], hint: RegExp): boolean {
  return clarifications.some((c) => hint.test(c.question) || hint.test(c.id));
}

function isBuiltinClarificationId(id: string): boolean {
  return id === "partner-pick" || id === "wecom-pick" || id === "email-pick" || id === "delivery-pick";
}

/** 去掉 AI 生成的「请提供 chatId」类澄清，改由系统选项接管 */
function stripManualIdClarifications(clarifications: AutomationBuilderClarification[]): AutomationBuilderClarification[] {
  return clarifications.filter((c) => {
    if (isBuiltinClarificationId(c.id)) return true;
    const text = `${c.question} ${c.options.join(" ")}`;
    return !/chatId|chat_id|群\s*ID|具体群|provide.*group|提供.*群/i.test(text);
  });
}

function emailOptionLabel(e: EmailOption): string {
  return e.name ? `${e.name} · ${e.email}` : e.email;
}

export function followUpClarificationsAfterDeliveryPick(
  deliveryAnswer: string,
  draft: AutomationBuilderDraft,
  opts: AutomationBuilderOptions,
  locale: Locale
): AutomationBuilderClarification[] {
  const out: AutomationBuilderClarification[] = [];
  const wantsWecom = /企微|WeCom/i.test(deliveryAnswer);
  const wantsEmail = /邮件|Email/i.test(deliveryAnswer);
  if (wantsWecom && !draft.wecomPushChatId.trim() && opts.wecomChats.length > 0) {
    out.push({
      id: "wecom-pick",
      question: locale === "zh" ? "推送到哪个企微群？" : "Which WeCom group should receive pushes?",
      options: opts.wecomChats.map((c) => wecomOptionLabel(c)),
      control: "select",
      placeholder: locale === "zh" ? "选择企微群…" : "Select WeCom group…",
      tier: "required",
    });
  }
  if (wantsEmail && !draft.pushEmailTo.trim() && opts.emails.length > 0) {
    out.push({
      id: "email-pick",
      question: locale === "zh" ? "发送到哪个邮箱？" : "Which email should receive pushes?",
      options: opts.emails.map((e) => emailOptionLabel(e)),
      control: "select",
      placeholder: locale === "zh" ? "选择邮箱…" : "Select email…",
      tier: "required",
    });
  }
  return out;
}

export function applyClarificationAnswersToDraft(
  draft: AutomationBuilderDraft,
  answers: { id: string; value: string }[],
  opts: AutomationBuilderOptions
): AutomationBuilderDraft {
  let next = { ...draft };
  for (const ans of answers) {
    if (ans.id === "partner-pick") {
      if (/暂不指定|None \(not partner/i.test(ans.value)) {
        next = { ...next, partnerId: "" };
      } else {
        const p = opts.partners.find((x) => x.name === ans.value || ans.value.startsWith(x.name));
        if (p) next = { ...next, partnerId: p.id };
      }
    }
    if (ans.id === "wecom-pick") {
      const chat = resolveWecomChatByLabel(ans.value, opts.wecomChats);
      if (chat) next = { ...next, wecomPushChatId: chat.chatId };
    }
    if (ans.id === "email-pick") {
      const e = opts.emails.find((x) => ans.value.includes(x.email));
      if (e) next = { ...next, pushEmailTo: e.email };
      else if (ans.value.includes("@")) next = { ...next, pushEmailTo: ans.value.trim() };
    }
  }
  return next;
}

export function filterSatisfiedClarifications(
  clarifications: AutomationBuilderClarification[],
  draft: AutomationBuilderDraft
): AutomationBuilderClarification[] {
  return clarifications.filter((c) => {
    if (c.id === "partner-pick" && draft.partnerId.trim()) return false;
    if (c.id === "wecom-pick" && draft.wecomPushChatId.trim()) return false;
    if (c.id === "email-pick" && draft.pushEmailTo.trim()) return false;
    if (c.id === "delivery-pick" && (draft.wecomPushChatId.trim() || draft.pushEmailTo.trim())) return false;
    return true;
  });
}

/** 补足 AI 未生成的必答澄清（伙伴 / 企微群 / 邮箱） */
export function enrichAutomationClarifications(opts: {
  clarifications: AutomationBuilderClarification[];
  messages: AutomationBuilderMessage[];
  partnerId: string;
  wecomPushChatId: string;
  pushEmailTo: string;
  partners: PartnerOption[];
  wecomChats: WecomOption[];
  emails: EmailOption[];
  locale: Locale;
  boundPartnerId?: string;
}): AutomationBuilderClarification[] {
  const userText = extractLastUserPlainText(opts.messages);
  const out = stripManualIdClarifications([...opts.clarifications]);

  const needPartner =
    mentionsPartnerRef(userText) && !opts.partnerId.trim() && !opts.boundPartnerId && opts.partners.length > 0;
  if (needPartner && !hasClarificationAbout(out, /伙伴|partner|客户/i)) {
    const options = opts.partners.map((p) => p.name);
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
      control: "select",
      placeholder: opts.locale === "zh" ? "选择伙伴 / 客户…" : "Select partner / customer…",
      tier: "required",
    });
  }

  const userWantsWecom = mentionsWecomPush(userText);
  const userWantsEmail = mentionsEmailPush(userText);
  const needWecom = userWantsWecom && !opts.wecomPushChatId.trim() && opts.wecomChats.length > 0;
  if (needWecom && !hasClarificationAbout(out, /企微|wecom|群/i)) {
    out.unshift({
      id: "wecom-pick",
      question: opts.locale === "zh" ? "推送到哪个企微群？" : "Which WeCom group should receive pushes?",
      options: opts.wecomChats.map((c) => wecomOptionLabel(c)),
      control: "select",
      placeholder: opts.locale === "zh" ? "选择企微群…" : "Select WeCom group…",
      tier: "required",
    });
  }

  const needEmail = userWantsEmail && !opts.pushEmailTo.trim() && opts.emails.length > 0;
  if (needEmail && !hasClarificationAbout(out, /邮件|email/i)) {
    out.unshift({
      id: "email-pick",
      question: opts.locale === "zh" ? "发送到哪个邮箱？" : "Which email should receive pushes?",
      options: opts.emails.map((e) => emailOptionLabel(e)),
      control: "select",
      placeholder: opts.locale === "zh" ? "选择邮箱…" : "Select email…",
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

  return normalizeAutomationClarifications(out);
}

/** 保留 select 控件的全量选项，仅规范化 choice 类澄清 */
function normalizeAutomationClarifications(items: AutomationBuilderClarification[]): AutomationBuilderClarification[] {
  const max = 5;
  const out: AutomationBuilderClarification[] = [];
  for (let i = 0; i < items.length && out.length < max; i++) {
    const raw = items[i]!;
    if (raw.control === "select") {
      out.push({
        ...raw,
        tier: raw.tier ?? "required",
        allowOther: false,
      });
      continue;
    }
    const c = normalizeAiClarifications([raw], { max: 1, defaultTier: "required" })[0];
    if (c) out.push(c);
  }
  return out;
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
