import type { AutomationBuilderDraft, AutomationBuilderTurn } from "./automation-builder-types";
import { partitionClarificationsByTier } from "./ai-clarifications";
import { describeCron } from "./cron";
import { partnerScopeLabel } from "./automation-push";
import type { CreateAutomationResult } from "./automation-create";

function checklistLine(done: boolean, label: string, value?: string) {
  const mark = done ? "✅" : "⬜";
  return value ? `${mark} ${label}：${value}` : `${mark} ${label}`;
}

/** Render Automation Builder draft as WeCom-friendly markdown */
export function formatAutomationBuilderWecomReply(opts: {
  turn: AutomationBuilderTurn;
  chatType?: "group" | "single";
  boundPartnerName?: string;
}): string {
  const { turn, chatType, boundPartnerName } = opts;
  const draft = turn.draft;
  const parts: string[] = [];

  if (turn.reply.trim()) parts.push(turn.reply.trim());

  const scopeLabel = draft.partnerId
    ? boundPartnerName || draft.partnerId
    : partnerScopeLabel(undefined, "zh");

  const checklist = [
    checklistLine(!!draft.description, "任务目标", draft.description || undefined),
    checklistLine(true, "数据范围", scopeLabel),
    checklistLine(!!draft.cronExpr, "定时", describeCron(draft.cronExpr, "zh")),
    checklistLine(!!draft.wecomPushChatId || !!draft.pushEmailTo, "推送", [
      draft.wecomPushChatId ? "企微群" : "",
      draft.pushEmailTo ? `邮件 ${draft.pushEmailTo}` : "",
    ]
      .filter(Boolean)
      .join(" · ") || undefined),
  ];

  parts.push(`\n**【自动化草案 · ⚡ ${draft.name || "未命名"}】**`);
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

  const isGroup = chatType !== "single";
  const confirmHint = isGroup
    ? "群聊请 **@我 确认** 创建自动化，**@我 取消** 放弃。"
    : "请回复 **确认** 创建自动化，或 **取消** 放弃。";

  if (turn.ready) {
    parts.push(
      `\n---\n✅ 草案已就绪（**尚未写入系统**）。${confirmHint}\n也可 @我 **创建自动化** 或 **试运行**（试运行会自动创建并执行一次）。`
    );
  } else {
    parts.push(`\n---\n📝 草案构建中，请继续补充。${confirmHint}`);
  }

  return parts.join("\n").slice(0, 3800);
}

export function formatAutomationCreatedReply(
  created: CreateAutomationResult,
  draft: AutomationBuilderDraft,
  appOrigin?: string
): string {
  const origin = appOrigin ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const link = origin ? `${origin.replace(/\/$/, "")}/automations/${created.id}` : `/automations/${created.id}`;
  const lines = [
    `✅ **自动化已创建：⚡ ${created.name}**`,
    `• 标识：\`${created.slug}\``,
    `• 调度：${describeCron(draft.cronExpr, "zh")}`,
    `• 状态：已启用`,
  ];
  if (created.nextRunAt) {
    lines.push(`• 下次运行：${created.nextRunAt.toLocaleString("zh-CN")}`);
  }
  lines.push(`\nWeb 管理：${link}`);
  lines.push("\n回复 **@我 试运行** 可立即执行一次。");
  return lines.join("\n");
}

export function formatAutomationTrialRunReply(output: string, name: string): string {
  const preview = output.trim().slice(0, 3200);
  return `**试运行完成 · ⚡ ${name}**\n\n${preview}${output.length > 3200 ? "\n\n…（内容已截断）" : ""}`;
}
