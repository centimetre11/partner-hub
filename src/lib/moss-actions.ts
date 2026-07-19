"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import {
  fetchMossDossier,
  parseMossDossier,
  type MossDossier,
} from "./moss-dossier";
import {
  getMossConfigStatus,
  listMossTools,
  searchMossCompanies,
  testMossConnection,
} from "./moss";
import { requireUser } from "./session";
import { db } from "./db";

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

export async function resolveMossEntityAction(input: { name: string }) {
  await requireUser();
  try {
    const result = await searchMossCompanies(input.name);
    const multi = result.hits.length > 1;
    return {
      hits: result.hits,
      text: result.text,
      hint: result.hits.length
        ? multi
          ? "匹配到多家企业，请选择正确主体后再查看背调（后续使用 credit_code）。"
          : undefined
        : result.text
          ? "已调用 Moss，但未解析到企业列表。可换关键词重试。"
          : "未找到匹配企业，请调整关键词。",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** @deprecated use resolveMossEntityAction */
export async function searchMossCompaniesAction(input: { keyword: string }) {
  return resolveMossEntityAction({ name: input.keyword });
}

export async function fetchMossDossierAction(input: {
  creditCode: string;
  companyName?: string;
}) {
  await requireUser();
  try {
    const dossier = await fetchMossDossier(input);
    return { dossier };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** @deprecated use fetchMossDossierAction */
export async function fetchMossInsightAction(input: {
  creditCode?: string;
  companyName?: string;
}) {
  if (!input.creditCode) return { error: "缺少 credit_code" };
  const res = await fetchMossDossierAction({
    creditCode: input.creditCode,
    companyName: input.companyName,
  });
  if ("error" in res && res.error) return res;
  const dossier = res.dossier!;
  return {
    sections: [
      { tool: "profile", text: dossier.humanSummary, data: dossier.profile },
      ...dossier.risks.map((r) => ({
        tool: r.label,
        text: r.summary || r.error || `${r.count} 条`,
        data: r,
      })),
    ],
    errors: dossier.risks
      .filter((r) => r.status === "error")
      .map((r) => ({ tool: r.label, error: r.error || "失败" })),
    summary: dossier.humanSummary,
  };
}

export async function saveMossToCustomerAction(input: {
  customerId: string;
  creditCode: string;
  companyName?: string;
  dossier: MossDossier;
}) {
  const user = await requireUser();
  const customer = await db.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) return { error: "客户不存在" };

  await db.customer.update({
    where: { id: input.customerId },
    data: {
      creditCode: input.creditCode.trim(),
      mossSnapshot: input.dossier as unknown as Prisma.InputJsonValue,
      mossSyncedAt: new Date(),
      industry: customer.industry || input.dossier.profile.industry || undefined,
      scale: customer.scale || input.dossier.profile.scale || undefined,
      city: customer.city || undefined,
    },
  });

  revalidatePath(`/customers/${input.customerId}`);
  revalidatePath("/customers");
  return { ok: true as const, savedBy: user.name };
}

export async function addMossTimelineAction(input: {
  customerId: string;
  dossier: MossDossier;
}) {
  const user = await requireUser();
  const customer = await db.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) return { error: "客户不存在" };

  await db.timelineEvent.create({
    data: {
      customerId: input.customerId,
      type: "NEWS",
      title: `Moss 背调 · ${input.dossier.companyName}`,
      content: input.dossier.humanSummary,
      meta: JSON.stringify({ source: "moss", creditCode: input.dossier.creditCode, riskLevel: input.dossier.riskLevel }),
      createdById: user.id,
    },
  });

  revalidatePath(`/customers/${input.customerId}`);
  return { ok: true as const };
}

export async function loadCustomerMossCacheAction(customerId: string) {
  await requireUser();
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      creditCode: true,
      mossSnapshot: true,
      mossSyncedAt: true,
    },
  });
  if (!customer) return { error: "客户不存在" };
  return {
    entityName: customer.name,
    creditCode: customer.creditCode,
    mossSyncedAt: customer.mossSyncedAt?.toISOString() ?? null,
    dossier: parseMossDossier(customer.mossSnapshot),
  };
}
