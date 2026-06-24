import { pushChannelsLabel } from "./builder-context-prompt";
import type { Locale } from "./i18n/locale";
import {
  buildAutomationVariables,
  inferDueWithinDays,
  partnerScopeLabel,
  pickAutomationTaskMd,
  resolveAutomationRuntimeSkills,
} from "./automation-push";

export type AutomationPlanTemplate = "open-todos" | "due-todos" | "scheduled";

export type AutomationPlanPreview = {
  goal: string;
  template: AutomationPlanTemplate;
  templateLabel: string;
  partnerScope: string;
  channelsLabel: string;
  dueWithinDays?: number;
  runtimeSkills: string[];
  steps: string[];
  taskMd: string;
};

function inferTemplateFromTaskMd(taskMd: string): AutomationPlanTemplate {
  if (/name:\s*due-todos-push/.test(taskMd)) return "due-todos";
  if (/name:\s*open-todos-push/.test(taskMd)) return "open-todos";
  return "scheduled";
}

function templateLabel(template: AutomationPlanTemplate, locale: Locale, dueWithinDays?: number): string {
  if (locale === "zh") {
    if (template === "due-todos") return `未来 ${dueWithinDays ?? "?"} 天到期待办 → 推送`;
    if (template === "open-todos") return "全部 OPEN 待办 → 推送";
    return "按任务目标查询 → 推送";
  }
  if (template === "due-todos") return `Todos due within ${dueWithinDays ?? "?"} days → push`;
  if (template === "open-todos") return "All OPEN todos → push";
  return "Query per goal → push";
}

function buildPushStepLines(
  locale: Locale,
  channels: { wecomGroup: boolean; wecomApp: boolean; email: boolean }
): string[] {
  const lines: string[] = [];
  if (locale === "zh") {
    if (channels.wecomGroup) lines.push("推送到企微群（push_wecom）");
    if (channels.wecomApp) lines.push("发送企微应用消息（send_wecom_app，收件人由任务自动判断）");
    if (channels.email) lines.push("发送邮件（send_email）");
    if (!lines.length) lines.push("未配置推送渠道（保存前请至少选一种）");
  } else {
    if (channels.wecomGroup) lines.push("Push to WeCom group (push_wecom)");
    if (channels.wecomApp) lines.push("WeCom app message (send_wecom_app; recipients inferred at runtime)");
    if (channels.email) lines.push("Send email (send_email)");
    if (!lines.length) lines.push("No delivery channel selected yet");
  }
  return lines;
}

function buildPlanSteps(
  template: AutomationPlanTemplate,
  locale: Locale,
  channels: { wecomGroup: boolean; wecomApp: boolean; email: boolean },
  dueWithinDays?: number
): string[] {
  const pushLines = buildPushStepLines(locale, channels);
  if (locale === "zh") {
    if (template === "open-todos") {
      return [
        "调用 list_todos 查询全部 OPEN 待办（可按伙伴过滤）",
        "将每条待办格式化为 Markdown 列表（含 id、标题、截止日、负责人）",
        ...pushLines,
        "输出摘要：条数 + 完整列表 + 是否已推送",
      ];
    }
    if (template === "due-todos") {
      return [
        `调用 list_todos（dueWithinDays=${dueWithinDays ?? 3}，含今天起 N 个自然日）`,
        "若有待办：格式化为 Markdown 列表；若无：说明无到期待办",
        ...pushLines,
        "输出摘要：条数 + 是否已推送",
      ];
    }
    return [
      "按任务目标选择工具（list_todos / list_opportunities / web_search 等）",
      "整理查询结果为 Markdown",
      ...pushLines,
      "输出摘要：结论、条数、是否已推送",
    ];
  }

  if (template === "open-todos") {
    return [
      "list_todos for all OPEN todos (optional partner filter)",
      "Format every todo as a Markdown list line",
      ...pushLines,
      "Final brief: count + full list + push status",
    ];
  }
  if (template === "due-todos") {
    return [
      `list_todos with dueWithinDays=${dueWithinDays ?? 3}`,
      "Format list or report none due",
      ...pushLines,
      "Final brief: count + push status",
    ];
  }
  return [
    "Pick tools per goal (list_todos / list_opportunities / web_search, etc.)",
    "Format results as Markdown",
    ...pushLines,
    "Final brief: findings, count, push status",
  ];
}

/** 根据当前表单值生成保存后将写入 instructions 的执行计划（纯规则，不调 AI） */
export function buildAutomationPlanPreview(input: {
  description: string;
  partnerId: string;
  partnerName?: string;
  wecomPushChatId: string;
  pushEmailTo: string;
  pushWecomAppTo: string;
  locale: Locale;
}): AutomationPlanPreview {
  const locale = input.locale;
  const goal =
    input.description.trim() ||
    (locale === "zh" ? "定时查询并推送" : "Scheduled query and push");
  const partnerId = input.partnerId.trim();
  const partnerName = input.partnerName?.trim() || "";
  const wecomPushChatId = input.wecomPushChatId.trim();
  const pushEmailTo = input.pushEmailTo.trim();
  const pushWecomAppTo = input.pushWecomAppTo.trim();

  const dueWithinDays = inferDueWithinDays(goal);

  const taskMd = pickAutomationTaskMd({
    goal,
    partnerId,
    partnerName: partnerName || undefined,
    dueWithinDays,
    wecomPushChatId,
    pushEmailTo,
    pushWecomAppTo,
    locale,
  });

  const template = inferTemplateFromTaskMd(taskMd);
  const partnerScope = partnerId
    ? partnerName || partnerId
    : partnerScopeLabel(undefined, locale);

  const channels = {
    wecomGroup: !!wecomPushChatId,
    wecomApp: !!pushWecomAppTo,
    email: !!pushEmailTo,
  };

  return {
    goal,
    template,
    templateLabel: templateLabel(template, locale, dueWithinDays),
    partnerScope,
    channelsLabel: pushChannelsLabel(
      { wecomPushChatId, pushEmailTo, pushWecomAppTo },
      locale === "zh" ? "zh" : "en"
    ),
    dueWithinDays: template === "due-todos" ? dueWithinDays : undefined,
    runtimeSkills: resolveAutomationRuntimeSkills({
      wecomPushChatId,
      pushEmailTo,
      pushWecomAppTo,
    }),
    steps: buildPlanSteps(template, locale, channels, dueWithinDays),
    taskMd,
  };
}
