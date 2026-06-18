import { PrismaClient } from "@prisma/client";
import { runIntakeTurn } from "../src/lib/ai-intake";

async function main() {
  const p = new PrismaClient();
  const user = await p.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("no user");
  try {
    const turn = await runIntakeTurn({
      scope: "new_partner",
      messages: [{ role: "user", content: "帮我把 Beinex 这家公司建档，迪拜的 BI 伙伴" }],
      today: new Date().toISOString().slice(0, 10),
      userId: user.id,
      locale: "zh",
    });
    console.log("ready:", turn.ready);
    console.log("partnerName:", turn.proposal.partnerName);
    console.log("fields:", turn.proposal.fields.length);
    console.log("contacts:", turn.proposal.contacts.length);
    console.log("reply:", turn.reply.slice(0, 200));
  } catch (e) {
    console.error("FAIL:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
}

main();
