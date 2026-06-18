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

export type AssistantLocale = "en" | "zh";

function buildSystemPrompt(locale: AssistantLocale) {
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
    return `你是帆软中东合作伙伴管理系统的 AI 助手，帮助帆软（中国领先 BI 厂商）中东 BD 团队管理合作伙伴。
今天是 ${today}。
你可以使用工具查询和修改系统数据、搜索公开网页、读取 KMS 内部文档（需配置 token）、或搜索团队知识库。规则：
1. 用中文回复，简洁、可执行。
2. 查询类问题：先用工具获取真实数据再回答，不要编造。
3. 修改指令（推进阶段、更新字段、创建待办）：直接执行并说明变更内容；指令不明确时先查询确认目标。
4. 跨伙伴对比：分别拉取档案后给出有依据的建议。
5. 若用户粘贴 KMS 链接并要求建档/补全档案/提取伙伴信息，系统会自动切换到提案模式，此处无需处理。
6. 背景：帆软产品 FineReport（复杂报表）/ FineBI（自助分析）/ FineDataLink（数据集成）；中东差异化是复杂报表 + 数据主权合规（私有化部署）；策略材料含 Tier A/B/C 打法、首三单补贴、首年超级折扣、Fast Track 等。`;
  }

  return `You are the AI assistant for the Fanruan Middle East Partner Management System, helping Fanruan Software (Fanruan, a leading BI vendor in China) Middle East BD team manage partners.
Today is ${today}.
You can use tools to query and modify system data, search the public web, read KMS internal documents when a token is configured (read_kms), or search the team knowledge base (search_knowledge). Rules:
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
  const tools = await skillsToTools(ASSISTANT_SKILLS);
  const chat: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(locale) },
    ...messages.map((m) => ({ role: m.role, content: m.content, images: m.images }) as ChatMessage),
  ];
  const ctx = newSkillContext({ mode: "assistant", userId: uid });

  const content = await runToolLoop({
    chat,
    tools,
    feature: options?.feature ?? "Global AI Assistant",
    userId: uid,
    maxSteps: 8,
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
