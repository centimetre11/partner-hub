import type { IntakeScope } from "./ai-locale";
import { stripIntakeSystemHint } from "./intake-text";
import { stripWecomCommandPrefix } from "./wecom-user-resolve";

/** Routable builtin actions — single source of truth for intent / scope classification. */
export type BuiltinActionRoute =
  | { mode: "propose"; scope: IntakeScope }
  | { mode: "query"; queryKind: "list_todos" | "general" }
  | { mode: "agent_builder" };

export type BuiltinActionDef = {
  id: string;
  route: BuiltinActionRoute;
  label: { zh: string; en: string };
  description: { zh: string; en: string };
  signals: RegExp[];
  priority: number;
};

/** User asks to list/count todos — not create */
const TODO_QUERY_RE =
  /看看.{0,10}待办|看一下.{0,10}待办|查.{0,8}待办|查询.{0,6}待办|列出.{0,6}待办|现在.{0,8}多少.{0,8}待办|当前.{0,8}待办|有多少.{0,8}待办|有几.{0,8}待办|待办.{0,12}(有哪些|有什么|多少|几个|数量|总数|几条|列表|清单|\bopen\b|\ball\b)|(有哪些|有什么|多少|几个|列出|查询|显示|展示).{0,16}待办|^(看看|看一下|查|查询|列出|显示|展示).{0,20}待办|\b(list|show|what|open|view|how many).{0,16}todos?\b|\btodos?\b.{0,16}(list|show|what|open|view)/i;

const TODO_CREATE_VERB_RE =
  /建.{0,4}待办|创建待办|新.{0,2}待办|录入待办|加.{0,2}待办|帮.{0,12}(?:建|创|加|记|写|添).{0,6}待办|添加待办|记.{0,4}待办|\b(create|add|log|new)\s+todos?\b|待办[：:，]|^事项[是：:]|^the item is\b/i;

export function normalizeActionText(text: string): string {
  return stripWecomCommandPrefix(stripIntakeSystemHint(text)).trim();
}

export function isTodoQueryPhrase(text: string): boolean {
  const t = normalizeActionText(text);
  if (!/待办|todos?\b/i.test(t)) return false;
  return TODO_QUERY_RE.test(t) && !TODO_CREATE_VERB_RE.test(t);
}

export const BUILTIN_ACTIONS: BuiltinActionDef[] = [
  {
    id: "intake.business_record",
    route: { mode: "propose", scope: "business_record" },
    label: { zh: "商务记录", en: "Business record" },
    description: {
      zh: "记录拜访、会议、跟进、商务进展",
      en: "Log visits, meetings, follow-ups, business progress",
    },
    signals: [
      /商务记录|拜访记录|会议纪要|跟进记录|见面|记录拜访|记录会议|记.{0,4}商务|business record|meeting log|visit log|log.{0,6}visit/i,
    ],
    priority: 90,
  },
  {
    id: "query.list_todos",
    route: { mode: "query", queryKind: "list_todos" },
    label: { zh: "查询待办", en: "List todos" },
    description: {
      zh: "查看/统计已有 open 待办（如「现在多少待办」「有哪些待办」），不是新建",
      en: "List or count existing open todos, not creating new ones",
    },
    signals: [
      /看看.{0,10}待办|看一下.{0,10}待办|查.{0,8}待办|查询.{0,6}待办|列出.{0,6}待办/i,
      /现在.{0,8}多少.{0,8}待办|当前.{0,8}待办|有多少.{0,8}待办|有几.{0,8}待办/i,
      /待办.{0,16}(有哪些|有什么|多少|几个|数量|总数|几条|列表|清单|\bopen\b|\ball\b)/i,
      /(有哪些|有什么|多少|几个|列出|查询|显示|展示).{0,16}待办/i,
      /^(看看|看一下|查|查询|列出|显示|展示).{0,20}待办/i,
      /\b(list|show|what|open|view|how many).{0,16}todos?\b/i,
      /\btodos?\b.{0,16}(list|show|what|open|view)/i,
    ],
    priority: 88,
  },
  {
    id: "intake.todo",
    route: { mode: "propose", scope: "todo" },
    label: { zh: "创建待办", en: "Create todo" },
    description: {
      zh: "新建或补充一条待办/跟进任务；描述里可含后续动作（如了解 poc、安排会议）",
      en: "Create or fill in a todo/follow-up; description may include follow-up steps",
    },
    signals: [
      /建.{0,4}待办|创建待办|新.{0,2}待办|录入待办/i,
      /加.{0,2}待办|帮.{0,12}(?:建|创|加|记|写|添).{0,6}待办|添加待办|记.{0,4}待办/i,
      /\b(create|add|log|new)\s+todos?\b/i,
      /待办[：:，]/,
      /^事项[是：:]|^the item is\b/i,
    ],
    priority: 85,
  },
  {
    id: "intake.opportunity",
    route: { mode: "propose", scope: "opportunity" },
    label: { zh: "添加商机", en: "Add opportunity" },
    description: { zh: "新建或更新商机", en: "Add or update sales opportunity" },
    signals: [/商机|添加商机|新建商机|opportunity|pipeline/i],
    priority: 80,
  },
  {
    id: "intake.powermap",
    route: { mode: "propose", scope: "powermap" },
    label: { zh: "添加联系人", en: "Add contact" },
    description: { zh: "权力地图/联系人/名片", en: "Power map, contacts, business cards" },
    signals: [/联系人|权力地图|加联系人|添加联系人|新联系人|contact|power map|名片|CTO|CEO/i],
    priority: 80,
  },
  {
    id: "intake.training",
    route: { mode: "propose", scope: "training" },
    label: { zh: "培训计划", en: "Training plan" },
    description: { zh: "培训或认证计划", en: "Training or certification plan" },
    signals: [/培训|认证|FCA|training plan/i],
    priority: 70,
  },
  {
    id: "intake.solution",
    route: { mode: "propose", scope: "solution" },
    label: { zh: "联合方案", en: "Joint solution" },
    description: { zh: "联合方案/合作方案", en: "Joint solution proposal" },
    signals: [/联合方案|solution/i],
    priority: 70,
  },
  {
    id: "intake.new_partner",
    route: { mode: "propose", scope: "new_partner" },
    label: { zh: "新建伙伴", en: "New partner" },
    description: { zh: "全新公司建档/onboard", en: "Onboard a brand-new partner company" },
    signals: [/建档|创建伙伴|录入伙伴|新公司|onboard|create partner|new partner|kms\.fineres/i],
    priority: 65,
  },
  {
    id: "intake.profile",
    route: { mode: "propose", scope: "profile" },
    label: { zh: "补全画像", en: "Enrich profile" },
    description: {
      zh: "补全已有伙伴档案字段（行业、阶段、简介等）",
      en: "Enrich existing partner profile fields",
    },
    signals: [/补全|画像|profile|enrich.{0,8}profile|complete.{0,8}profile|丰富.{0,4}档案|完善.{0,4}画像/i],
    priority: 50,
  },
];

