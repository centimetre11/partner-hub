import type { IntakeProposal, IntakeScope } from "./ai-intake";
import { countProposalItems } from "./proposal-merge";
import { normalizeCrmTraceAction, normalizeCrmTraceNature } from "./crm-trace-constants";

const SCOPE_LABELS: Record<IntakeScope, string> = {
  new_partner: "添加伙伴",
  powermap: "添加联系人",
  opportunity: "添加商机",
  profile: "补全画像",
  training: "培训计划",
  solution: "联合方案",
  business_record: "商务记录",
  todo: "待办",
  new_customer: "新客户",
  customer_profile: "客户档案补全",
};

function bullet(lines: string[]) {
  return lines.filter(Boolean).map((l) => `• ${l}`).join("\n");
}

function checklistLine(done: boolean, label: string, value?: string) {
  const mark = done ? "✅" : "⬜";
  return value ? `${mark} ${label}：${value}` : `${mark} ${label}`;
}

function formatBusinessRecordChecklist(
  proposal: IntakeProposal,
  ready: boolean,
  crmOnlyReady?: boolean
) {
  const r = proposal.businessRecords[0];

  const crmOnly = proposal.saveMode === "crm_only";
  const hubName = proposal.hubPartnerId ? proposal.partnerName?.trim() : undefined;
  const companyName =
    proposal.partnerName?.trim() ||
    proposal.customerName?.trim() ||
    proposal.crmCustomerName?.trim() ||
    undefined;
  const hasPartner = !!proposal.hubPartnerId && !crmOnly;
  const hasCustomer = !!proposal.customerId && !crmOnly;
  // Hub 侧归属：伙伴或客户档案
  const hasHub = hasPartner || hasCustomer;
  const hubLabel = hasCustomer && !hasPartner ? "客户档案" : "Partner Hub 伙伴";
  const hubName2 = hasCustomer && !hasPartner ? proposal.customerName?.trim() : hubName;
  const hasCrm = !!proposal.crmCustomerId;
  const crmLabel = proposal.crmCustomerName ?? proposal.crmCustomerId ?? companyName ?? "";
  const hasNature = r ? !!normalizeCrmTraceNature(r.traceNature) : false;
  const hasAction = r ? !!normalizeCrmTraceAction(r.traceAction) : false;
  const hasDetail = !!r?.title?.trim();

  const lines = [
    checklistLine(hasHub, hubLabel, hasHub ? hubName2 : "未建档"),
    checklistLine(hasCrm, "帆软 CRM 客户", hasCrm ? crmLabel : "未匹配"),
    checklistLine(hasNature, "现场/非现场", r?.traceNature),
    checklistLine(hasAction, "CRM 商务行为", r?.traceAction),
    checklistLine(hasDetail, "记录详情", r?.title?.slice(0, 60)),
  ];

  let status: string;
  if (ready) {
    status = hasCrm && hasHub ? "将同时写入 Partner Hub 与 CRM，回复「确认」保存" : "回复「确认」保存到 Partner Hub";
  } else if (crmOnlyReady) {
    status = "Partner Hub 未建档，CRM 已匹配 → 回复「仅CRM」只写入 CRM，或「取消」放弃";
  } else {
    status = "请补全 ⬜ 项后再确认";
  }

  return `\n**【商务记录 · 填报清单】**\n${lines.join("\n")}\n_${status}_`;
}

/** WeCom reply when user confirms but draft is incomplete */
export function formatProposeConfirmBlockedReply(opts: {
  scope: IntakeScope;
  proposal: IntakeProposal;
  ready: boolean;
  crmOnlyReady?: boolean;
}): string {
  if (opts.scope === "business_record") {
    const checklist = formatBusinessRecordChecklist(opts.proposal, opts.ready, opts.crmOnlyReady);
    return `草案信息还不够完整，请按清单补全 ⬜ 项后再回复「确认」，或回复「取消」放弃。${checklist}`;
  }
  return "草案信息还不够完整，请按清单补全 ⬜ 项后再回复「确认」，或回复「取消」放弃。";
}

