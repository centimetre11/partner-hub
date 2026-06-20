import { AIError, chatJson } from "./ai";
import { emitPhase, emitReplyChunks, nextTraceId, type TraceEmitter } from "./ai-trace";
import { clarificationSchemaHint, hasRequiredClarifications, normalizeAiClarifications } from "./ai-clarifications";
import { CRON_PRESETS } from "./cron";
import type { Locale } from "./i18n/locale";
import { DEFAULT_TASK_MD } from "./automation-defaults";
import type {
  AutomationBuilderClarification,
  AutomationBuilderDraft,
  AutomationBuilderMessage,
  AutomationBuilderTurn,
} from "./automation-builder-types";

export type {
  AutomationBuilderClarification,
  AutomationBuilderDraft,
  AutomationBuilderMessage,
  AutomationBuilderTurn,
} from "./automation-builder-types";

const DEFAULT_DRAFT: AutomationBuilderDraft = {
  slug: "",
  name: "",
  description: "",
  taskMd: DEFAULT_TASK_MD,
  triggerType: "SCHEDULE",
  cronExpr: "0 9 * * *",
  timezone: "Asia/Shanghai",
  validityDays: 7,
  variables: [],
  maxIterations: 30,
  timeoutMinutes: 60,
  notifyOnSuccess: true,
  notifyOnFailure: true,
  wecomPushChatId: "",
  webhookUrl: "",
  rationale: "",
  questionnaire: [],
  missingSkillNotes: [],
};

function outputSchema(locale: Locale) {
  const replyLang = locale === "zh" ? "Chinese" : "English";
  return `Output exactly one JSON object. ALL user-visible text fields MUST be in ${replyLang}. draft.slug stays lowercase English kebab-case.
{
  "reply": "${replyLang} concise reply explaining understanding and next step",
  "clarifications": [
    {
      "id": "stable_snake_id",
      "question": "${replyLang} one-line confirmation question",
      "options": ["${replyLang} 2-4 choices; FIRST is recommended"],
      "tier": "required | preference"
    }
  ],
  "questions": [],
  "ready": true/false,
  "draft": {
    "slug": "english-kebab-case e.g. gold-price-monitor",
    "name": "${replyLang} display name",
    "description": "${replyLang} one-line description",
    "taskMd": "Full TASK.md with YAML frontmatter (name, description) and sections: 任务目标/执行步骤/输出要求 (or English equivalents)",
    "triggerType": "SCHEDULE | WEBHOOK | EVENT",
    "cronExpr": "5-field cron e.g. 0 9 * * * (required when SCHEDULE)",
    "timezone": "Asia/Shanghai",
    "validityDays": 7,
    "variables": [{"key": "var_name", "value": "default", "label": "${replyLang} label"}],
    "maxIterations": 30,
    "timeoutMinutes": 60,
    "notifyOnSuccess": true,
    "notifyOnFailure": true,
    "wecomPushChatId": "",
    "webhookUrl": "",
    "rationale": "${replyLang} why this schedule, steps, and delivery",
    "questionnaire": [],
    "missingSkillNotes": []
  }
}`;
}

function buildSystemPrompt(locale: Locale) {
  const lang = locale === "zh" ? "Chinese (简体中文)" : "English";
  const cronExamples = CRON_PRESETS.map((p) => `${p.expr} = ${locale === "zh" ? p.labelZh : p.labelEn}`).join("\n");

  return `You are the conversational "Automation Pipeline Architect" in the AI Center.
Goal: help users create scheduled or webhook-triggered automation pipelines through dialogue — NOT interactive Agents.

Language: UI locale is ${lang}. Write reply, clarifications, and draft user-facing fields in ${lang}. draft.slug stays English kebab-case.

What automations are:
- Pipelines defined in TASK.md (SKILL.md-compatible format with YAML frontmatter)
- Run on Cron schedule or external Webhook trigger
- Execute autonomously with tools; output Markdown summary when done

How you work:
1. Understand: business goal, data sources, schedule, outputs, notifications.
2. When info is insufficient, output clarifications[] (max 4) with 2-4 options each. Put recommended choice FIRST. No "Other" — UI adds it. tier:"required" when user must answer; tier:"preference" for optional refinements (e.g. run at 9:00 vs 10:00) — apply first option to draft for preference.
3. Write taskMd as complete TASK.md:
   - YAML frontmatter: name, description
   - # 任务目标 (or # Goal)
   - ## 执行步骤 (numbered steps referencing tools when useful: web_search, search_knowledge, create_document, push_wecom, etc.)
   - ## 输出要求
   - Use {{variable_name}} for configurable variables; list them in draft.variables
4. Default triggerType=SCHEDULE unless user wants webhook-only.
5. Common cron presets:
${cronExamples}
6. Before ready=true confirm: goal clear, taskMd complete, trigger + schedule (if SCHEDULE), slug derived from purpose; no unanswered tier:"required" clarifications.
7. EVENT trigger is not available yet — if user asks, suggest SCHEDULE or WEBHOOK and note EVENT coming soon.

${clarificationSchemaHint(locale)}

${outputSchema(locale)}`;
}

