import { chatJson } from "./ai";
import { emitTextChunks, type TraceEmitter } from "./ai-trace";
import { db } from "./db";
import { resolveAgentSkills } from "./skill-resolver";

export type AgentBuilderMessage = { role: "user" | "assistant"; content: string };

export type AgentBuilderDraft = {
  name: string;
  icon: string;
  description: string;
  instructions: string;
  skills: string[];
  skillIds: string[];
  trigger: "MANUAL" | "SCHEDULE";
  frequency: "HOURLY" | "DAILY" | "WEEKLY";
  runHour: number;
  runWeekday: number;
  scopeType: "ALL" | "PARTNER";
  partnerId: string;
  shared: boolean;
  webhookUrl: string;
  missingSkillNotes: string[];
  questionnaire: string[];
  rationale: string;
};

export type AgentBuilderTurn = {
  reply: string;
  questions: string[];
  ready: boolean;
  draft: AgentBuilderDraft;
};

const DEFAULT_DRAFT: AgentBuilderDraft = {
  name: "",
  icon: "🤖",
  description: "",
  instructions: "",
  skills: [],
  skillIds: [],
  trigger: "MANUAL",
  frequency: "WEEKLY",
  runHour: 9,
  runWeekday: 1,
  scopeType: "ALL",
  partnerId: "",
  shared: true,
  webhookUrl: "",
  missingSkillNotes: [],
  questionnaire: [],
  rationale: "",
};

const OUTPUT_SCHEMA = `只输出一个 JSON 对象：
{
  "reply": "给用户的中文回复，像产品顾问一样简洁说明当前理解和下一步",
  "questions": ["还需要用户确认的问题，最多 5 个；如果信息已足够则为空"],
  "ready": true/false,
  "draft": {
    "name": "Agent 名称",
    "icon": "一个 emoji",
    "description": "一句话说明",
    "instructions": "完整系统指令，说明身份、每次运行步骤、工具使用顺序、输出格式、遇到没有工具时如何先用已有资料和推理尝试解决并说明限制",
    "skills": ["工具 name，如 web_search"],
    "skillIds": ["技能 id"],
    "trigger": "MANUAL 或 SCHEDULE",
    "frequency": "HOURLY/DAILY/WEEKLY",
    "runHour": 0-23,
    "runWeekday": 1-7,
    "scopeType": "ALL 或 PARTNER",
    "partnerId": "绑定伙伴 id 或空字符串",
    "shared": true,
    "webhookUrl": "",
    "missingSkillNotes": ["没有合适技能时的说明和 Agent 将如何临时处理"],
    "questionnaire": ["像调研问卷一样给用户确认的问题"],
    "rationale": "为什么选这些工具和技能、以及触发方式"
  }
}`;

function clampHour(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 9;
}

function clampWeekday(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : 1;
}