/** Render propose draft as WeCom-friendly markdown */
export function formatProposeWecomReply(opts: {
  scope: IntakeScope;
  reply: string;
  proposal: IntakeProposal;
  ready: boolean;
  crmOnlyReady?: boolean;
  questions?: string[];
  chatType?: "group" | "single";
}): string {
  const parts: string[] = [];
  if (opts.reply.trim()) parts.push(opts.reply.trim());

  const draftLines: string[] = [];
  if (opts.proposal.partnerName) draftLines.push(`归属伙伴：${opts.proposal.partnerName}`);
  if (opts.proposal.customerName && !opts.proposal.partnerName) {
    draftLines.push(`归属客户：${opts.proposal.customerName}`);
  }
  if (opts.proposal.crmCustomerName) draftLines.push(`CRM 客户：${opts.proposal.crmCustomerName}`);
  if (opts.proposal.summary) draftLines.push(`摘要：${opts.proposal.summary}`);
  for (const f of opts.proposal.fields) {
    draftLines.push(`${f.label}：${f.newValue}`);
  }
  for (const c of opts.proposal.contacts) {
    draftLines.push(`联系人：${c.name}${c.title ? `（${c.title}）` : ""}`);
  }
  for (const o of opts.proposal.opportunities) {
    draftLines.push(`商机：${o.name}${o.client ? ` · 客户 ${o.client}` : ""}`);
  }
  for (const r of opts.proposal.businessRecords) {
    draftLines.push(`商务记录：${r.title}${r.category ? ` [${r.category}]` : ""}`);
  }
  for (const t of opts.proposal.todos) draftLines.push(`待办：${t.title}`);
  for (const t of opts.proposal.trainings) draftLines.push(`培训：${t.person}${t.targetCert ? ` → ${t.targetCert}` : ""}`);
  for (const s of opts.proposal.solutions) draftLines.push(`方案：${s.name}`);

  if (opts.scope === "business_record") {
    parts.push(formatBusinessRecordChecklist(opts.proposal, opts.ready, opts.crmOnlyReady));
  } else if (draftLines.length) {
    parts.push(`\n**【${SCOPE_LABELS[opts.scope]} · 草案预览】**\n${bullet(draftLines)}`);
  }

  if (opts.questions?.length) {
    parts.push(`\n**待澄清：**\n${bullet(opts.questions)}`);
  }

  const hasItems = countProposalItems(opts.proposal) > 0;
  const isGroup = opts.chatType !== "single";
  const confirmHint = isGroup
    ? "群聊请 **@我 确认** 保存，或 **@我 取消** 放弃。"
    : "私聊请直接回复 **确认** 保存，或 **取消** 放弃。";
  const crmOnlyHint = opts.crmOnlyReady
    ? "\n💡 Hub 未建档、CRM 已匹配：回复 **仅CRM** 只写入帆软 CRM。"
    : "";

  if (opts.ready && hasItems) {
    parts.push(`\n---\n✅ 信息已足够。${confirmHint}${crmOnlyHint}`);
  } else if (opts.crmOnlyReady && hasItems) {
    parts.push(`\n---\n📝 草案可仅写 CRM。${crmOnlyHint} 或 **取消** 放弃。`);
  } else if (hasItems) {
    parts.push(`\n---\n📝 草案进行中。补全清单后 ${confirmHint}${crmOnlyHint}`);
  } else {
    parts.push("\n---\n请补充更多信息以生成可保存的草案。");
  }

  return parts.join("\n").slice(0, 3800);
}

export function formatProposeAppliedReply(
  applied: string[],
  partnerId: string,
  scope: IntakeScope,
  customerId?: string,
): string {
  const scopeLabel = SCOPE_LABELS[scope];
  const lines = applied.length ? applied.map((a) => `• ${a}`).join("\n") : "• 已保存";
  if (customerId) {
    return `✅ **${scopeLabel}已保存**\n${lines}\n\n客户 ID：\`${customerId.slice(0, 12)}…\``;
  }
  if (!partnerId) {
    return `✅ **${scopeLabel}已保存**\n${lines}`;
  }
  return `✅ **${scopeLabel}已保存**\n${lines}\n\n伙伴 ID：\`${partnerId.slice(0, 12)}…\``;
}
