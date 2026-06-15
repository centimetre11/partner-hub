/** 模型内置联网搜索能力探测（独立模块，避免 skills ↔ sentiment-monitor 循环依赖） */

import { db } from "./db";
import { hasWebSearchKey } from "./web-search";

// Kimi（moonshot）平台的内置联网搜索：作为特殊工具注入，工具被调用时原样回传参数即可
export const KIMI_BUILTIN_SEARCH = {
  type: "builtin_function" as const,
  function: { name: "$web_search" },
};

export async function shouldUseVolcengineBuiltinSearch(): Promise<boolean> {
  if (hasWebSearchKey()) return false;
  const configured = await db.aiApiConfig.findFirst({
    where: { enabled: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { provider: true, extraConfig: true },
  });
  if (configured?.provider !== "volcengine") return false;
  try {
    const extra = JSON.parse(configured.extraConfig ?? "{}") as { tools?: Array<{ type?: string }> };
    return (extra.tools ?? []).some((t) => t.type === "web_search");
  } catch {
    return false;
  }
}

export async function shouldUseKimiBuiltinSearch(): Promise<boolean> {
  if (hasWebSearchKey()) return false;
  if (await shouldUseVolcengineBuiltinSearch()) return false;
  const configured = await db.aiApiConfig.findFirst({
    where: { enabled: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { baseUrl: true },
  });
  return ((configured?.baseUrl ?? process.env.AI_BASE_URL) ?? "").includes("moonshot");
}

export async function shouldUseBuiltinWebSearch(): Promise<boolean> {
  return (await shouldUseVolcengineBuiltinSearch()) || (await shouldUseKimiBuiltinSearch());
}
