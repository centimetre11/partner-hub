/**
 * 内置工具冒烟测试
 * 用法: npx tsx --env-file=.env scripts/test-tools.ts
 */
import { PrismaClient } from "@prisma/client";
import { runSkill, newSkillContext, SKILLS } from "../src/lib/skills";
import { isWebSearchAvailable } from "../src/lib/web-search";

const prisma = new PrismaClient();

function classify(tool: string, out: string, webSearchReady: boolean): "pass" | "skip" | "fail" {
  if (
    out.includes("未配置 KMS") ||
    out.includes("未配置支持联网搜索") ||
    out.includes("联网搜索的大模型")
  ) {
    if (tool === "read_kms") return process.env.KMS_TEST_TOKEN ? "fail" : "skip";
    return webSearchReady ? "fail" : "skip";
  }
  if (out.includes("未知工具") || out.includes("执行出错") || out.startsWith("搜索失败") || out.includes("Tool ") && out.includes(" failed:")) {
    return "fail";
  }
  if (tool === "push_wecom" && (out.includes("not registered") || out.includes("Please provide"))) return "skip";
  if (tool === "list_wecom_chats" && out.includes("No WeCom chats")) return "skip";
  if (tool === "send_email" && (out.includes("not configured") || out.includes("Please provide"))) return "skip";
  if (tool === "search_knowledge" && out.includes("未找到")) return "fail";
  if (tool === "read_kms" && out.includes("KMS 中未找到")) return "fail";
  if (tool === "search_partners" && out === "没有符合条件的伙伴") return "fail";
  if (tool === "get_partner" && out.startsWith("找不到")) return "fail";
  return "pass";
}

async function main() {
  const webSearchReady = await isWebSearchAvailable();
  const ctx = newSkillContext({ mode: "agent", userId: null, agentName: "tool-test" });

  if (process.env.KMS_TEST_TOKEN) {
    const user = await prisma.user.findFirst();
    if (user) {
      await prisma.userKmsCredential.upsert({
        where: { userId: user.id },
        create: { userId: user.id, accessToken: process.env.KMS_TEST_TOKEN, baseUrl: "https://kms.fineres.com" },
        update: { accessToken: process.env.KMS_TEST_TOKEN },
      });
      ctx.userId = user.id;
    }
  }

  const partner = await prisma.partner.findFirst({ where: { name: { contains: "Beinex" } } });
  const partnerName = partner?.name ?? (await prisma.partner.findFirst())?.name ?? "Beinex";

  const cases: [string, Record<string, unknown>][] = [
    ["search_partners", { tier: "A" }],
    ["get_partner", { name: partnerName }],
    ["list_todos", {}],
    ["search_knowledge", { query: "中东" }],
    ["linkedin_search", { company: "Beinex", person: "Shantosh Sridhar", maxResults: 3 }],
    ["web_search", { query: "Beinex Dubai analytics partner news", maxResults: 3, topic: "news" }],
    ["read_kms", { pageId: "1420741418" }],
    ["list_wecom_chats", {}],
  ];

  const results: { tool: string; status: string; preview: string }[] = [];

  for (const [tool, args] of cases) {
    if (!SKILLS.some((s) => s.name === tool)) {
      results.push({ tool, status: "fail", preview: "未注册" });
      continue;
    }
    const out = await runSkill(tool, args, ctx);
    results.push({
      tool,
      status: classify(tool, out, webSearchReady),
      preview: out.slice(0, 240).replace(/\s+/g, " "),
    });
  }

  // 写操作测试（会清理）
  const todoTitle = `[tool-test] ${Date.now()}`;
  const todoOut = await runSkill("create_todo", { title: todoTitle, priority: "LOW" }, ctx);
  const todoOk = todoOut.includes("已创建待办");
  if (todoOk) {
    await prisma.todoItem.deleteMany({ where: { title: todoTitle } });
  }
  results.push({ tool: "create_todo", status: todoOk ? "pass" : "fail", preview: todoOut });

  const timelineOut = await runSkill(
    "add_timeline_event",
    { partnerName, title: "[tool-test] 可删除", content: "自动化测试" },
    ctx
  );
  const timelineOk = timelineOut.includes("已写入");
  if (timelineOk && partner) {
    await prisma.timelineEvent.deleteMany({ where: { partnerId: partner.id, title: "[tool-test] 可删除" } });
  }
  results.push({ tool: "add_timeline_event", status: timelineOk ? "pass" : "fail", preview: timelineOut });

  const wecomChat = await prisma.wecomChat.findFirst();
  if (wecomChat) {
    const pushOut = await runSkill("push_wecom", { chatId: wecomChat.chatId, content: "[tool-test] push" }, ctx);
    const pushOk = pushOut.includes("queued");
    if (pushOk) {
      await prisma.wecomPushJob.deleteMany({ where: { chatId: wecomChat.chatId, content: "[tool-test] push" } });
    }
    results.push({ tool: "push_wecom", status: pushOk ? "pass" : "fail", preview: pushOut });
  } else {
    results.push({ tool: "push_wecom", status: "skip", preview: "No WecomChat row — skip" });
  }

  const emailConfigured = await import("../src/lib/email-config").then((m) => m.isEmailServiceConfigured());
  if (emailConfigured && process.env.EMAIL_TEST_TO) {
    const mailOut = await runSkill(
      "send_email",
      { to: process.env.EMAIL_TEST_TO, subject: "[tool-test] send_email", body: "Automated tool test" },
      ctx,
    );
    results.push({ tool: "send_email", status: mailOut.includes("Email sent") ? "pass" : "fail", preview: mailOut });
  } else {
    results.push({
      tool: "send_email",
      status: "skip",
      preview: emailConfigured ? "Set EMAIL_TEST_TO to run live send" : "Email service not configured — skip",
    });
  }

  const summary = {
    webSearchConfigured: webSearchReady,
    registeredTools: SKILLS.map((s) => s.name),
    removedTools: ["fetch_url"],
    results,
    pass: results.filter((r) => r.status === "pass").length,
    skip: results.filter((r) => r.status === "skip").length,
    fail: results.filter((r) => r.status === "fail").length,
  };

  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
  if (summary.fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
