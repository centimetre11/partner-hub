import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUserId } from "@/lib/session";
import { AIError, type ChatMessage, type ToolDef } from "@/lib/ai";
import { createSseResponse } from "@/lib/ai-trace";
import { runToolLoop } from "@/lib/ai-tool-loop";
import {
  runProposeTurn,
  shouldUseProposeMode,
  type IntakeMessage,
} from "@/lib/ai-intake";
import {
  ASSISTANT_SKILLS,
  KIMI_BUILTIN_SEARCH,
  newSkillContext,
  runSkill,
  shouldUseKimiBuiltinSearch,
  shouldUseVolcengineBuiltinSearch,
  skillsToTools,
} from "@/lib/skills";

async function resolveQueryTools() {
  const volcSearch = await shouldUseVolcengineBuiltinSearch();
  const assistantSkills = volcSearch ? ASSISTANT_SKILLS.filter((s) => s !== "web_search") : ASSISTANT_SKILLS;
  const tools: (ToolDef | Record<string, unknown>)[] = skillsToTools(assistantSkills);
  if (await shouldUseKimiBuiltinSearch()) tools.push(KIMI_BUILTIN_SEARCH);
  return tools;
}

async function runQueryAssistant(
  messages: IntakeMessage[],
  uid: string,
  emit?: Parameters<typeof runToolLoop>[0]["emit"]
) {
  const system = `你是「帆软中东伙伴管理系统」的 AI 助手，帮助帆软软件（Fanruan，中国领先BI厂商）中东区 BD 团队管理合作伙伴。
今天是 ${new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}。
你可以用工具查询和修改系统数据，也可以联网搜索公开信息，或在已配置令牌时读取 KMS 内部文档（read_kms），也可检索团队知识库（search_knowledge）。规则：
1. 回答用中文，简洁、面向行动。
2. 查询类问题：先用工具拿到真实数据再回答，不要凭空编造。
3. 修改类指令（推进阶段、改字段、建待办）：直接执行并明确告知做了什么修改。修改前如果指令含糊，先查询确认对象再执行。
4. 跨伙伴对比分析：调工具获取双方档案后给出有理有据的建议。
5. 若用户贴 KMS 链接并要求「建档/补全画像/提炼伙伴信息」，系统会自动切换为提案模式；你无需在此模式下处理。
6. 背景：帆软产品 FineReport（中国式复杂报表）/ FineBI（自助分析）/ FineDataLink（数据集成）；中东主打差异化是复杂报表能力+数据主权合规（纯内网部署）；策略材料包括 Tier A/B/C 作战清单、前三单补贴（首单+20%折扣+免费驻场2周）、首年超级折扣（L2 40%/L3 50%/L4 60%）、Fast Track（Tableau/微软转投伙伴≥5人认证直接L2）。`;

  const tools = await resolveQueryTools();
  const chat: ChatMessage[] = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
  ];
  const ctx = newSkillContext({ mode: "assistant", userId: uid });

  const content = await runToolLoop({
    chat,
    tools,
    feature: "全局 AI 助手",
    userId: uid,
    maxSteps: 8,
    emit,
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

  return {
    mode: "query" as const,
    reply: content ?? "（处理步骤过多，已中止。请把问题拆小一点再试。）",
    actions: ctx.actions,
  };
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = (await req.json()) as {
    messages: IntakeMessage[];
    stream?: boolean;
    partnerId?: string;
    forcePropose?: boolean;
  };
  const { messages, stream, partnerId, forcePropose } = body;

  const usePropose = forcePropose || shouldUseProposeMode(messages);

  try {
    if (stream) {
      return createSseResponse(async (emit) => {
        const result = usePropose
          ? await runProposeTurn({ messages, partnerId, userId: uid, emit })
          : await runQueryAssistant(messages, uid, emit);
        emit({ event: "done", data: result });
      });
    }
    const result = usePropose
      ? await runProposeTurn({ messages, partnerId, userId: uid })
      : await runQueryAssistant(messages, uid);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof AIError ? e.message : `助手出错：${e instanceof Error ? e.message : e}`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
