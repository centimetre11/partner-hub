/**
 * 调试火山 Responses API 多轮 tool calling
 */
import { PrismaClient } from "@prisma/client";
import { chatCompletion, type ChatMessage } from "../src/lib/ai";
import { buildIntakeTools, intakeEnrichmentSkillsForScope, newSkillContext, runSkill } from "../src/lib/skills";

async function runTool(tc: { id: string; function: { name: string; arguments: string } }, userId: string) {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(tc.function.arguments || "{}");
  } catch {}
  const ctx = newSkillContext({ mode: "assistant", userId });
  return runSkill(tc.function.name, args, ctx);
}

async function main() {
  const prisma = new PrismaClient();
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("no user");

  const system = "你是测试助手。用户给 KMS 链接时调用 read_kms，然后简短回复。";
  const userMsg =
    "https://kms.fineres.com/pages/viewpage.action?pageId=1422019314，帮我把这个伙伴建档";

  const chat: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: userMsg },
  ];
  const tools = await buildIntakeTools(intakeEnrichmentSkillsForScope("new_partner"));

  for (let step = 0; step < 4; step++) {
    console.log(`\n=== step ${step} ===`);
    try {
      const { content, toolCalls } = await chatCompletion(chat, {
        tools,
        temperature: 0.3,
        feature: "debug-intake",
        userId: user.id,
      });
      console.log("content:", (content ?? "").slice(0, 120));
      console.log("toolCalls:", toolCalls.map((t) => t.function.name));
      if (!toolCalls.length) {
        console.log("DONE");
        break;
      }
      chat.push({ role: "assistant", content: content ?? "", tool_calls: toolCalls });
      for (const tc of toolCalls) {
        const result = await runTool(tc, user.id);
        console.log(tc.function.name, "->", result.slice(0, 100));
        chat.push({ role: "tool", content: result, tool_call_id: tc.id });
      }
    } catch (e) {
      console.error("FAIL at step", step, e instanceof Error ? e.message : e);
      console.log("chat roles:", chat.map((m) => `${m.role}${m.tool_calls?.length ? "+tools" : ""}`));
      process.exitCode = 1;
      break;
    }
  }
  await prisma.$disconnect();
}

main();
