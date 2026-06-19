"use server";

import { requireUser } from "./session";
import {
  getKnowhowDocument,
  retrieveKnowhow,
  type KnowhowMetadataFilter,
  type KnowhowSearchHit,
} from "./knowhow";

export type KnowhowSearchParams = {
  query: string;
  businessDomain?: "project" | "contract";
  tags?: string;
  quality?: string;
  nodePath?: string;
  industry?: string;
  topK?: number;
};

function splitCsv(raw: string | undefined) {
  return (raw ?? "")
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildFilters(params: KnowhowSearchParams): Record<string, KnowhowMetadataFilter> | undefined {
  const filters: Record<string, KnowhowMetadataFilter> = {};
  const tags = splitCsv(params.tags);
  if (tags.length) filters.tags = { value: tags, operator: "containsAny" };
  if (params.quality?.trim()) filters.quality = { value: params.quality.trim(), operator: "equals" };
  const nodePath = splitCsv(params.nodePath);
  if (nodePath.length) filters.node_path = { value: nodePath, operator: "containsAny" };
  const industry = splitCsv(params.industry);
  if (industry.length) filters.industry = { value: industry, operator: "containsAny" };
  return Object.keys(filters).length ? filters : undefined;
}

export async function searchKnowhowAction(params: KnowhowSearchParams): Promise<{
  ok?: boolean;
  hits?: KnowhowSearchHit[];
  hint?: string;
  error?: string;
}> {
  await requireUser();
  const query = params.query.trim();
  if (!query) return { error: "请输入搜索关键词" };
  try {
    const hits = await retrieveKnowhow({
      query,
      retrieval_model: {
        business_domain: params.businessDomain ?? "project",
        datasets: "both",
        rerank_enable: true,
        top_k: Math.min(Math.max(params.topK ?? 20, 1), 100),
        vector_weight: 0.7,
        rerank_blend_weight: 0.3,
      },
      metadata_filters: buildFilters(params),
    });
    if (!hits.length) {
      return {
        ok: true,
        hits,
        hint: "Know-how API 已响应但未解析到结果。请确认使用的是 Know-how 检索令牌（不是 KMS 令牌），并在团队设置中点击「测试连接」验证。",
      };
    }
    return { ok: true, hits };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getKnowhowDocumentAction(documentId: string) {
  await requireUser();
  try {
    const doc = await getKnowhowDocument(documentId);
    return { ok: true, doc };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