function isDraftReady(draft: AutomationBuilderDraft): boolean {
  if (!draft.slug.trim() || !draft.name.trim() || !draft.taskMd.trim()) return false;
  if (draft.triggerType === "SCHEDULE" && !draft.cronExpr.trim()) return false;
  if (draft.triggerType === "EVENT") return false;
  return true;
}

function legacyQuestionOptions(locale: Locale): string[] {
  return locale === "zh"
    ? ["采用当前草案（推荐）", "需要调整", "还不确定"]
    : ["Use current draft (recommended)", "Need changes", "Not sure yet"];
}

function normalizeClarifications(raw: unknown, questions: string[], locale: Locale): AutomationBuilderClarification[] {
  const out = normalizeAiClarifications(raw, { max: 4, defaultTier: "required" });
  if (out.length) return out;
  const qs = questions.map((q) => String(q).trim()).filter(Boolean).slice(0, 4);
  return qs.map((question, i) => ({
    id: `legacy-${i}`,
    question,
    options: legacyQuestionOptions(locale),
  }));
}

function normalizeTriggerType(v: unknown): AutomationBuilderDraft["triggerType"] {
  const s = String(v ?? "").toUpperCase();
  if (s === "WEBHOOK") return "WEBHOOK";
  if (s === "EVENT") return "EVENT";
  return "SCHEDULE";
}

function normalizeDraft(raw: Partial<AutomationBuilderDraft>): AutomationBuilderDraft {
  const triggerType = normalizeTriggerType(raw.triggerType);
  let cronExpr = String(raw.cronExpr ?? "0 9 * * *").trim();
  if (!cronExpr) cronExpr = "0 9 * * *";

  const variables = Array.isArray(raw.variables)
    ? raw.variables
        .filter((v) => v && typeof v.key === "string")
        .map((v) => ({
          key: String(v.key).trim(),
          value: String(v.value ?? ""),
          label: v.label ? String(v.label) : undefined,
        }))
        .filter((v) => v.key)
    : [];

  return {
    slug: String(raw.slug ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64),
    name: String(raw.name ?? "").trim(),
    description: String(raw.description ?? "").trim(),
    taskMd: String(raw.taskMd ?? DEFAULT_TASK_MD).trim() || DEFAULT_TASK_MD,
    triggerType,
    cronExpr,
    timezone: String(raw.timezone ?? "Asia/Shanghai").trim() || "Asia/Shanghai",
    validityDays: Number.isInteger(raw.validityDays) ? (raw.validityDays as number) : 7,
    variables,
    maxIterations: Number.isInteger(raw.maxIterations) ? (raw.maxIterations as number) : 30,
    timeoutMinutes: Number.isInteger(raw.timeoutMinutes) ? (raw.timeoutMinutes as number) : 60,
    notifyOnSuccess: raw.notifyOnSuccess !== false,
    notifyOnFailure: raw.notifyOnFailure !== false,
    wecomPushChatId: String(raw.wecomPushChatId ?? ""),
    webhookUrl: String(raw.webhookUrl ?? ""),
    rationale: String(raw.rationale ?? ""),
    questionnaire: Array.isArray(raw.questionnaire) ? raw.questionnaire.map(String) : [],
    missingSkillNotes: Array.isArray(raw.missingSkillNotes) ? raw.missingSkillNotes.map(String) : [],
  };
}

