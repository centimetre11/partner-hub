import { revalidatePath } from "@/lib/safe-revalidate";
import type { ChatMessage } from "@/lib/ai";
import { runToolLoop } from "@/lib/ai-tool-loop";
import type { IntakeMessage } from "@/lib/ai-intake";
import {
  ASSISTANT_SKILLS,
  newSkillContext,
  runSkill,
  skillsToTools,
} from "@/lib/skills";
import { isSelfTodoQueryPhrase, normalizeActionText } from "@/lib/intake-action-registry";
import { isKmsConfiguredForUser } from "@/lib/kms";
import { isKnowhowConfigured } from "@/lib/knowhow";

export type AssistantLocale = "en" | "zh";

function buildSystemPrompt(locale: AssistantLocale, kmsConfigured: boolean, knowhowConfigured: boolean) {
  const today =
    locale === "zh"
      ? new Date().toLocaleDateString("zh-CN", {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "long",
        })
      : new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "long",
        });

  if (locale === "zh") {
    const kmsLine = kmsConfigured
      ? "KMS 个人令牌已配置，可用 read_kms 读取、write_kms 写入内部文档（需页面编辑权限）。"
      : "KMS 个人令牌未配置，不要调用 read_kms/write_kms；可在个人中心配置个人令牌，或使用团队回退。";
    const knowhowLine = knowhowConfigured
      ? "Know-how 检索已配置，可用 search_knowhow 检索帆软 Know-how 知识库（案例、方案、宣传物料等）。"
      : "Know-how 检索未配置，不要调用 search_knowhow；请团队管理员在团队设置中配置 API 令牌。";
    return `你是帆软中东合作伙伴管理系统的 AI 助手，帮助帆软（中国领先 BI 厂商）中东 BD 团队管理合作伙伴。
今天是 ${today}。
你可以使用工具查询和修改系统数据、搜索公开网页、读取 KMS 内部文档、搜索团队知识库、或检索 Know-how 知识库。${kmsLine} ${knowhowLine} 规则：
1. 用中文回复，简洁、可执行，直接给出查询结果。
2. 查询类问题：必须先调用工具获取真实数据再回答，禁止编造；禁止只回复「已收到」「当前时间是…」「需要我帮你做什么吗」等空话。
3. 问伙伴数量/列表：用 search_partners（status=ACTIVE 表示正式伙伴）；问客户/终端客户：用 search_customers；读客户档案/联系人/商机/合同/项目：用 get_customer（不是 get_partner）；问待办：用 list_todos（客户传 customerName/customerId，伙伴传 partnerName/partnerId，某人待办传 assigneeName）；问商机：用 list_opportunities（同上，可按 dealType 过滤：PROJECT=有交付项目/PRODUCT=纯产品）；问合作项目/交付进度：用 list_projects（按客户或交付伙伴过滤，返回阶段与待办进度）；问商务记录：用 list_business_records（同上）。客户合同在 get_customer 的 [合同]/[Contracts] 段：买断可含产品维保（首年打包、次年单独 PRODUCT_MAINTENANCE）；项目合同可含项目维保（首年含、次年单独 PROJECT_MAINTENANCE）——二者不同；订阅无此逻辑。
4. 修改指令（推进阶段、更新字段、创建待办、写时间线）：直接执行并说明变更内容；指令不明确时先查询确认目标。更新伙伴档案用 update_partner；更新客户档案用 update_customer；创建待办用 create_todo（客户传 customerName/customerId，伙伴传 partnerName/partnerId；要挂到某商机/项目时先用 list_opportunities/list_projects 拿 id，再传 opportunityId/projectId）；标记商机成交类型用 update_opportunity 的 dealType；写时间线用 add_timeline_event（客户或伙伴二选一，客户传 customerName/customerId）。
5. 跨伙伴对比：分别拉取档案后给出有依据的建议。
6. 若用户粘贴 KMS 链接并要求建档/补全档案/提取伙伴信息，系统会自动切换到提案模式，此处无需处理。
7. 背景：帆软产品 FineReport（复杂报表）/ FineBI（自助分析）/ FineDataLink（数据集成）；中东差异化是复杂报表 + 数据主权合规（私有化部署）；策略材料含 Tier A/B/C 打法、首三单补贴、首年超级折扣、Fast Track 等。`;
  }

  const kmsLine = kmsConfigured
    ? "Your KMS personal access token is configured — use read_kms to read and write_kms to write internal docs (edit permission required)."
    : "KMS personal access token is not configured — do not call read_kms/write_kms; save one under Account or use team fallback.";
  const knowhowLine = knowhowConfigured
    ? "Know-how search is configured — use search_knowhow to retrieve cases, solutions, and collateral from the Fanruan Know-how knowledge base."
    : "Know-how search is not configured — do not call search_knowhow; ask a team admin to set the API token in Team Settings.";
  return `You are the AI assistant for the Fanruan Middle East Partner Management System, helping Fanruan Software (Fanruan, a leading BI vendor in China) Middle East BD team manage partners.
Today is ${today}.
You can use tools to query and modify system data, search the public web, read KMS internal documents (read_kms), search the team knowledge base (search_knowledge), or search the Know-how knowledge base (search_knowhow). ${kmsLine} ${knowhowLine} Rules:
1. Reply in English, concisely and action-oriented.
2. For queries: use tools to fetch real data before answering — do not invent facts.
3. Partner counts/lists: search_partners (status=ACTIVE = formal partners); end-customers: search_customers; customer profile/contacts/opportunities/contracts/projects: get_customer (not get_partner); todos: list_todos (customerName/customerId for customers, partnerName/partnerId for partners, assigneeName for a person's todos); opportunities: list_opportunities (same; filter by dealType: PROJECT=has delivery project / PRODUCT=product-only); delivery/collaboration projects & progress: list_projects (filter by customer or delivery partner, returns phase and todo progress); business records: list_business_records (same). Customer contracts appear in get_customer under [Contracts]: buyouts may include product maintenance (Y1 bundled, Y2+ PRODUCT_MAINTENANCE); project contracts may include project maintenance (Y1 included, Y2+ PROJECT_MAINTENANCE) — these are distinct; not used for subscriptions.
4. For modification commands (advance stage, update fields, create todos, timeline events): execute directly and state what changed; query first if the target is ambiguous. update_partner for partners; update_customer for end-customers; create_todo with customerName/customerId or partnerName/partnerId (to attach to a specific deal/project, first get the id via list_opportunities/list_projects, then pass opportunityId/projectId); set a deal's dealType via update_opportunity; add_timeline_event with customer or partner (customerName/customerId or partnerName/partnerId).
5. For cross-partner comparisons: fetch both profiles via tools and give evidence-based recommendations.
6. If the user pastes a KMS link and asks to onboard / complete profile / extract partner info, the system switches to proposal mode automatically — you do not need to handle that here.
7. Context: Fanruan products FineReport (complex reporting) / FineBI (self-service analytics) / FineDataLink (data integration); Middle East differentiation is complex reporting plus data-sovereignty compliance (on-prem deployment); strategy materials include Tier A/B/C playbooks, first-three-deal subsidy (first deal +20% discount + 2 weeks free onsite), first-year super discount (L2 40% / L3 50% / L4 60%), Fast Track (Tableau/Microsoft migration partners with ≥5 certified staff go straight to L2).`;
}

