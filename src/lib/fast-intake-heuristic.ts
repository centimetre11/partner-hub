import type { ChatMessage } from "./ai";
import type { IntakeScope } from "./ai-locale";
import type { Locale } from "./i18n/locale";
import type { IntakeClarification, IntakeTurn } from "./ai-intake";
import { isFastIntakeScope } from "./proposal-scope";
import { extractPartnerNameFromIntakeText, enrichTodoPartnerBinding } from "./intake-partner-binding";
import {
  enrichWeakBusinessRecordsFromPrimaryText,
  isIntakeClarificationFollowUp,
  isWeakBusinessRecordSourceText,
  isWeakBusinessRecordTitle,
} from "./business-record-intake";
import {
  businessRecordCrmOnlyReady,
  businessRecordHubReady,
  resolveBusinessRecordCompanyTarget,
} from "./business-record-intake";
import { normalizeBusinessRecordCategory } from "./business-record-core";
import { stripWecomCommandPrefix } from "./wecom-user-resolve";
import { isIntakeParseErrorReply } from "./intake-text";
import {
  CRM_TRACE_ACTIONS,
  CRM_TRACE_NATURES,
  businessRecordCrmFieldsComplete,
  inferTraceAction,
  inferTraceNature,
  normalizeCrmTraceAction,
  normalizeCrmTraceNature,
} from "./crm-trace-payload";
import { parseTodoFromText, stripTodoCommandPrefix, normalizeTodoItem, mentionsSelfTodoAssignee } from "./todo-intake-parse";

function stripIntakeSystemHint(content: string): string {
  const zh = content.indexOf("\n\n（系统提示：");
  if (zh >= 0) return content.slice(0, zh).trim();
  const en = content.indexOf("\n\n[System ");
  if (en >= 0) return content.slice(0, en).trim();
  return content.trim();
}

/** Remove user-facing intake command prefix (e.g. 「帮我记一下商务记录，」) from raw message text. */
export function stripIntakeCommandPrefix(text: string, scope: IntakeScope): string {
  let s = text.trim();
  if (!s) return s;

  switch (scope) {
    case "business_record":
      s = s
        .replace(
          /^(帮我|请|麻烦)?\s*(记(录|个|一下)?|添加|加|创建|新增|写)?\s*(一个|一下)?\s*([^，,。\n]{0,24}?的)?\s*(商务记录|拜访记录|会议纪要|跟进记录|商务进展)[：:,，、\s]*/i,
          "",
        )
        .replace(/^(帮我|请|麻烦)?记录(一下)?(商务|拜访|会议)(记录|进展)?[：:,，\s]*/i, "")
        .replace(
          /^(please )?(help me )?(to )?(log|record|add|create)?( a)?( business)?( record| visit(?: log)?| meeting(?: log)?)[：:\s,]*/i,
          "",
        );
      break;
    case "todo":
      s = stripTodoCommandPrefix(s);
      break;
    case "opportunity":
      s = s.replace(/^(帮我|请|麻烦)?(添加|新建|加|创建)?(一个)?商机[：:,，\s]*/i, "");
      break;
    case "powermap":
      s = s
        .replace(/^(帮我|请|麻烦)?(添加|加|新建)?(一个)?(联系人|权力地图|名片)[：:,，\s]*/i, "")
        .replace(/^(add|create)?( a)? contact[：:\s]*/i, "");
      break;
    case "training":
      s = s.replace(/^(帮我|请|麻烦)?(添加|创建|制定)?(一个)?(培训计划|培训)[：:,，\s]*/i, "");
      break;
    case "solution":
      s = s.replace(/^(帮我|请|麻烦)?(添加|创建|写)?(一个)?(联合方案|方案)[：:,，\s]*/i, "");
      break;
    default:
      break;
  }
  return s.trim();
}

function sanitizeBusinessRecordText(text: string): string {
  const stripped = stripIntakeCommandPrefix(text, "business_record");
  return stripped || text.trim();
}

