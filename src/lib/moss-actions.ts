"use server";

import {
  fetchMossCompanyInsight,
  getMossConfigStatus,
  listMossTools,
  searchMossCompanies,
  testMossConnection,
} from "./moss";
import { requireUser } from "./session";

export async function getMossStatusAction() {
  await requireUser();
  return getMossConfigStatus();
}

export async function testMossConnectionAction() {
  await requireUser();
  try {
    const result = await testMossConnection();
    return {
      ok: true as const,
      message: `已连接 ${result.mcpUrl} · ${result.serverName}${result.serverVersion ? ` v${result.serverVersion}` : ""}，可用工具 ${result.toolCount} 个（令牌尾号 ${result.keyTail}）`,
      toolNames: result.toolNames,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listMossToolsAction() {
  await requireUser();
  try {
    const tools = await listMossTools();
    return { tools };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function searchMossCompaniesAction(input: { keyword: string }) {
  await requireUser();
  try {
    const result = await searchMossCompanies(input.keyword);
    const multi = result.hits.length > 1;
    return {
      hits: result.hits,
      text: result.text,
      hint: result.hits.length
        ? multi
          ? "匹配到多家企业，请选择正确主体后再查看画像（后续调用使用 credit_code）。"
          : undefined
        : result.text
          ? "已调用 Moss，但未解析到企业列表。下方展示原始返回，可换关键词重试。"
          : "未找到匹配企业，请调整关键词。",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchMossInsightAction(input: {
  creditCode?: string;
  companyName?: string;
}) {
  await requireUser();
  try {
    return await fetchMossCompanyInsight(input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
