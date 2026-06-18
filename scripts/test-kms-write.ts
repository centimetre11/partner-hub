/**
 * write_kms 工具测试
 * 用法:
 *   npx tsx --env-file=.env scripts/test-kms-write.ts
 *   KMS_TEST_PAGE_ID=1096817035 npx tsx --env-file=.env scripts/test-kms-write.ts
 *
 * Token 来源（按优先级）:
 *   1. 环境变量 KMS_TEST_TOKEN
 *   2. 数据库 UserKmsCredential（第一个用户）
 */
import { PrismaClient } from "@prisma/client";
import {
  fetchKmsPageById,
  updateKmsPage,
  writeKmsForUser,
  KMS_DEFAULT_BASE_URL,
} from "../src/lib/kms";
import { runSkill, newSkillContext } from "../src/lib/skills";

const prisma = new PrismaClient();
const PAGE_ID = process.env.KMS_TEST_PAGE_ID?.trim() || "1096817035";
const PAGE_URL = `https://kms.fineres.com/pages/viewpage.action?pageId=${PAGE_ID}`;
const TEST_MARKER = `[partner-hub write_kms test ${new Date().toISOString()}]`;

async function resolveTokenAndUser() {
  const envToken = process.env.KMS_TEST_TOKEN?.trim();
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("数据库中无用户");

  if (envToken) {
    await prisma.userKmsCredential.upsert({
      where: { userId: user.id },
      create: { userId: user.id, accessToken: envToken, baseUrl: KMS_DEFAULT_BASE_URL },
      update: { accessToken: envToken },
    });
    return { userId: user.id, token: envToken, source: "KMS_TEST_TOKEN" };
  }

  const cred = await prisma.userKmsCredential.findUnique({ where: { userId: user.id } });
  if (!cred?.accessToken) {
    throw new Error("未找到 KMS token：请设置 KMS_TEST_TOKEN 或在设置页保存令牌");
  }
  return { userId: user.id, token: cred.accessToken, source: "database" };
}

async function main() {
  const { userId, token, source } = await resolveTokenAndUser();
  console.log("Token 来源:", source);
  console.log("目标页面:", PAGE_URL);
  console.log("---");

  const before = await fetchKmsPageById({
    baseUrl: KMS_DEFAULT_BASE_URL,
    token,
    pageId: PAGE_ID,
  });
  console.log("写入前标题:", before.title);
  console.log("写入前正文预览:", before.plainText.slice(0, 200) || "(空)");
  console.log("---");

  const testContent = `${TEST_MARKER}\n\n- 由 partner-hub write_kms 工具自动测试\n- 可安全删除本段`;
  const updated = await updateKmsPage({
    baseUrl: KMS_DEFAULT_BASE_URL,
    token,
    pageId: PAGE_ID,
    content: testContent,
    mode: "append",
  });
  console.log("直接 API 写入成功:", updated.title);
  console.log("页面链接:", updated.webUrl);
  console.log("---");

  const after = await fetchKmsPageById({
    baseUrl: KMS_DEFAULT_BASE_URL,
    token,
    pageId: PAGE_ID,
  });
  const ok = after.plainText.includes(TEST_MARKER);
  console.log("回读验证:", ok ? "PASS — 测试标记已出现在页面正文中" : "FAIL — 未找到测试标记");
  if (!ok) {
    console.log("回读正文:", after.plainText.slice(0, 500));
    process.exitCode = 1;
  }
  console.log("---");

  const ctx = newSkillContext({ mode: "assistant", userId });
  const skillOut = await runSkill(
    "write_kms",
    {
      url: PAGE_URL,
      content: `${TEST_MARKER} (via runSkill)`,
      mode: "append",
    },
    ctx,
  );
  console.log("write_kms 技能输出:");
  console.log(skillOut);
  const skillOk = skillOut.includes("Updated KMS page") || skillOut.includes("Link:");
  console.log("技能调用:", skillOk ? "PASS" : "FAIL");
  if (!skillOk) process.exitCode = 1;

  const viaUserFn = await writeKmsForUser(userId, {
    pageId: PAGE_ID,
    content: `${TEST_MARKER} (via writeKmsForUser)`,
    mode: "append",
  });
  console.log("---");
  console.log("writeKmsForUser 输出:");
  console.log(viaUserFn);
}

main()
  .catch((e) => {
    console.error("测试失败:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
