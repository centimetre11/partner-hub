/**
 * AI 建档端到端测试（含火山引擎 tool calling）
 * 用法: DATABASE_URL=file:/data/partner-hub.db npx tsx scripts/test-intake.ts
 */
import { PrismaClient } from "@prisma/client";
import { runIntakeTurn } from "../src/lib/ai-intake";

async function main() {
  const prisma = new PrismaClient();
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("无用户");

  const msg =
    "https://kms.fineres.com/pages/viewpage.action?pageId=1422019314，帮我把这个伙伴建档";

  console.log("用户:", user.email ?? user.name, user.id);
  console.log("输入:", msg);
  console.log("---");

  try {
    const turn = await runIntakeTurn({
      scope: "new_partner",
      messages: [{ role: "user", content: msg }],
      today: new Date().toISOString().slice(0, 10),
      userId: user.id,
      locale: "zh",
    });
    console.log("成功");
    console.log("reply:", turn.reply.slice(0, 300));
    console.log("ready:", turn.ready);
    console.log("partnerName:", turn.proposal.partnerName);
    console.log("fields:", turn.proposal.fields.length);
    console.log("contacts:", turn.proposal.contacts.length);
    if (turn.proposal.fields.length) {
      console.log("sample fields:", turn.proposal.fields.slice(0, 3).map((f) => `${f.label}=${f.newValue}`));
    }
  } catch (e) {
    console.error("失败:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    const fails = await prisma.aiTokenUsage.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { createdAt: true, feature: true, error: true },
    });
    if (fails.length) {
      console.log("\n最近 AI 失败记录:");
      for (const f of fails) console.log(f.createdAt.toISOString(), f.feature, f.error?.slice(0, 300));
    }
    await prisma.$disconnect();
  }
}

main();