function formatSelfTodosReply(raw: string, locale: AssistantLocale, displayName?: string): string {
  const who = displayName?.trim();
  if (raw === "No open todos") {
    return locale === "zh"
      ? who
        ? `${who}，您当前没有进行中的待办。`
        : "您当前没有进行中的待办。"
      : who
        ? `${who}, you have no open todos.`
        : "You have no open todos.";
  }
  const lines = raw.split("\n").filter(Boolean);
  if (locale === "zh") {
    const head = who
      ? `${who}，您当前有 ${lines.length} 条 open 待办：`
      : `您当前有 ${lines.length} 条 open 待办：`;
    return `${head}\n\n${lines.join("\n")}`;
  }
  const head = who ? `${who}, you have ${lines.length} open todo(s):` : `You have ${lines.length} open todo(s):`;
  return `${head}\n\n${lines.join("\n")}`;
}

/** Deterministic「我的待办」query — uses current Hub userId, no LLM round-trip. */
export async function trySelfTodoListQuery(
  messages: IntakeMessage[],
  userId: string,
  options?: {
    locale?: AssistantLocale;
    actorDisplayName?: string;
    partnerId?: string;
    partnerName?: string;
    customerId?: string;
    customerName?: string;
  },
): Promise<{ reply: string; actions: string[] } | null> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  if (!isSelfTodoQueryPhrase(normalizeActionText(lastUser))) return null;

  const args: Record<string, unknown> = { assigneeUserId: userId };
  if (options?.customerId) args.customerId = options.customerId;
  else if (options?.customerName) args.customerName = options.customerName;
  else if (options?.partnerId) args.partnerId = options.partnerId;
  else if (options?.partnerName) args.partnerName = options.partnerName;

  const ctx = newSkillContext({ mode: "assistant", userId });
  const raw = await runSkill("list_todos", args, ctx);
  const locale = options?.locale ?? "zh";
  return {
    reply: formatSelfTodosReply(raw, locale, options?.actorDisplayName),
    actions: ctx.actions,
  };
}

