import type { IntakeProposal, IntakeScope } from "./ai-intake";
import { countProposalItems } from "./proposal-merge";

const SCOPE_LABELS: Record<IntakeScope, string> = {
  new_partner: "添加伙伴",
  powermap: "添加联系人",
  opportunity: "添加商机",
  profile: "补全画像",
  training: "培训计划",
  solution: "联合方案",
  business_record: "商务记录",
  todo: "待办",
};

function bullet(lines: string[]) {
  return lines.filter(Boolean).map((l) => `• ${l}`).join("\n");
}

/** Render propose draft as WeCom-friendly markdown */
export function formatProposeWecomReply(opts: {
  scope: IntakeScope;
  reply: string;
  proposal: IntakeProposal;
  ready: boolean;
  questions?: string[];
  chatType?: "group" | "single";
}): string {
  const parts: string[] = [];
  if (opts.reply.trim()) parts.push(opts.reply.trim());

  const draftLines: string[] = [];
  if (opts.proposal.partnerName) draftLines.push(`归属伙伴：${opts.proposal.partnerName}`);
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

  if (draftLines.length) {
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
  const partnerHint =
    !isGroup && !opts.proposal.partnerName && opts.scope === "business_record"
      ? "\n💡 私聊录入需指定伙伴：回复公司全称（如 ASTRA Group），或消息里带上公司名。"
      : "";

  if (opts.ready && hasItems) {
    parts.push(`\n---\n✅ 信息已足够。${confirmHint}${partnerHint}`);
  } else if (hasItems) {
    parts.push(`\n---\n📝 草案进行中。可继续补充，就绪后 ${confirmHint}${partnerHint}`);
  } else {
    parts.push("\n---\n请补充更多信息以生成可保存的草案。");
  }

  return parts.join("\n").slice(0, 3800);
}

export function formatProposeAppliedReply(applied: string[], partnerId: string, scope: IntakeScope): string {
  const scopeLabel = SCOPE_LABELS[scope];
  const lines = applied.length ? applied.map((a) => `• ${a}`).join("\n") : "• 已保存";
  if (!partnerId) {
    return `✅ **${scopeLabel}已保存**\n${lines}`;
  }
  return `✅ **${scopeLabel}已保存**\n${lines}\n\n伙伴 ID：\`${partnerId.slice(0, 12)}…\``;
}