function buildTitle(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 77)}…`;
}

function addDays(today: string, offsetDays: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function inferDueDate(text: string, today: string): string | undefined {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  if (/明天|tomorrow/i.test(text)) return addDays(today, 1);
  if (/后天/i.test(text)) return addDays(today, 2);
  if (/下周|next week/i.test(text)) return addDays(today, 7);
  if (/本周末|这周末|weekend/i.test(text)) return addDays(today, 5);
  return undefined;
}

function inferOccurredAt(text: string, today: string): string {
  if (/昨天|yesterday/i.test(text)) return addDays(today, -1);
  if (/前天/i.test(text)) return addDays(today, -2);
  return today;
}

function inferBusinessCategory(text: string) {
  if (/认证|培训|training|fca|l2/i.test(text)) return "TRAINING" as const;
  if (/谈判|报价|合同|deal/i.test(text)) return "NEGOTIATION" as const;
  if (/交付|上线|delivery|迁移|进展|测试|评估/i.test(text)) return "DELIVERY" as const;
  if (/拜访|visit|见面|接待|吃饭|vp|ceo|客户/i.test(text)) return "VISIT" as const;
  return "OTHER" as const;
}

export function heuristicReply(locale: Locale, kind: string): string {
  const zh: Record<string, string> = {
    business_record:
      "已从你的描述提取商务记录草案。请核对右侧字段；CRM 需选现场/非现场与商务行为。",
    todo: "已从你的描述提取待办草案。请核对标题与截止日期，确认后保存到 Partner Hub。",
    opportunity: "已从你的描述提取商机草案。请核对名称、阶段与金额，确认后保存到 Partner Hub。",
    powermap: "已从你的描述提取联系人草案。请核对姓名与角色，确认后保存到 Partner Hub。",
    training: "已从你的描述提取培训计划草案。请核对人员与目标认证，确认后保存。",
    solution: "已从你的描述提取联合方案草案。请核对方案名称与要点，确认后保存。",
  };
  const en: Record<string, string> = {
    business_record:
      "Draft extracted from your note. Review on-site/off-site and CRM action on the right.",
    todo: "Todo draft extracted. Review title and due date, then save to Partner Hub.",
    opportunity: "Opportunity draft extracted. Review name, stage, and amount on the right.",
    powermap: "Contact draft extracted. Review name and role on the right.",
    training: "Training plan draft extracted. Review on the right before saving.",
    solution: "Joint solution draft extracted. Review on the right before saving.",
  };
  return locale === "zh" ? zh[kind] ?? zh.todo : en[kind] ?? en.todo;
}

/** Pure control commands that must never be treated as intake content. */
const CONTROL_COMMAND_RE =
  /^(确认|确认保存|保存|提交|好的保存|可以保存|确认提交|确认意图|确认操作|取消|放弃|不要了|仅crm|只填crm|仅同步crm|只写crm|apply|confirm|ok save|save|cancel|discard|abort|crm only|crm-only)$/i;

/** "改成商务记录" / "换成商机" 等改类型指令，也不应混入内容提取。 */
const SCOPE_SWITCH_LINE_RE =
  /^(改成|改为|换成|换为|其实是|应该是|纠正为|应改为)\s*[:：]?\s*(待办|商务记录|拜访记录|会议纪要|商务进展|拜访|会议|商机|联系人|权力地图|名片|培训|联合方案|方案)\s*$/;

export function lastIntakeUserText(chat?: ChatMessage[], scope?: IntakeScope): string {
  if (!chat?.length) return "";
  for (let i = chat.length - 1; i >= 0; i--) {
    const m = chat[i];
    if (m.role !== "user") continue;
    const base = stripWecomCommandPrefix(stripIntakeSystemHint(m.content ?? "")).trim();
    if (!base) continue;
    if (CONTROL_COMMAND_RE.test(base) || SCOPE_SWITCH_LINE_RE.test(base)) continue;
    const stripped = scope ? stripIntakeCommandPrefix(base, scope) : base;
    if (stripped) return stripped;
  }
  return "";
}

/** First substantive user message — used when the latest turn is only a CRM/clarification confirmation. */
export function primaryIntakeUserText(chat?: ChatMessage[], scope?: IntakeScope): string {
  if (!chat?.length) return lastIntakeUserText(chat, scope);
  const parts: string[] = [];
  for (const m of chat) {
    if (m.role !== "user") continue;
    const base = stripWecomCommandPrefix(stripIntakeSystemHint(m.content ?? "")).trim();
    if (!base || CONTROL_COMMAND_RE.test(base) || SCOPE_SWITCH_LINE_RE.test(base)) continue;
    const stripped = scope ? stripIntakeCommandPrefix(base, scope) : base;
    if (!stripped || isIntakeClarificationFollowUp(stripped)) continue;
    parts.push(stripped);
  }
  if (parts.length) return parts.join("\n");
  return lastIntakeUserText(chat, scope);
}

function extractContactName(text: string): string | null {
  const patterns = [
    /(?:联系人|contact)[：:\s]+([^\n,，]{2,40})/i,
    /(?:叫|姓名是|名字是|是)\s*([A-Za-z\u4e00-\u9fa5][^\n,，]{1,30})/,
    /([A-Za-z\u4e00-\u9fa5]{2,20})\s*(?:，|,|\s)(?:VP|CEO|CTO|总经理|总监|Director|Manager)/i,
    /(?:VP|CEO|CTO|总经理|总监)\s*([A-Za-z\u4e00-\u9fa5]{2,20})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

function extractOpportunityFields(text: string) {
  const nameMatch =
    text.match(/商机[：:，,\s]+(.+?)(?:[，,]|$)/) ||
    text.match(/opportunity[：:\s]+(.+?)(?:[，,]|$)/i);
  const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*万/);
  const clientMatch = text.match(/(?:客户|client)[：:\s]+([^\n,，]{2,40})/i);
  return {
    name: buildTitle(nameMatch?.[1]?.trim() || text.replace(/^(添加|新建|加)商机[：:,，\s]*/i, "").trim()),
    amount: amountMatch ? `${amountMatch[1]}万` : undefined,
    client: clientMatch?.[1]?.trim(),
    stage: /proposal|方案|报价/i.test(text)
      ? "Proposal"
      : /discovery|需求/i.test(text)
        ? "Needs Discovery"
        : undefined,
  };
}

function emptyProposal(summary: string): IntakeTurn["proposal"] {
  return {
    summary,
    fields: [],
    contacts: [],
    opportunities: [],
    todos: [],
    trainings: [],
    solutions: [],
    businessRecords: [],
  };
}

export function heuristicBusinessRecordTurn(
  userText: string,
  locale: Locale,
  today: string,
): IntakeTurn | null {
  const text = sanitizeBusinessRecordText(userText);
  if (!text) return null;
  if (isIntakeClarificationFollowUp(text) || isWeakBusinessRecordSourceText(text)) return null;
  if (!/拜访|visit|会议|认证|培训|商务|举办|活动|标杆|vp|ceo|客户|讨论|见面|meal|training|fca|l2|电话|联系|预约|确认|进展|迁移|配合|测试|评估|待定|同步|跟进/i.test(text)) {
    return null;
  }

  const category = normalizeBusinessRecordCategory(inferBusinessCategory(text));
  const title = buildTitle(text);
  const traceNature = inferTraceNature(title, text, category);
  const traceAction = inferTraceAction(title, text, category);
  const records = [
    {
      title,
      content: text,
      category,
      occurredAt: inferOccurredAt(text, today),
      traceNature,
      traceAction,
      reason: text.slice(0, 120),
    },
  ];
  const partnerName = extractPartnerNameFromIntakeText(text) ?? undefined;

  return {
    reply: heuristicReply(locale, "business_record"),
    questions: [],
    clarifications: buildBusinessRecordClarifications(records, locale, { partnerName }),
    ready: false,
    proposal: { ...emptyProposal(title), partnerName, businessRecords: records },
  };
}

function heuristicTodoTurn(userText: string, locale: Locale, today: string): IntakeTurn | null {
  const text = userText.trim();
  if (!text) return null;

  const parsed = parseTodoFromText(text, today);
  if (!parsed.title?.trim()) return null;

  const hasTodoIntent =
    /待办|todo|记得|提醒|跟进|follow[- ]?up|deadline|截止/i.test(text) ||
    !!parsed.assigneeName ||
    /^(?:给|for)\s+/i.test(text) ||
    mentionsSelfTodoAssignee(text);
  if (!hasTodoIntent) return null;

  const todos = [
    {
      title: parsed.title,
      dueDate: parsed.dueDate ?? inferDueDate(text, today),
      assigneeName: parsed.assigneeName,
      detail: text,
    },
  ];
  const title = parsed.title;

  const partnerName = extractPartnerNameFromIntakeText(text) ?? undefined;

  return {
    reply: heuristicReply(locale, "todo"),
    questions: [],
    clarifications: buildTodoClarifications(todos, locale),
    ready: !!title.trim(),
    proposal: { ...emptyProposal(title), partnerName, todos },
  };
}

function heuristicOpportunityTurn(userText: string, locale: Locale): IntakeTurn | null {
  const text = userText.trim();
  if (!text) return null;
  if (!/商机|opportunity|pipeline|报价|项目|deal|万/i.test(text)) return null;

  const fields = extractOpportunityFields(text);
  if (!fields.name.trim()) return null;

  const opportunities = [
    {
      action: "add" as const,
      name: fields.name,
      client: fields.client,
      amount: fields.amount,
      stage: fields.stage ?? "Needs Discovery",
      status: "ACTIVE",
      reason: text.slice(0, 120),
    },
  ];

  return {
    reply: heuristicReply(locale, "opportunity"),
    questions: [],
    clarifications: [],
    ready: true,
    proposal: { ...emptyProposal(fields.name), opportunities },
  };
}

function heuristicPowermapTurn(userText: string, locale: Locale): IntakeTurn | null {
  const text = userText.trim();
  if (!text) return null;
  if (!/联系人|contact|powermap|权力地图|vp|ceo|cto|总经理|总监|decision/i.test(text)) return null;

  const name = extractContactName(text);
  if (!name) return null;

  const role = /decision|决策/i.test(text)
    ? "DECISION_MAKER"
    : /approver|批准/i.test(text)
      ? "APPROVER"
      : /support|支持/i.test(text)
        ? "SUPPORTER"
        : "INFLUENCER";

  const titleMatch = text.match(/(?:title|职位|职务)[：:\s]+([^\n,，]{2,40})/i);
  const contacts = [
    {
      action: "add" as const,
      name,
      role,
      title: titleMatch?.[1]?.trim(),
      reason: text.slice(0, 120),
    },
  ];

  return {
    reply: heuristicReply(locale, "powermap"),
    questions: [],
    clarifications: [],
    ready: true,
    proposal: { ...emptyProposal(name), contacts },
  };
}

function heuristicTrainingTurn(userText: string, locale: Locale, today: string): IntakeTurn | null {
  const text = userText.trim();
  if (!text) return null;
  if (!/培训|training|认证|fca|l2|cert/i.test(text)) return null;

  const personMatch = text.match(/(?:给|让|为)?\s*([A-Za-z\u4e00-\u9fa5]{2,20})\s*(?:做|安排|培训|认证)/);
  const person = personMatch?.[1]?.trim() || "TBD";
  const targetCert = text.match(/(FCA[-\s]?(?:FineBI|FineReport|FineDataLink)?|L2|L1)/i)?.[0];

  const trainings = [
    {
      person,
      targetCert: targetCert ?? undefined,
      deadline: inferDueDate(text, today),
      status: "PLANNED" as const,
    },
  ];

  const clarifications: IntakeClarification[] =
    person === "TBD"
      ? [
          {
            id: "training-0-person",
            question: locale === "zh" ? "培训对象是谁？" : "Who is the trainee?",
            options: [],
            multi: false,
            allowOther: true,
            apply: "ai",
            kind: "field",
          },
        ]
      : [];

  return {
    reply: heuristicReply(locale, "training"),
    questions: [],
    clarifications,
    ready: person !== "TBD",
    proposal: { ...emptyProposal(text.slice(0, 40)), trainings },
  };
}

function heuristicSolutionTurn(userText: string, locale: Locale): IntakeTurn | null {
  const text = userText.trim();
  if (!text) return null;
  if (!/联合方案|solution|共创|co-?sell|方案名/i.test(text)) return null;

  const nameMatch = text.match(/(?:方案|solution)[：:\s]+([^\n,，]{2,60})/i);
  const name = buildTitle(nameMatch?.[1]?.trim() || text);

  return {
    reply: heuristicReply(locale, "solution"),
    questions: [],
    clarifications: [],
    ready: true,
    proposal: {
      ...emptyProposal(name),
      solutions: [{ name, status: "DRAFT", notes: text }],
    },
  };
}

/** 模型 JSON 失败时，按 scope 从用户原文规则提取草案（仅 fast intake） */
export function heuristicFastIntakeTurn(
  scope: IntakeScope,
  userText: string,
  locale: Locale,
  today: string,
): IntakeTurn | null {
  switch (scope) {
    case "business_record":
      return heuristicBusinessRecordTurn(userText, locale, today);
    case "todo":
      return heuristicTodoTurn(userText, locale, today);
    case "opportunity":
      return heuristicOpportunityTurn(userText, locale);
    case "powermap":
      return heuristicPowermapTurn(userText, locale);
    case "training":
      return heuristicTrainingTurn(userText, locale, today);
    case "solution":
      return heuristicSolutionTurn(userText, locale);
    default:
      return null;
  }
}

/**
 * Explicit on-site/off-site correction stated in a follow-up message
 * (e.g. "我们是现场聊的"). Returns null when the user didn't state it.
 */
export function detectTraceNatureOverride(raw: string): "现场" | "非现场" | null {
  const t = stripWecomCommandPrefix(stripIntakeSystemHint(raw ?? "")).trim();
  if (!t) return null;
  if (/非现场|线上|远程|视频会议|电话沟通|微信沟通|whatsapp|邮件/i.test(t)) return "非现场";
  if (/现场|到访|拜访|当面|面谈|见面|上门|出差|到客户/i.test(t)) return "现场";
  return null;
}

export function buildBusinessRecordClarifications(
  records: { title?: string; traceNature?: string; traceAction?: string }[],
  locale: Locale,
  opts?: { partnerName?: string; openIntake?: boolean },
): IntakeClarification[] {
  const out: IntakeClarification[] = [];
  if (opts?.openIntake && !opts.partnerName?.trim()) {
    out.push({
      id: "partnerName",
      question: locale === "zh" ? "这条商务记录属于哪个伙伴/客户？" : "Which partner is this record for?",
      options: [],
      multi: false,
      allowOther: true,
      apply: "direct",
      kind: "identity",
      blocking: true,
    });
  }
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const prefix =
      records.length > 1 ? (locale === "zh" ? `第 ${i + 1} 条记录：` : `Record ${i + 1}: `) : "";

    if (!normalizeCrmTraceNature(r.traceNature)) {
      out.push({
        id: `br-${i}-nature`,
        question: locale === "zh" ? `${prefix}这次是现场还是非现场？` : `${prefix}On-site or off-site?`,
        options: [...CRM_TRACE_NATURES],
        multi: false,
        allowOther: false,
        apply: "direct",
        kind: "field",
      });
    }
    if (!normalizeCrmTraceAction(r.traceAction)) {
      out.push({
        id: `br-${i}-action`,
        question: locale === "zh" ? `${prefix}CRM 商务行为选哪一项？` : `${prefix}Which CRM business action?`,
        options: [...CRM_TRACE_ACTIONS].slice(0, 8),
        multi: false,
        allowOther: true,
        apply: "direct",
        kind: "field",
      });
    }
  }
  return out;
}

function buildTodoClarifications(
  todos: { title?: string; dueDate?: string }[],
  locale: Locale,
): IntakeClarification[] {
  if (todos.length !== 1 || todos[0]?.dueDate) return [];
  return [
    {
      id: "todo-0-due",
      question: locale === "zh" ? "截止日期是？" : "Due date?",
      options: ["今天", "明天", "下周", "暂不设定"],
      multi: false,
      allowOther: true,
      apply: "ai",
      kind: "field",
    },
  ];
}

export async function finalizeBusinessRecordTurn(
  turn: IntakeTurn,
  locale: Locale,
  opts?: { boundPartnerId?: string; boundCustomerId?: string; userText?: string; primaryUserText?: string },
): Promise<IntakeTurn> {
  const primaryText = opts?.primaryUserText?.trim() || opts?.userText?.trim() || "";
  let records = (turn.proposal.businessRecords ?? []).map((r) => {
    const title = sanitizeBusinessRecordText(r.title ?? "");
    const content = r.content ? sanitizeBusinessRecordText(r.content) : title;
    return { ...r, title, content: content || title };
  });
  records = enrichWeakBusinessRecordsFromPrimaryText(records, primaryText).map((r) => ({
    ...r,
    content: r.content ?? r.title,
  }));
  if (!records.length) return turn;

  const target = await resolveBusinessRecordCompanyTarget({
    proposal: turn.proposal,
    boundPartnerId: opts?.boundPartnerId,
    boundCustomerId: opts?.boundCustomerId,
    saveMode: turn.proposal.saveMode,
  });
  const openIntake = !opts?.boundPartnerId && !opts?.boundCustomerId;
  const hubReady = businessRecordHubReady(target);
  const crmOnlyReady = businessRecordCrmOnlyReady(target);

  const mergedClarifications = [
    ...turn.clarifications,
    ...buildBusinessRecordClarifications(records, locale, {
      partnerName: turn.proposal.partnerName,
      openIntake: openIntake && target.syncPlan === "unresolved",
    }).filter((c) => !turn.clarifications.some((x) => x.id === c.id)),
  ];
  const crmComplete = businessRecordCrmFieldsComplete(records);
  const blocking = mergedClarifications.some((c) => c.blocking);

  const needsCompany =
    target.syncPlan === "unresolved" ||
    (target.syncPlan === "crm_only_pending" && !hubReady);

  const primaryTitle = records[0]?.title?.trim();
  const summary =
    primaryTitle &&
    (!turn.proposal.summary?.trim() || isWeakBusinessRecordTitle(turn.proposal.summary, turn.proposal.summary))
      ? primaryTitle
      : turn.proposal.summary;

  return {
    ...turn,
    proposal: {
      ...turn.proposal,
      summary,
      businessRecords: records,
      hubPartnerId: target.hubPartnerId ?? turn.proposal.hubPartnerId,
      customerId: target.customerId ?? turn.proposal.customerId,
      customerName: target.customerName ?? turn.proposal.customerName,
      crmCustomerId: target.crmCustomerId ?? turn.proposal.crmCustomerId,
      crmCustomerName: target.crmCustomerName ?? turn.proposal.crmCustomerName,
      partnerName:
        target.hubPartnerName ??
        target.customerName ??
        turn.proposal.partnerName ??
        target.crmCustomerName ??
        target.companyLabel,
    },
    reply: !crmComplete || needsCompany
      ? locale === "zh"
        ? "已生成商务记录草案。请核对下方清单；若 Partner Hub 未建档但 CRM 有客户，可回复「仅CRM」只写入 CRM。"
        : "Review the checklist below. If the company is only in CRM, reply「仅CRM」to save CRM-only."
      : turn.reply,
    clarifications: mergedClarifications,
    ready: crmComplete && hubReady && !blocking,
    crmOnlyReady: crmComplete && crmOnlyReady && !blocking,
  };
}

async function finalizeTodoTurn(
  turn: IntakeTurn,
  locale: Locale,
  opts?: { boundPartnerId?: string; boundCustomerId?: string; userText?: string; primaryUserText?: string },
): Promise<IntakeTurn> {
  let todos = turn.proposal.todos.filter((t) => t.title?.trim()).map((t) =>
    normalizeTodoItem(t, new Date().toISOString().slice(0, 10)),
  );
  if (!todos.length && opts?.userText?.trim()) {
    const stripped = stripIntakeCommandPrefix(opts.userText.trim(), "todo");
    if (stripped && !/^(确认|取消|仅crm)/i.test(stripped)) {
      const parsed = parseTodoFromText(stripped, new Date().toISOString().slice(0, 10));
      if (parsed.title?.trim()) {
        todos = [{ ...parsed, detail: stripped }];
        turn = { ...turn, proposal: { ...turn.proposal, todos } };
      }
    }
  }
  if (!todos.length) return turn;

  const { proposal, clarifications: partnerClarifications } = await enrichTodoPartnerBinding({
    proposal: turn.proposal,
    userText: opts?.userText,
    boundPartnerId: opts?.boundPartnerId,
    boundCustomerId: opts?.boundCustomerId,
    locale,
    existingClarifications: turn.clarifications,
  });

  const clarifications = [
    ...turn.clarifications,
    ...partnerClarifications,
    ...buildTodoClarifications(todos, locale).filter((c) => !turn.clarifications.some((x) => x.id === c.id)),
  ];
  const primaryTitle = todos[0]?.title?.trim();
  const cleanedProposal =
    primaryTitle && (!proposal.summary?.trim() || /(?:待办|todo)/i.test(proposal.summary))
      ? { ...proposal, summary: primaryTitle, todos }
      : { ...proposal, todos };
  return {
    ...turn,
    proposal: cleanedProposal,
    clarifications,
    ready: todos.length > 0 && !clarifications.some((c) => c.blocking),
    reply: isIntakeParseErrorReply(turn.reply)
      ? heuristicReply(locale, "todo")
      : turn.reply || heuristicReply(locale, "todo"),
  };
}

function finalizeSimpleReadyTurn(
  turn: IntakeTurn,
  locale: Locale,
  kind: string,
  hasItems: boolean,
): IntakeTurn {
  if (!hasItems) return turn;
  return {
    ...turn,
    ready: !turn.clarifications.some((c) => c.blocking) && (turn.ready || hasItems),
    reply: turn.reply || heuristicReply(locale, kind),
  };
}

/** fast intake 统一收尾：补追问、校正 ready（商务记录含 CRM 字段；其余只存 Partner Hub） */
export async function finalizeFastIntakeTurn(
  scope: IntakeScope,
  turn: IntakeTurn,
  locale: Locale,
  opts?: { boundPartnerId?: string; boundCustomerId?: string; userText?: string; primaryUserText?: string },
): Promise<IntakeTurn> {
  if (!isFastIntakeScope(scope)) return turn;
  switch (scope) {
    case "business_record":
      return finalizeBusinessRecordTurn(turn, locale, opts);
    case "todo":
      return finalizeTodoTurn(turn, locale, opts);
    case "opportunity":
      return finalizeSimpleReadyTurn(
        turn,
        locale,
        "opportunity",
        turn.proposal.opportunities.some((o) => o.name?.trim()),
      );
    case "powermap":
      return finalizeSimpleReadyTurn(
        turn,
        locale,
        "powermap",
        turn.proposal.contacts.some((c) => c.name?.trim()),
      );
    case "training":
      return finalizeSimpleReadyTurn(
        turn,
        locale,
        "training",
        turn.proposal.trainings.some((t) => t.person?.trim() && t.person !== "TBD"),
      );
    case "solution":
      return finalizeSimpleReadyTurn(
        turn,
        locale,
        "solution",
        turn.proposal.solutions.some((s) => s.name?.trim()),
      );
    default:
      return turn;
  }
}

/** Recompute ready/proposal after merge or before WeCom confirm (mirrors business_record refinal in wecom-bot). */
export async function refinalProposeIntakeTurn(
  scope: IntakeScope,
  turn: IntakeTurn,
  locale: Locale,
  opts?: { boundPartnerId?: string; boundCustomerId?: string; userText?: string; primaryUserText?: string },
): Promise<IntakeTurn> {
  if (scope === "business_record" && turn.proposal.businessRecords.length) {
    return finalizeBusinessRecordTurn(turn, locale, opts);
  }
  if (scope === "todo" && turn.proposal.todos.some((t) => t.title?.trim())) {
    return finalizeTodoTurn(turn, locale, opts);
  }
  return turn;
}