export async function runQueryAssistant(
  messages: IntakeMessage[],
  uid: string,
  options?: {
    locale?: AssistantLocale;
    feature?: string;
    emit?: Parameters<typeof runToolLoop>[0]["emit"];
    queryKind?: "list_todos" | "list_opportunities" | "list_business_records" | "general";
    customerId?: string;
    customerName?: string;
    partnerId?: string;
    partnerName?: string;
    actorDisplayName?: string;
  }
) {
  const locale = options?.locale ?? "en";
  const kmsConfigured = await isKmsConfiguredForUser(uid);
  const knowhowConfigured = await isKnowhowConfigured();
  const tools = await skillsToTools(ASSISTANT_SKILLS);
  let systemContent = buildSystemPrompt(locale, kmsConfigured, knowhowConfigured);
  const kindHint =
    options?.queryKind === "list_todos"
      ? locale === "zh"
        ? `\n\n本轮用户要查待办：必须先调用 list_todos，回复中保留每条 [id:…] 前缀。${
            options?.customerId || options?.customerName
              ? `当前会话绑定客户${options.customerName ? `「${options.customerName}」` : ""}${options.customerId ? `（customerId=${options.customerId}）` : ""}，list_todos 必须传 customerName 或 customerId，禁止用 partnerName。`
              : options?.partnerId || options?.partnerName
                ? `当前会话绑定伙伴${options.partnerName ? `「${options.partnerName}」` : ""}，可按 partnerName/partnerId 过滤。`
                : "用户提到「客户」时传 customerName（可先 search_customers 查名）；提到「伙伴」时传 partnerName。问某人的待办（如 jackie的待办）传 assigneeName，禁止把人名当 partnerName。"
          }${
            options?.actorDisplayName
              ? `\n当前操作人 Hub 姓名是「${options.actorDisplayName}」。用户说「我的待办/我有哪些待办」时，list_todos 必须传 assigneeUserId 或 assigneeName="${options.actorDisplayName}"，禁止向用户索要姓名。`
              : ""
          }`
        : `\n\nUser wants todos: call list_todos first; keep [id:…] prefixes.${
            options?.customerId || options?.customerName
              ? ` Bound customer${options.customerName ? ` "${options.customerName}"` : ""}${options.customerId ? ` (customerId=${options.customerId})` : ""} — pass customerName or customerId to list_todos, not partnerName.`
              : " Use customerName for customer/account todos and partnerName for partner todos. For a person's todos (e.g. jackie's todos), pass assigneeName — never partnerName for a person."
          }`
      : options?.queryKind === "list_opportunities"
        ? locale === "zh"
          ? `\n\n本轮用户要查商机：必须先调用 list_opportunities，回复中保留每条 [id:…] 前缀。${
              options?.customerId || options?.customerName
                ? `当前绑定客户${options.customerName ? `「${options.customerName}」` : ""}，必须传 customerName 或 customerId，禁止用 partnerName。`
                : "用户提到「客户」时传 customerName；提到「伙伴」时传 partnerName。"
            }`
          : `\n\nUser wants opportunities: call list_opportunities first; keep [id:…] prefixes.${
              options?.customerId || options?.customerName
                ? ` Bound customer — pass customerName or customerId, not partnerName.`
                : " Use customerName for customer opportunities and partnerName for partner opportunities."
            }`
        : options?.queryKind === "list_business_records"
          ? locale === "zh"
            ? `\n\n本轮用户要查商务记录：必须先调用 list_business_records，回复中保留每条 [id:…] 前缀。${
                options?.customerId || options?.customerName
                  ? `当前绑定客户${options.customerName ? `「${options.customerName}」` : ""}，必须传 customerName 或 customerId，禁止用 partnerName。`
                  : "用户提到「客户」时传 customerName；提到「伙伴」时传 partnerName。"
              }`
            : `\n\nUser wants business records: call list_business_records first; keep [id:…] prefixes.${
                options?.customerId || options?.customerName
                  ? ` Bound customer — pass customerName or customerId, not partnerName.`
                  : " Use customerName for customer records and partnerName for partner records."
              }`
          : "";
  systemContent += kindHint;
  const chat: ChatMessage[] = [
    { role: "system", content: systemContent },
    ...messages.map((m) => ({ role: m.role, content: m.content, images: m.images }) as ChatMessage),
  ];
  const ctx = newSkillContext({ mode: "assistant", userId: uid });

  const feature = options?.feature ?? "Global AI Assistant";
  const requireToolsOnFirstTurn = feature === "WeCom Bot";

  const content = await runToolLoop({
    chat,
    tools,
    feature,
    userId: uid,
    maxSteps: 8,
    requireToolsOnFirstTurn,
    emit: options?.emit,
    executeTool: async (tc) => {
      if (tc.function.name === "$web_search") return tc.function.arguments;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        /* ignore */
      }
      return runSkill(tc.function.name, args, ctx);
    },
  });

  if (ctx.actions.length) {
    revalidatePath("/");
    revalidatePath("/partners");
    revalidatePath("/todos");
  }

  const fallback =
    locale === "zh"
      ? "（步骤过多已停止，请把问题拆小后再试。）"
      : "(Too many steps — stopped. Try breaking the question into smaller parts.)";

  return {
    mode: "query" as const,
    reply: content ?? fallback,
    actions: ctx.actions,
  };
}
