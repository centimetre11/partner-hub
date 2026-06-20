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
  return /发到.*邮箱|推到.*邮箱|发送?到.*邮箱|发到我的邮箱|我的邮箱|用邮箱|通过邮件|邮件推送|发邮件|邮件给我|email me|send email|push.*email|to my (email|mailbox)|via email/i.test(
    text
  );
}

/** 用户明确要查全部/所有正式伙伴 — 不应再问「哪个伙伴」 */
export function mentionsAllPartnersScope(text: string): boolean {
  return /所有.*(伙伴|客户|合作伙伴)|全部.*(伙伴|客户)|正式伙伴|正式合作伙伴|all partners|all active partners|every partner/i.test(
    text
  );
}

export function mentionsMyEmail(text: string): boolean {
  return /我的邮箱|my email|my mailbox|发给我/i.test(text);
}

/** 从用户原文推断推送邮箱（「我的邮箱」→ 当前登录用户） */
export function inferPushEmailFromText(text: string, userEmail?: string): string {
  if (!mentionsEmailPush(text)) return "";
  if (userEmail && mentionsMyEmail(text)) return userEmail.trim();
  const explicit = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
  return explicit?.[0]?.trim() ?? "";
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

function clarificationBlob(c: AutomationBuilderClarification): string {
  return `${c.id} ${c.question} ${c.options.join(" ")}`;
}

function isEmailTopicClarification(c: AutomationBuilderClarification): boolean {
  if (c.id === "email-pick") return true;
  if (isBuiltinClarificationId(c.id)) return false;
  return /邮件|email|邮箱/i.test(clarificationBlob(c));
}

function isPartnerTopicClarification(c: AutomationBuilderClarification): boolean {
  if (c.id === "partner-pick") return true;
  if (isBuiltinClarificationId(c.id)) return false;
  return /伙伴|partner|客户|customer/i.test(clarificationBlob(c));
}

function isWecomTopicClarification(c: AutomationBuilderClarification): boolean {
  if (c.id === "wecom-pick") return true;
  if (isBuiltinClarificationId(c.id)) return false;
  return /企微|wecom|微信群|群/i.test(clarificationBlob(c));
}

function stripTopicClarifications(
  clarifications: AutomationBuilderClarification[],
  match: (c: AutomationBuilderClarification) => boolean
): AutomationBuilderClarification[] {
  return clarifications.filter((c) => !match(c));
}

/** 用户已说清渠道或 AI 已填渠道时，去掉重复追问 */
function stripRedundantDeliveryClarifications(
  clarifications: AutomationBuilderClarification[],
  userText: string,
  draft: { pushEmailTo: string; wecomPushChatId: string }
): AutomationBuilderClarification[] {
  const hasEmail = Boolean(draft.pushEmailTo.trim());
  const hasWecom = Boolean(draft.wecomPushChatId.trim());
  const wantsEmail = mentionsEmailPush(userText) || hasEmail;
  const wantsWecom = mentionsWecomPush(userText) || hasWecom;
  if (!wantsEmail && !wantsWecom) return clarifications;

  return clarifications.filter((c) => {
    if (isBuiltinClarificationId(c.id)) return true;
    const blob = `${c.question} ${c.options.join(" ")}`;
    if (wantsEmail && /推送|delivery|渠道|是否|要不要|需不需要|用.*邮件|use.*email|send.*email/i.test(blob)) {
      return false;
    }
    if (wantsWecom && !wantsEmail && /推送|delivery|渠道|是否|要不要|企微|wecom|group/i.test(blob)) {
      return false;
    }
    return true;
  });
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
      allowOther: true,
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
      allowOther: true,
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

/** 仅在 AI 草案/澄清仍有缺口时补系统澄清（fallback，非每轮重判） */
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
  userEmail?: string;
}): AutomationBuilderClarification[] {
  const userText = extractLastUserPlainText(opts.messages);
  const inferredEmail = inferPushEmailFromText(userText, opts.userEmail);
  const effectiveEmail = opts.pushEmailTo.trim() || inferredEmail;
  const hasDelivery = Boolean(opts.wecomPushChatId.trim() || effectiveEmail);

  let out = stripManualIdClarifications([...opts.clarifications]);
  out = stripRedundantDeliveryClarifications(out, userText, {
    pushEmailTo: effectiveEmail,
    wecomPushChatId: opts.wecomPushChatId,
  });

  const needPartner =
    !opts.partnerId.trim() &&
    !opts.boundPartnerId &&
    opts.partners.length > 0 &&
    !mentionsAllPartnersScope(userText) &&
    (mentionsPartnerRef(userText) || out.some(isPartnerTopicClarification));
  if (needPartner) {
    out = stripTopicClarifications(out, isPartnerTopicClarification);
    out.unshift({
      id: "partner-pick",
      question:
        opts.locale === "zh"
          ? "你提到「这个伙伴/客户」— 具体是哪位？"
          : "You mentioned “this partner/customer” — which one?",
      options: (() => {
        const options = opts.partners.map((p) => p.name);
        if (opts.locale === "zh") options.push("暂不指定（与伙伴无关）");
        else options.push("None (not partner-scoped)");
        return options;
      })(),
      control: "select",
      allowOther: true,
      placeholder: opts.locale === "zh" ? "选择伙伴 / 客户…" : "Select partner / customer…",
      tier: "required",
    });
  }

  const userWantsWecom = mentionsWecomPush(userText);
  const userWantsEmail = mentionsEmailPush(userText);
  const aiAskedWecom = out.some(isWecomTopicClarification);
  const aiAskedEmail = out.some(isEmailTopicClarification);

  const needWecom =
    !opts.wecomPushChatId.trim() && opts.wecomChats.length > 0 && (userWantsWecom || aiAskedWecom);
  if (needWecom) {
    out = stripTopicClarifications(out, isWecomTopicClarification);
    out.unshift({
      id: "wecom-pick",
      question: opts.locale === "zh" ? "推送到哪个企微群？" : "Which WeCom group should receive pushes?",
      options: opts.wecomChats.map((c) => wecomOptionLabel(c)),
      control: "select",
      allowOther: true,
      placeholder: opts.locale === "zh" ? "选择企微群…" : "Select WeCom group…",
      tier: "required",
    });
  }

  const needEmail =
    !effectiveEmail && (userWantsEmail || aiAskedEmail) && (opts.emails.length > 0 || aiAskedEmail);
  if (needEmail) {
    out = stripTopicClarifications(out, isEmailTopicClarification);
    out.unshift({
      id: "email-pick",
      question:
        opts.locale === "zh"
          ? "请选择收件邮箱，或手动输入："
          : "Pick recipient email or type manually:",
      options: opts.emails.map((e) => emailOptionLabel(e)),
      control: "select",
      allowOther: true,
      placeholder: opts.locale === "zh" ? "选择邮箱…" : "Select email…",
      tier: "required",
    });
  }

  const needDelivery = !hasDelivery && !hasClarificationAbout(out, /推送|delivery|渠道/i);
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
        allowOther: raw.allowOther !== false,
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

/** AI 草案为主；规则仅在填空、纠正冲突、或补 AI 遗漏的必答澄清时介入 */
export function applyUserDeliveryIntent(
  draft: AutomationBuilderDraft,
  opts: {
    messages: AutomationBuilderMessage[];
    deliveryPrefs?: Partial<BuilderDeliveryPrefs>;
    boundPartnerId?: string;
    sourceChatId?: string;
    userEmail?: string;
  }
): AutomationBuilderDraft {
  const userText = extractLastUserPlainText(opts.messages);
  const wantsWecom = mentionsWecomPush(userText);
  const wantsEmail = mentionsEmailPush(userText);
  const wantsPartner = mentionsPartnerRef(userText);
  const allPartners = mentionsAllPartnersScope(userText);

  const prefPartner = opts.deliveryPrefs?.partnerId?.trim() ?? "";
  const prefWecom = opts.deliveryPrefs?.wecomChatId?.trim() ?? "";
  const prefEmail = opts.deliveryPrefs?.email?.trim() ?? "";

  let partnerId = draft.partnerId.trim();
  let wecomPushChatId = draft.wecomPushChatId.trim();
  let pushEmailTo = draft.pushEmailTo.trim();

  if (prefPartner) partnerId = prefPartner;
  if (prefWecom) wecomPushChatId = prefWecom;
  if (prefEmail) pushEmailTo = prefEmail;

  if (allPartners) {
    partnerId = "";
  } else if (!partnerId && wantsPartner && opts.boundPartnerId) {
    partnerId = opts.boundPartnerId;
  }

  if (!wecomPushChatId && wantsWecom && opts.sourceChatId) {
    wecomPushChatId = opts.sourceChatId;
  }

  const inferredEmail = inferPushEmailFromText(userText, opts.userEmail);
  if (!pushEmailTo && inferredEmail) {
    pushEmailTo = inferredEmail;
  }

  if (wantsWecom && !wantsEmail && !prefEmail && !inferredEmail) {
    pushEmailTo = "";
  }
  if (wantsEmail && !wantsWecom && !prefWecom) {
    wecomPushChatId = "";
  }

  return { ...draft, partnerId, wecomPushChatId, pushEmailTo };
}
