import { PrismaClient } from "@prisma/client";
import { runQueryAssistant } from "../src/lib/assistant-core";

(async () => {
  const db = new PrismaClient();
  const question = process.argv[2] ?? "总共有多少正式伙伴";
  const user = await db.user.findFirst({ where: { role: "ADMIN" } });
  if (!user) throw new Error("no admin user");
  const result = await runQueryAssistant([{ role: "user", content: question }], user.id, {
    locale: "zh",
    feature: "WeCom Bot Test",
  });
  console.log("--- REPLY ---");
  console.log(result.reply);
  console.log("--- ACTIONS ---");
  console.log(result.actions);
  await db.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