export type ActionScore = { action: BuiltinActionDef; score: number };

const SCORE_THRESHOLD = 8;

export function scoreBuiltinActions(text: string): ActionScore[] {
  const t = normalizeActionText(text);
  if (!t) return [];

  const todoQuery = isTodoQueryPhrase(t);

  const scored = BUILTIN_ACTIONS.map((action) => {
    let score = 0;
    for (const re of action.signals) {
      if (re.test(t)) score += 10;
    }
    if (action.id === "intake.todo" && todoQuery) score = 0;
    if (action.id === "query.list_todos" && todoQuery) score += 15;
    if (score > 0) score += action.priority / 100;
    return { action, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.action.priority - a.action.priority);

  return scored;
}

export function topBuiltinAction(text: string): ActionScore | null {
  const ranked = scoreBuiltinActions(text);
  const top = ranked[0];
  if (!top || top.score < SCORE_THRESHOLD) return null;
  return top;
}

export function getAlternativeActions(text: string, excludeActionId: string, limit = 3): ActionScore[] {
  return scoreBuiltinActions(text)
    .filter((s) => s.action.id !== excludeActionId)
    .slice(0, limit);
}

export function actionCatalogForAi(locale: "zh" | "en"): string {
  return BUILTIN_ACTIONS.map((a) => {
    const label = locale === "zh" ? a.label.zh : a.label.en;
    const desc = locale === "zh" ? a.description.zh : a.description.en;
    const route =
      a.route.mode === "propose"
        ? `propose/${a.route.scope}`
        : a.route.mode === "query"
          ? `query/${a.route.queryKind}`
          : "agent_builder";
    return `- ${a.id} (${label}, ${route}): ${desc}`;
  }).join("\n");
}

export function actionExamplesForAi(locale: "zh" | "en"): string {
  if (locale === "zh") {
    return `Examples:
- 「现在多少待办」「有哪些待办」→ query.list_todos
- 「帮我建个待办…看看 poc」→ intake.todo
- 「记个待办：下周跟进」→ intake.todo
- 「补全 AkLogiks 画像」→ intake.profile`;
  }
  return `Examples:
- "how many open todos" / "list todos" → query.list_todos
- "create a todo to follow up with poc" → intake.todo
- "log a todo: follow up next week" → intake.todo
- "enrich AkLogiks profile" → intake.profile`;
}

export function builtinActionById(id: string): BuiltinActionDef | undefined {
  return BUILTIN_ACTIONS.find((a) => a.id === id);
}

export function scopeFromActionId(id: string): IntakeScope | undefined {
  const action = builtinActionById(id);
  if (action?.route.mode === "propose") return action.route.scope;
  return undefined;
}

export function isListTodosAction(text: string): boolean {
  const top = topBuiltinAction(text);
  return top?.action.id === "query.list_todos";
}

export function isProposeBuiltinAction(text: string): boolean {
  const top = topBuiltinAction(text);
  return top?.action.route.mode === "propose";
}

export function isQueryBuiltinAction(text: string): boolean {
  const top = topBuiltinAction(text);
  return top?.action.route.mode === "query";
}

export function conversationTopAction(text: string): ActionScore | null {
  return topBuiltinAction(text);
}
