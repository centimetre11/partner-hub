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

/** Intake scopes the user can switch between when the bot guessed wrong. */
const SWITCHABLE_SCOPES: IntakeScope[] = [
  "todo",
  "business_record",
  "opportunity",
  "powermap",
  "training",
  "solution",
];

/** Footer hint letting the user correct a mis-detected record type in one step. */
function scopeSwitchHint(scope: IntakeScope, isGroup: boolean): string {
  const others = SWITCHABLE_SCOPES.filter((s) => s !== scope)
    .slice(0, 3)
    .map((s) => SCOPE_LABELS[s]);
  if (!others.length) return "";
  const at = isGroup ? "@我 " : "";
  return `\n🔀 类型不对？回复 ${at}**改成 ${others.join(" / ")}** 之一。`;
}

/** Scope-aware prompt asking the user for the actual content (no draft yet). */
function scopeAskPrompt(scope: IntakeScope, isGroup: boolean): string {
  const at = isGroup ? "@我 " : "";
  const asks: Partial<Record<IntakeScope, string>> = {
    todo: "好的，待办内容是什么？（可附截止日期）",
    business_record: "好的，请描述这次商务进展：和谁、做了什么、现场还是非现场。",
    opportunity: "好的，商机叫什么？（可附客户、金额、阶段）",
    powermap: "好的，联系人是谁？（可附职位、决策角色）",
    training: "好的，给谁安排什么培训？",
    solution: "好的，方案名称与要点是什么？",
  };
  const ask = asks[scope] ?? "好的，请补充具体内容。";
  return `${ask}\n（直接 ${at}发内容即可，或回复 ${at}**取消** 放弃）`;
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
  if (opts.scope === "todo") {
    const t = opts.proposal.todos[0];
    const hasTitle = !!t?.title?.trim();
    const hasPartner = !!opts.proposal.partnerName?.trim() || !!opts.proposal.customerName?.trim();
    const lines = [
      checklistLine(hasTitle, "待办内容", t?.title?.slice(0, 60)),
      checklistLine(!!t?.assigneeName?.trim(), "负责人", t?.assigneeName),
      checklistLine(hasPartner, "归属伙伴/客户", opts.proposal.partnerName ?? opts.proposal.customerName),
    ];
    return `草案信息还不够完整，请按清单补全 ⬜ 项后再回复「确认」，或回复「取消」放弃。\n**【待办 · 填报清单】**\n${lines.join("\n")}`;
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
  for (const t of opts.proposal.todos) {
    const extra = [
      t.assigneeName ? `负责人 ${t.assigneeName}` : "",
      t.dueDate ? `截止 ${t.dueDate}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    draftLines.push(`待办：${t.title}${extra ? ` · ${extra}` : ""}`);
  }
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

  const switchHint = hasItems ? scopeSwitchHint(opts.scope, isGroup) : "";

  if (opts.ready && hasItems) {
    parts.push(`\n---\n✅ 信息已足够。${confirmHint}${crmOnlyHint}${switchHint}`);
  } else if (opts.crmOnlyReady && hasItems) {
    parts.push(`\n---\n📝 草案可仅写 CRM。${crmOnlyHint} 或 **取消** 放弃。${switchHint}`);
  } else if (hasItems) {
    parts.push(`\n---\n📝 草案进行中。补全清单后 ${confirmHint}${crmOnlyHint}${switchHint}`);
  } else {
    parts.push(`\n---\n${scopeAskPrompt(opts.scope, isGroup)}`);
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