export async function runAgentBuilderTurn(opts: {
  messages: AgentBuilderMessage[];
  userId?: string;
  emit?: TraceEmitter;
}): Promise<AgentBuilderTurn> {
  const [{ toolOptions, promptSkillOptions }, partners, knowledge] = await Promise.all([
    resolveAgentSkills(),
    db.partner.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { id: true, name: true, status: true, tier: true, country: true },
      orderBy: { name: "asc" },
      take: 80,
    }),
    db.knowledgeArticle.findMany({
      where: { shared: true },
      select: { title: true, category: true },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
  ]);

  const builtinNames = new Set(toolOptions.map((t) => t.name));
  const promptSkillIds = new Set(promptSkillOptions.map((s) => s.id));
  const partnerIds = new Set(partners.map((p) => p.id));

  const toolLines = toolOptions.map((t) => `TOOL name=${t.name} | ${t.label} | ${t.desc}`).join("\n");
  const promptSkillLines = promptSkillOptions.map((s) => `SKILL id=${s.id} | ${s.label} | ${s.desc}`).join("\n") || "（暂无自定义技能）";
  const partnerLines = partners
    .map((p) => `${p.id} | ${p.name} | ${p.status}${p.tier ? ` | Tier ${p.tier}` : ""}${p.country ? ` | ${p.country}` : ""}`)
    .join("\n");
  const knowledgeLines = knowledge.map((k) => `${k.category} | ${k.title}`).join("\n") || "（暂无共享知识）";

  const system = `你是 AI Agent 平台里的「对话式 Agent 架构师」，参考 OpenClaw / Harness / Workbuddy 一类平台的体验。
目标：通过对话帮用户构建可落地运行的 Agent，而不是让用户自己理解所有表单字段。

工作方式：
1. 先理解业务目标、输入来源、触发时机、输出物、写库/推送需求、风险边界。
2. 信息不足时，用“调研问卷”的方式一次性提出最关键的澄清问题，不要碎片化追问。
3. 主动从工具清单选择合适工具（draft.skills）；从技能清单选择方法论（draft.skillIds）；优先少而准。
4. 如果没有完全匹配的技能，不要卡住；在 missingSkillNotes 说明缺口，并把临时解决办法写入 instructions：先用 linkedin_search、web_search、知识库、档案和推理尝试完成。
5. 如果任务需要公司策略/产品知识，建议选择 search_knowledge，并在指令里要求先查知识库。
6. Agent 对伙伴档案字段的修改应走提案/人工确认；写时间线、建待办、创建文档可以作为执行动作。
7. ready=true 只在草案足够创建时给出；如果仍缺目标/触发/输出/数据源这些核心信息，ready=false 并给 questionnaire。

【可用工具（draft.skills 填 name）】
${toolLines}

【可用技能（draft.skillIds 填 id）】
${promptSkillLines}

【可绑定伙伴】
${partnerLines || "（暂无伙伴）"}

【可引用知识库】
${knowledgeLines}

${OUTPUT_SCHEMA}`;

  const conversation = opts.messages.map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`).join("\n\n");
  const raw = await chatJson<Partial<AgentBuilderTurn>>(
    system,
    `【当前对话】\n${conversation || "用户还没有提供需求。请引导他说明想构建什么 Agent。"}`,
    { feature: "对话式 Agent 构建器", userId: opts.userId, temperature: 0.2 }
  );
  const draft = { ...DEFAULT_DRAFT, ...(raw.draft ?? {}) } as AgentBuilderDraft;
  const skills = Array.isArray(draft.skills) ? draft.skills.filter((s) => builtinNames.has(s)) : [];
  const skillIds = Array.isArray(draft.skillIds) ? draft.skillIds.filter((id) => promptSkillIds.has(id)) : [];
  const scopeType = draft.scopeType === "PARTNER" && partnerIds.has(draft.partnerId) ? "PARTNER" : "ALL";

  const turn: AgentBuilderTurn = {
    reply: raw.reply || "我先整理成一个 Agent 草案，请确认还需要补充什么。",
    questions: Array.isArray(raw.questions) ? raw.questions : [],
    ready: !!raw.ready && !!draft.name && !!draft.instructions,
    draft: {
      ...draft,
      icon: draft.icon || "🤖",
      skills,
      skillIds,
      trigger: draft.trigger === "SCHEDULE" ? "SCHEDULE" : "MANUAL",
      frequency: (["HOURLY", "DAILY", "WEEKLY"].includes(draft.frequency) ? draft.frequency : "WEEKLY") as AgentBuilderDraft["frequency"],
      runHour: clampHour(draft.runHour),
      runWeekday: clampWeekday(draft.runWeekday),
      scopeType: scopeType as AgentBuilderDraft["scopeType"],
      partnerId: scopeType === "PARTNER" ? draft.partnerId : "",
      shared: draft.shared !== false,
      webhookUrl: draft.webhookUrl || "",
      missingSkillNotes: Array.isArray(draft.missingSkillNotes) ? draft.missingSkillNotes : [],
      questionnaire: Array.isArray(draft.questionnaire) ? draft.questionnaire : [],
      rationale: draft.rationale || "",
    },
  };
  emitTextChunks(opts.emit, turn.reply);
  return turn;
}
