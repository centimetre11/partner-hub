import { revalidatePath } from "next/cache";
import type { ChatMessage } from "@/lib/ai";
import { runToolLoop } from "@/lib/ai-tool-loop";
import type { IntakeMessage } from "@/lib/ai-intake";
import {
  ASSISTANT_SKILLS,
  newSkillContext,
  runSkill,
  skillsToTools,
} from "@/lib/skills";
import { isKmsConfiguredForUser } from "@/lib/kms";

export type AssistantLocale = "en" | "zh";

function buildSystemPrompt(locale: AssistantLocale, kmsConfigured: boolean) {
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
      : "KMS 个人令牌未配置，不要调用 read_kms/write_kms；如需使用，请先在设置 → KMS 文档访问 中保存令牌。";
    return `你是帆软中东合作伙伴管理系统的 AI 助手，帮助帆软（中国领先 BI 厂商）中东 BD 团队管理合作伙伴。
今天是 ${today}。
你可以使用工具查询和修改系统数据、搜索公开网页、读取 KMS 内部文档、或搜索团队知识库。${kmsLine} 规则：
1. 用中文回复，简洁、可执行，直接给出查询结果。
2. 查询类问题：必须先调用工具获取真实数据再回答，禁止编造；禁止只回复「已收到」「当前时间是…」「需要我帮你做什么吗」等空话。
3. 问伙伴数量/列表：用 search_partners（status=ACTIVE 表示正式伙伴）；问待办：用 list_todos。
4. 修改指令（推进阶段、更新字段、创建待办）：直接执行并说明变更内容；指令不明确时先查询确认目标。
5. 跨伙伴对比：分别拉取档案后给出有依据的建议。
6. 若用户粘贴 KMS 链接并要求建档/补全档案/提取伙伴信息，系统会自动切换到提案模式，此处无需处理。
7. 背景：帆软产品 FineReport（复杂报表）/ FineBI（自助分析）/ FineDataLink（数据集成）；中东差异化是复杂报表 + 数据主权合规（私有化部署）；策略材料含 Tier A/B/C 打法、首三单补贴、首年超级折扣、Fast Track 等。`;
  }

  const kmsLine = kmsConfigured
    ? "Your KMS personal access token is configured — use read_kms to read and write_kms to write internal docs (edit permission required)."
    : "KMS personal access token is not configured — do not call read_kms/write_kms; save a token under Settings → KMS document access first.";
  return `You are the AI assistant for the Fanruan Middle East Partner Management System, helping Fanruan Software (Fanruan, a leading BI vendor in China) Middle East BD team manage partners.
Today is ${today}.
You can use tools to query and modify system data, search the public web, read KMS internal documents (read_kms), or search the team knowledge base (search_knowledge). ${kmsLine} Rules:
1. Reply in English, concisely and action-oriented.
2. For queries: use tools to fetch real data before answering — do not invent facts.
3. For modification commands (advance stage, update fields, create todos): execute directly and clearly state what changed. If the instruction is ambiguous, query to confirm the target first.
4. For cross-partner comparisons: fetch both profiles via tools and give evidence-based recommendations.
5. If the user pastes a KMS link and asks to onboard / complete profile / extract partner info, the system switches to proposal mode automatically — you do not need to handle that here.
6. Context: Fanruan products FineReport (complex reporting) / FineBI (self-service analytics) / FineDataLink (data integration); Middle East differentiation is complex reporting plus data-sovereignty compliance (on-prem deployment); strategy materials include Tier A/B/C playbooks, first-three-deal subsidy (first deal +20% discount + 2 weeks free onsite), first-year super discount (L2 40% / L3 50% / L4 60%), Fast Track (Tableau/Microsoft migration partners with ≥5 certified staff go straight to L2).`;
}

export async function runQueryAssistant(
  messages: IntakeMessage[],
  uid: string,
  options?: {
    locale?: AssistantLocale;
    feature?: string;
    emit?: Parameters<typeof runToolLoop>[0]["emit"];
  }
) {
  const locale = options?.locale ?? "en";
  const kmsConfigured = await isKmsConfiguredForUser(uid);
  const tools = await skillsToTools(ASSISTANT_SKILLS);
  const chat: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(locale, kmsConfigured) },
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