function normalizeTurn(raw: Partial<AutomationBuilderTurn>, locale: Locale): AutomationBuilderTurn {
  const draft = normalizeDraft({ ...DEFAULT_DRAFT, ...(raw.draft ?? {}) });
  const clarifications = normalizeClarifications(raw.clarifications, Array.isArray(raw.questions) ? raw.questions : [], locale);
  const defaultReply =
    locale === "zh" ? "我已整理自动化管道草案，请确认或补充。" : "I've drafted an automation pipeline — please confirm or add details.";
  return {
    reply: raw.reply?.trim() || defaultReply,
    questions: clarifications.map((c) => c.question),
    clarifications,
    ready: !!raw.ready && isDraftReady(draft) && !hasRequiredClarifications(clarifications),
    draft,
  };
}

function fallbackTurn(locale: Locale, detail: string, partial?: Partial<AutomationBuilderTurn>): AutomationBuilderTurn {
  const draft = normalizeDraft({ ...DEFAULT_DRAFT, ...(partial?.draft ?? {}) });
  const reply =
    locale === "zh"
      ? `抱歉，AI 返回格式有误。请继续补充需求或简化描述后重试。\n\n（${detail.slice(0, 120)}）`
      : `Sorry — format error. Please add detail or retry.\n\n(${detail.slice(0, 120)})`;
  const questions = Array.isArray(partial?.questions) ? partial!.questions! : [];
  return {
    reply: partial?.reply?.trim() || reply,
    questions,
    clarifications: normalizeClarifications(partial?.clarifications, questions, locale),
    ready: false,
    draft,
  };
}

export async function runAutomationBuilderTurn(opts: {
  messages: AutomationBuilderMessage[];
  userId?: string;
  emit?: TraceEmitter;
  locale?: Locale;
}): Promise<AutomationBuilderTurn> {
  const locale = opts.locale ?? "en";
  const system = buildSystemPrompt(locale);
  const conversation = opts.messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
  const userPrompt =
    locale === "zh"
      ? `【当前对话】\n${conversation || "用户尚未描述需求，请引导其说明想创建的自动化任务。"}`
      : `【Current conversation】\n${conversation || "User has not described a need yet. Guide them on what automation to create."}`;

  const emit = opts.emit;
  const reasonId = nextTraceId("reason");
  if (emit) {
    emitPhase(emit, "research", locale === "zh" ? "分析自动化需求" : "Analyzing automation requirements");
    emit({
      event: "trace",
      step: {
        type: "reasoning",
        id: reasonId,
        content: locale === "zh" ? "设计 TASK.md 与调度配置…" : "Designing TASK.md and schedule…",
        status: "running",
      },
    });
  }

  let raw: Partial<AutomationBuilderTurn>;
  try {
    if (emit) {
      emit({ event: "trace_patch", id: reasonId, patch: { status: "done" } });
      emitPhase(emit, "extract", locale === "zh" ? "生成自动化草案" : "Building automation draft");
    }
    const architectId = nextTraceId("tool");
    if (emit) {
      emit({
        event: "trace",
        step: {
          type: "tool",
          id: architectId,
          name: "automation_architect",
          label: locale === "zh" ? "自动化架构师" : "Automation architect",
          args: { turns: opts.messages.length },
          status: "running",
        },
      });
    }
    raw = await chatJson<Partial<AutomationBuilderTurn>>(system, userPrompt, {
      feature: locale === "zh" ? "自动化 Builder" : "Automation builder",
      userId: opts.userId,
      temperature: 0.2,
    });
    if (emit) {
      emit({
        event: "trace_patch",
        id: architectId,
        patch: {
          status: "done",
          result:
            locale === "zh"
              ? `草案：${raw.draft?.name?.trim() || "未命名"} · ${raw.draft?.cronExpr || ""}`
              : `Draft: ${raw.draft?.name?.trim() || "Untitled"} · ${raw.draft?.cronExpr || ""}`,
        },
      });
    }
  } catch (e) {
    if (emit) emit({ event: "trace_patch", id: reasonId, patch: { status: "done" } });
    const detail = e instanceof AIError ? e.message : e instanceof Error ? e.message : String(e);
    return fallbackTurn(locale, detail);
  }

  const turn = normalizeTurn(raw, locale);
  if (emit) emitPhase(emit, "reply", locale === "zh" ? "生成回复" : "Generating reply");
  await emitReplyChunks(opts.emit, turn.reply);
  return turn;
}

export { isDraftReady };
