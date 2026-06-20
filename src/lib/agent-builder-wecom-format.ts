import type { AgentBuilderDraft, AgentBuilderTurn } from "./agent-builder-types";
import { partitionClarificationsByTier } from "./ai-clarifications";
import type { CreateAgentResult } from "./agent-create";

const DELIVERY_LABELS: Record<string, string> = {
  inbox: "Partner Hub 收件箱",
  wecom_chat: "当前企微会话",
  partner_group: "绑定伙伴企微群",
  webhook: "Webhook 推送",
};

const FREQ_LABELS: Record<string, string> = {
  HOURLY: "每小时",
  DAILY: "每天",
  WEEKLY: "每周",
};

function checklistLine(done: boolean, label: string, value?: string) {
  const mark = done ? "✅" : "⬜";
  return value ? `${mark} ${label}：${value}` : `${mark} ${label}`;
}

function triggerLabel(draft: AgentBuilderDraft): string {
  if (draft.trigger !== "SCHEDULE") return "手动触发";
  const freq = FREQ_LABELS[draft.frequency] ?? draft.frequency;
  if (draft.frequency === "WEEKLY") {
    return `${freq} ${draft.runHour}:00（周${draft.runWeekday}）`;
  }
  return `${freq} ${draft.runHour}:00`;
}

function deliveryLabel(draft: AgentBuilderDraft): string {
  const base = DELIVERY_LABELS[draft.deliveryMode] ?? (draft.deliveryMode || "未设置");
  if (draft.deliveryMode === "webhook" && draft.webhookUrl) {
    return `${base}（${draft.webhookUrl.slice(0, 40)}…）`;
  }
  return base;
}

/** Render Agent Builder draft as WeCom-friendly markdown */
export function formatAgentBuilderWecomReply(opts: {
  turn: AgentBuilderTurn;
  chatType?: "group" | "single";
  boundPartnerName?: string;
}): string {
  const { turn, chatType } = opts;
  const draft = turn.draft;
  const parts: string[] = [];

  if (turn.reply.trim()) parts.push(turn.reply.trim());

  const checklist = [
    checklistLine(!!draft.name && !!draft.instructions, "业务目标", draft.name || undefined),
    checklistLine(draft.trigger === "MANUAL" || draft.frequency !== undefined, "触发方式", triggerLabel(draft)),
    checklistLine(!!draft.deliveryMode, "结果交付", deliveryLabel(draft)),
    checklistLine(draft.skills.length > 0, "工具", draft.skills.join(", ") || undefined),
    checklistLine(
      draft.scopeType !== "PARTNER" || !!draft.partnerId,
      "范围",
      draft.scopeType === "PARTNER"
        ? opts.boundPartnerName ?? draft.partnerId ?? "待绑定伙伴"
        : "全局"
    ),
  ];

  parts.push(`\n**【Agent 草案 · ${draft.icon} ${draft.name || "未命名"}】**`);
  if (draft.description) parts.push(`_${draft.description}_`);
  parts.push(checklist.join("\n"));

  if (turn.clarifications.length) {
    const { required, preference } = partitionClarificationsByTier(turn.clarifications);
    if (required.length) {
      parts.push(
        `\n**待确认（必答）：**\n${required
          .map((c) => {
            const opts = c.options.map((o, i) => `${i === 0 ? "★ " : ""}${String.fromCharCode(65 + i)}. ${o}`).join("\n   ");
            return `• ${c.question}\n   ${opts}`;
          })
          .join("\n")}`
      );
    }
    if (preference.length) {
      parts.push(
        `\n**偏好选项（可选，已按 ★ 推荐继续）：**\n${preference
          .map((c) => {
            const opts = c.options.map((o, i) => `${i === 0 ? "★ " : ""}${String.fromCharCode(65 + i)}. ${o}`).join("\n   ");
            return `• ${c.question}\n   ${opts}`;
          })
          .join("\n")}`
      );
    }
  } else if (turn.questions.length) {
    parts.push(`\n**待确认：**\n${turn.questions.map((q) => `• ${q}`).join("\n")}`);
  }
  if (draft.questionnaire.length) {
    parts.push(`\n**调研问题：**\n${draft.questionnaire.map((q) => `• ${q}`).join("\n")}`);
  }

  const isGroup = chatType !== "single";
  const confirmHint = isGroup
    ? "群聊请 **@我 确认** 创建 Agent，**@我 取消** 放弃。"
    : "请回复 **确认** 创建 Agent，或 **取消** 放弃。";

  if (turn.ready) {
    parts.push(
      `\n---\n✅ 草案已就绪（**尚未写入系统**）。${confirmHint}\n也可直接 @我 **创建Agent** 或 **试运行**（试运行会自动创建并执行一次）。`
    );
  } else {
    parts.push(`\n---\n📝 草案构建中，请继续补充。${confirmHint}`);
  }

  return parts.join("\n").slice(0, 3800);
}

export function formatAgentCreatedReply(
  created: CreateAgentResult,
  draft: AgentBuilderDraft,
  appOrigin?: string
): string {
  const origin = appOrigin ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const link = origin ? `${origin.replace(/\/$/, "")}/agents/${created.id}` : `/agents/${created.id}`;
  const lines = [
    `✅ **Agent 已创建：${draft.icon} ${created.name}**`,
    `• 触发：${triggerLabel(draft)}`,
    `• 交付：${deliveryLabel(draft)}`,
    `• 状态：已启用`,
  ];
  if (created.nextRunAt) {
    lines.push(`• 下次定时运行：${created.nextRunAt.toLocaleString("zh-CN")}`);
  }
  lines.push(`\nWeb 管理：${link}`);
  lines.push("\n回复 **@我 试运行** 可立即执行一次并推送到已配置的交付渠道。");
  return lines.join("\n");
}

export function formatAgentTrialRunReply(output: string, agentName: string): string {
  const preview = output.trim().slice(0, 3200);
  return `**试运行完成 · ${agentName}**\n\n${preview}${output.length > 3200 ? "\n\n…（内容已截断）" : ""}`;
}
