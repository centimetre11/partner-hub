/**
 * KMS API 连通性测试（不写入数据库）
 * 用法: KMS_TEST_TOKEN=xxx npx tsx scripts/test-kms.ts
 */
import { fetchKmsPageById, searchKmsPages, testKmsConnection } from "../src/lib/kms";

async function main() {
  const token = process.env.KMS_TEST_TOKEN?.trim();
  if (!token) {
    console.error("请设置环境变量 KMS_TEST_TOKEN");
    process.exit(1);
  }

  const test = await testKmsConnection({ token, testPageId: "1420741418" });
  console.log("testConnection:", test);

  const page = await fetchKmsPageById({ baseUrl: "https://kms.fineres.com", token, pageId: "1420741418" });
  console.log("pageTitle:", page.title);
  console.log("pagePreview:", page.plainText.slice(0, 300));

  const search = await searchKmsPages({ baseUrl: "https://kms.fineres.com", token, query: "个人令牌", limit: 2 });
  console.log(
    "searchHits:",
    search.map((p) => `${p.title} (${p.id})`)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
