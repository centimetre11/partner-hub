/**
 * 调试 runIntakeTurn 第一轮火山响应
 */
import { PrismaClient } from "@prisma/client";
import { db } from "../src/lib/db";
import { chatCompletion, type ChatMessage } from "../src/lib/ai";
import { buildIntakeTools, intakeEnrichmentSkillsForScope, newSkillContext, runSkill } from "../src/lib/skills";

async function main() {
  const prisma = new PrismaClient();
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("no user");

  const api = await db.aiApiConfig.findFirst({ where: { enabled: true }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  console.log("provider:", api?.provider, "model:", api?.model);

  const tools = await buildIntakeTools(intakeEnrichmentSkillsForScope("new_partner"));
  console.log("tools:", tools.map((t) => (t as { type?: string; name?: string; function?: { name?: string } }).name ?? (t as { function?: { name?: string } }).function?.name ?? (t as { type?: string }).type));

  const chat: ChatMessage[] = [
    { role: "system", content: "你是录入助手。用户给 KMS 链接时先 read_kms，再 web_search 补全，可多工具并行。" },
    { role: "user", content: "https://kms.fineres.com/pages/viewpage.action?pageId=1422019314，帮我把这个伙伴建档" },
  ];

  for (let step = 0; step < 3; step++) {
    console.log(`\n=== step ${step} ===`);
    try {
      const { content, toolCalls } = await chatCompletion(chat, {
        tools,
        temperature: 0.3,
        feature: "debug-intake-full",
        userId: user.id,
      });
      console.log("toolCalls:", toolCalls.map((t) => `${t.function.name}(${t.id})`));
      if (!toolCalls.length) {
        console.log("content:", (content ?? "").slice(0, 200));
        break;
      }
      chat.push({ role: "assistant", content: content ?? "", tool_calls: toolCalls });
      for (const tc of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {}
        const result = await runSkill(tc.function.name, args, newSkillContext({ mode: "assistant", userId: user.id }));
        console.log("result", tc.function.name, result.slice(0, 80));
        chat.push({ role: "tool", content: result, tool_call_id: tc.id });
      }
    } catch (e) {
      console.error("FAIL", e instanceof Error ? e.message : e);
      process.exitCode = 1;
      break;
    }
  }
  await prisma.$disconnect();
}

main();
