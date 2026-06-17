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
  newSkillContext,
  runSkill,
  skillsToTools,
} from "@/lib/skills";

async function resolveQueryTools() {
  return skillsToTools(ASSISTANT_SKILLS);
}

async function runQueryAssistant(
  messages: IntakeMessage[],
  uid: string,
  emit?: Parameters<typeof runToolLoop>[0]["emit"]
) {
  const system = `You are the AI assistant for the Fanruan Middle East Partner Management System, helping Fanruan Software (Fanruan, a leading BI vendor in China) Middle East BD team manage partners.
Today is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}.
You can use tools to query and modify system data, search the public web, read KMS internal documents when a token is configured (read_kms), or search the team knowledge base (search_knowledge). Rules:
1. Reply in English, concisely and action-oriented.
2. For queries: use tools to fetch real data before answering — do not invent facts.
3. For modification commands (advance stage, update fields, create todos): execute directly and clearly state what changed. If the instruction is ambiguous, query to confirm the target first.
4. For cross-partner comparisons: fetch both profiles via tools and give evidence-based recommendations.
5. If the user pastes a KMS link and asks to onboard / complete profile / extract partner info, the system switches to proposal mode automatically — you do not need to handle that here.
6. Context: Fanruan products FineReport (complex reporting) / FineBI (self-service analytics) / FineDataLink (data integration); Middle East differentiation is complex reporting plus data-sovereignty compliance (on-prem deployment); strategy materials include Tier A/B/C playbooks, first-three-deal subsidy (first deal +20% discount + 2 weeks free onsite), first-year super discount (L2 40% / L3 50% / L4 60%), Fast Track (Tableau/Microsoft migration partners with ≥5 certified staff go straight to L2).`;

  const tools = await resolveQueryTools();
  const chat: ChatMessage[] = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content, images: m.images }) as ChatMessage),
  ];
  const ctx = newSkillContext({ mode: "assistant", userId: uid });

  const content = await runToolLoop({
    chat,
    tools,
    feature: "Global AI Assistant",
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
    reply: content ?? "(Too many steps — stopped. Try breaking the question into smaller parts.)",
    actions: ctx.actions,
  };
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

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
    const msg = e instanceof AIError ? e.message : `Assistant error: ${e instanceof Error ? e.message : e}`;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
