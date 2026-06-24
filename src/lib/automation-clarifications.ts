import type { AutomationBuilderClarification, AutomationBuilderDraft, AutomationBuilderMessage } from "./automation-builder-types";
import { getClarificationTier, normalizeAiClarifications } from "./ai-clarifications";
import type { BuilderDeliveryPrefs } from "./builder-context-prompt";
import { PUSH_WECOM_APP_ENABLED } from "./automation-delivery";
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
  return /发到.*群|推到.*群|推送.*群|推送到.*群|企微群|微信群|微信.*群|wecom.*group|wechat.*group|push to (the )?group/i.test(
    text
  );
}

export function mentionsWecomAppPush(text: string): boolean {
  return /应用消息|企微应用|私信|推送到.*人|推给.*本人|wecom app|app message|send_wecom_app/i.test(text);
}

export function mentionsEmailPush(text: string): boolean {
  return /发(邮件|邮箱)|推到.*邮箱|发到.*邮箱|发送?到.*邮箱|发到我的邮箱|我的邮箱|用邮箱|通过邮件|邮件推送|邮件给我|邮箱给我|发邮箱|推邮箱|email me|send email|push.*email|to my (email|mailbox)|via email|by email/i.test(
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
  return /我的邮箱|my email|my mailbox|(发|推|送到|发送?).{0,12}给我|to me\b/i.test(text);
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
  return /企微群|wecom.*group|微信群|群/i.test(clarificationBlob(c));
}

function isWecomAppTopicClarification(c: AutomationBuilderClarification): boolean {
  if (isBuiltinClarificationId(c.id)) return false;
  return /企微应用|应用消息|wecom app|app message|私信/i.test(clarificationBlob(c));
}

function isDeliveryTopicClarification(c: AutomationBuilderClarification): boolean {
  if (c.id === "delivery-pick") return true;
  if (isBuiltinClarificationId(c.id)) return false;
  return /推送到哪里|结果推送|where should.*deliver|delivery channel|推送.*哪里/i.test(clarificationBlob(c));
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
  draft: { pushEmailTo: string; wecomPushChatId: string; pushWecomAppTo: string }
): AutomationBuilderClarification[] {
  const hasEmail = Boolean(draft.pushEmailTo.trim());
  const hasWecom = Boolean(draft.wecomPushChatId.trim());
  const hasWecomApp = Boolean(draft.pushWecomAppTo.trim());
  const wantsEmail = mentionsEmailPush(userText) || hasEmail;
  const wantsWecom = mentionsWecomPush(userText) || hasWecom;
  const wantsWecomApp = mentionsWecomAppPush(userText) || hasWecomApp;
  if (!wantsEmail && !wantsWecom && !wantsWecomApp) return clarifications;

  return clarifications.filter((c) => {
    if (c.id === "delivery-pick") {
      const channelCount = [wantsWecom, wantsWecomApp, wantsEmail].filter(Boolean).length;
      if (channelCount === 1) return false;
      if (hasEmail || hasWecom || hasWecomApp) return false;
    }
    if (isBuiltinClarificationId(c.id)) return true;
    const blob = `${c.question} ${c.options.join(" ")}`;
    if (wantsEmail && /推送|delivery|渠道|是否|要不要|需不需要|用.*邮件|use.*email|send.*email/i.test(blob)) {
      return false;
    }
    if (wantsWecom && !wantsEmail && /推送|delivery|渠道|是否|要不要|企微群|wecom.*group|group/i.test(blob)) {
      return false;
    }
    if (wantsWecomApp && /推送|delivery|渠道|是否|要不要|企微应用|应用消息|wecom app/i.test(blob)) {
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

/** 解析下拉/多选/手输的邮箱答案 → 逗号分隔地址 */
export function resolveEmailPickValue(value: string, emails: EmailOption[]): string {
  const parts = value
    .split(/[,，;；\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const resolved: string[] = [];
  for (const part of parts) {
    const matched = emails.find((x) => part === emailOptionLabel(x) || part.includes(x.email));
    if (matched) resolved.push(matched.email);
    else if (part.includes("@")) resolved.push(part);
  }
  return [...new Set(resolved)].join(", ");
}

export function followUpClarificationsAfterDeliveryPick(
  deliveryAnswer: string,
  draft: AutomationBuilderDraft,
  opts: AutomationBuilderOptions,
  locale: Locale
): AutomationBuilderClarification[] {
  const out: AutomationBuilderClarification[] = [];
  const wantsWecomGroup = /企微群|WeCom group/i.test(deliveryAnswer);
  const wantsWecomApp = /企微应用|WeCom app|应用消息/i.test(deliveryAnswer);
  const wantsEmail = /邮件|Email/i.test(deliveryAnswer);
  if (wantsWecomGroup && !draft.wecomPushChatId.trim() && opts.wecomChats.length > 0) {
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
      question: locale === "zh" ? "发送到哪些邮箱？（可多选）" : "Which email(s) should receive pushes?",
      options: opts.emails.map((e) => emailOptionLabel(e)),
      control: "select",
      multi: true,
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
    if (ans.id === "delivery-pick") {
      if (/企微应用|WeCom app|应用消息/i.test(ans.value)) {
        next = { ...next, pushWecomAppTo: PUSH_WECOM_APP_ENABLED };
      }
    }
    if (ans.id === "email-pick") {
      const resolved = resolveEmailPickValue(ans.value, opts.emails);
      if (resolved) next = { ...next, pushEmailTo: resolved };
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
    if (
      c.id === "delivery-pick" &&
      (draft.wecomPushChatId.trim() || draft.pushEmailTo.trim() || draft.pushWecomAppTo.trim())
    )
      return false;
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
  pushWecomAppTo?: string;
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
  const effectiveWecomApp = opts.pushWecomAppTo?.trim() ?? "";
  const hasDelivery = Boolean(opts.wecomPushChatId.trim() || effectiveEmail || effectiveWecomApp);

  let out = stripManualIdClarifications([...opts.clarifications]);
  out = stripRedundantDeliveryClarifications(out, userText, {
    pushEmailTo: effectiveEmail,
    wecomPushChatId: opts.wecomPushChatId,
    pushWecomAppTo: effectiveWecomApp,
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
  const userWantsWecomApp = mentionsWecomAppPush(userText);
  const userWantsEmail = mentionsEmailPush(userText);

  if (userWantsEmail && !userWantsWecom && !userWantsWecomApp) {
    out = stripTopicClarifications(out, isDeliveryTopicClarification);
  } else if (userWantsWecom && !userWantsEmail && !userWantsWecomApp) {
    out = stripTopicClarifications(out, isDeliveryTopicClarification);
  } else if (userWantsWecomApp && !userWantsEmail && !userWantsWecom) {
    out = stripTopicClarifications(out, isDeliveryTopicClarification);
  }

  const aiAskedWecom = out.some(isWecomTopicClarification);
  const aiAskedWecomApp = out.some(isWecomAppTopicClarification);
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

  const needWecomApp = !effectiveWecomApp && (userWantsWecomApp || aiAskedWecomApp);
  if (needWecomApp) {
    out = stripTopicClarifications(out, isWecomAppTopicClarification);
  }

  const explicitEmailInText = /[\w.+-]+@[\w.-]+\.\w{2,}/.test(userText);
  const needEmailPick =
    userWantsEmail &&
    !explicitEmailInText &&
    (opts.emails.length > 0 || aiAskedEmail) &&
    (!effectiveEmail || !mentionsMyEmail(userText));
  if (needEmailPick) {
    out = stripTopicClarifications(out, isEmailTopicClarification);
    out.unshift({
      id: "email-pick",
      question:
        opts.locale === "zh"
          ? "请选择收件邮箱（可多选），或手动输入："
          : "Pick recipient email(s) or type manually:",
      options: opts.emails.map((e) => emailOptionLabel(e)),
      control: "select",
      multi: true,
      allowOther: true,
      placeholder: opts.locale === "zh" ? "选择邮箱…" : "Select email…",
      tier: "required",
    });
  }

  const needDelivery =
    !hasDelivery &&
    !userWantsEmail &&
    !userWantsWecom &&
    !userWantsWecomApp &&
    !out.some((c) => c.id === "email-pick" || c.id === "wecom-pick") &&
    !hasClarificationAbout(out, /推送|delivery|渠道/i);
  if (needDelivery) {
    out.unshift({
      id: "delivery-pick",
      question: opts.locale === "zh" ? "结果推送到哪里？" : "Where should results be delivered?",
      options:
        opts.locale === "zh"
          ? ["企微群", "企微应用", "邮件"]
          : ["WeCom group", "WeCom app", "Email"],
      multi: true,
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
        multi: raw.multi ?? raw.id === "email-pick",
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
  const wantsWecomApp = mentionsWecomAppPush(userText);
  const wantsEmail = mentionsEmailPush(userText);
  const wantsPartner = mentionsPartnerRef(userText);
  const allPartners = mentionsAllPartnersScope(userText);

  const prefPartner = opts.deliveryPrefs?.partnerId?.trim() ?? "";
  const prefWecom = opts.deliveryPrefs?.wecomChatId?.trim() ?? "";
  const prefEmail = opts.deliveryPrefs?.email?.trim() ?? "";
  const prefWecomApp = opts.deliveryPrefs?.wecomAppTo?.trim() ?? "";

  let partnerId = draft.partnerId.trim();
  let wecomPushChatId = draft.wecomPushChatId.trim();
  let pushEmailTo = draft.pushEmailTo.trim();
  let pushWecomAppTo = draft.pushWecomAppTo.trim();

  if (prefPartner) partnerId = prefPartner;
  if (prefWecom) wecomPushChatId = prefWecom;
  if (prefEmail) pushEmailTo = prefEmail;
  if (prefWecomApp) pushWecomAppTo = prefWecomApp;

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

  if (wantsWecom && !wantsEmail && !wantsWecomApp && !prefEmail && !prefWecomApp && !inferredEmail) {
    pushEmailTo = "";
    pushWecomAppTo = "";
  }
  if (wantsEmail && !wantsWecom && !wantsWecomApp && !prefWecom && !prefWecomApp) {
    wecomPushChatId = "";
    pushWecomAppTo = "";
  }
  if (wantsWecomApp && !wantsWecom && !wantsEmail && !prefWecom && !prefEmail) {
    wecomPushChatId = "";
    pushEmailTo = "";
  }

  if (wantsWecomApp && !pushWecomAppTo) {
    pushWecomAppTo = PUSH_WECOM_APP_ENABLED;
  }

  return { ...draft, partnerId, wecomPushChatId, pushEmailTo, pushWecomAppTo };
}
