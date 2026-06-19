import type { ChatMessage } from "./ai";
import type { Locale } from "./i18n/locale";
import type { IntakeClarification, IntakeTurn } from "./ai-intake";
import { normalizeBusinessRecordCategory } from "./business-record-core";
import {
  CRM_TRACE_ACTIONS,
  CRM_TRACE_NATURES,
  businessRecordCrmFieldsComplete,
  inferTraceAction,
  inferTraceNature,
  normalizeCrmTraceAction,
  normalizeCrmTraceNature,
} from "./crm-trace-payload";

function stripIntakeSystemHint(content: string): string {
  const zh = content.indexOf("\n\n（系统提示：");
  if (zh >= 0) return content.slice(0, zh).trim();
  const en = content.indexOf("\n\n[System ");
  if (en >= 0) return content.slice(0, en).trim();
  return content.trim();
}

function inferOccurredAt(text: string, today: string): string {
  if (/昨天|yesterday/i.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  if (/前天/i.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 2);
    return d.toISOString().slice(0, 10);
  }
  return today;
}

function inferCategory(text: string) {
  if (/认证|培训|training|fca|l2/i.test(text)) return "TRAINING" as const;
  if (/谈判|报价|合同|deal/i.test(text)) return "NEGOTIATION" as const;
  if (/交付|上线|delivery/i.test(text)) return "DELIVERY" as const;
  if (/拜访|visit|见面|接待|吃饭|vp|ceo|客户/i.test(text)) return "VISIT" as const;
  return "OTHER" as const;
}

function buildTitle(text: string, locale: Locale): string {
  const trimmed = text.trim();
  if (trimmed.length <= 48) return trimmed;
  return `${trimmed.slice(0, 45)}…`;
}

export function lastIntakeUserText(chat?: ChatMessage[]): string {
  if (!chat?.length) return "";
  for (let i = chat.length - 1; i >= 0; i--) {
    const m = chat[i];
    if (m.role !== "user") continue;
    const t = stripIntakeSystemHint(m.content ?? "").trim();
    if (t) return t;
  }
  return "";
}

/** 模型 JSON 失败时，从用户原文规则提取商务记录草案 */
export function heuristicBusinessRecordTurn(
  userText: string,
  locale: Locale,
  today: string,
): IntakeTurn | null {
  const text = userText.trim();
  if (!text) return null;
  if (!/拜访|visit|会议|认证|培训|商务|vp|ceo|客户|讨论|见面|meal|training|fca|l2/i.test(text)) {
    return null;
  }

  const category = normalizeBusinessRecordCategory(inferCategory(text));
  const title = buildTitle(text, locale);
  const traceNature = inferTraceNature(title, text, category);
  const traceAction = inferTraceAction(title, text, category);

  const reply =
    locale === "zh"
      ? "已从你的描述提取商务记录草案（自动推断现场/非现场与商务行为）。请核对右侧字段，不完整可继续补充或直接在右侧选择。"
      : "Draft extracted from your note (on/off-site and CRM action inferred). Review the panel on the right or add more detail.";

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

  return {
    reply,
    questions: [],
    clarifications: buildBusinessRecordClarifications(records, locale),
    ready: businessRecordCrmFieldsComplete(records),
    proposal: {
      summary: title,
      fields: [],
      contacts: [],
      opportunities: [],
      todos: [],
      trainings: [],
      solutions: [],
      businessRecords: records,
    },
  };
}

export function buildBusinessRecordClarifications(
  records: { title?: string; traceNature?: string; traceAction?: string }[],
  locale: Locale,
): IntakeClarification[] {
  const out: IntakeClarification[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const prefix =
      records.length > 1
        ? locale === "zh"
          ? `第 ${i + 1} 条记录：`
          : `Record ${i + 1}: `
        : "";

    if (!normalizeCrmTraceNature(r.traceNature)) {
      out.push({
        id: `br-${i}-nature`,
        question:
          locale === "zh"
            ? `${prefix}这次是现场还是非现场？`
            : `${prefix}On-site or off-site?`,
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
        question:
          locale === "zh"
            ? `${prefix}CRM 商务行为选哪一项？`
            : `${prefix}Which CRM business action?`,
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

export function finalizeBusinessRecordTurn(turn: IntakeTurn, locale: Locale): IntakeTurn {
  const records = turn.proposal.businessRecords ?? [];
  if (!records.length) return turn;

  const mergedClarifications = [
    ...turn.clarifications,
    ...buildBusinessRecordClarifications(records, locale).filter(
      (c) => !turn.clarifications.some((x) => x.id === c.id),
    ),
  ];

  const complete = businessRecordCrmFieldsComplete(records);
  const ready = complete && !mergedClarifications.some((c) => c.blocking);

  let reply = turn.reply;
  if (!complete && records.length) {
    reply =
      locale === "zh"
        ? "已生成商务记录草案。请在右侧选择 **现场/非现场** 和 **商务行为**（CRM 必填），或在下方回答追问。"
        : "Business record draft ready. Pick on/off-site and CRM action on the right, or answer the follow-ups below.";
  } else if (complete && ready && !reply.trim()) {
    reply =
      locale === "zh"
        ? "商务记录信息已足够，请核对右侧草案后提交并同步 CRM。"
        : "Looks complete — review the draft and submit to sync CRM.";
  }

  return {
    ...turn,
    reply,
    clarifications: mergedClarifications,
    ready: complete && mergedClarifications.length === 0 ? true : ready && complete,
  };
}
