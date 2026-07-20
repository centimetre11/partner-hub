import "server-only";

import { AIError, chatCompletion, type ChatImage, type ChatMessage } from "./ai";
import { normalizeMessagesForAi } from "./ai-images-server";
import type { Locale } from "./i18n/locale";
import {
  normalizeBillingCycle,
  normalizeContractStatus,
  normalizeContractType,
} from "./contract-types";
import { normalizeAmountInput, normalizeCurrency } from "./amount";
import { normalizeLineItem, type ContractLineItemInput } from "./contract-line-items";
import type { ContractExtractResult } from "./contract-extract-types";

export type { ContractExtractResult } from "./contract-extract-types";

export type ContractExtractContext = {
  locale: Locale;
  userId: string;
  /** Optional hint: current customer name on the form. */
  customerNameHint?: string | null;
};

const CONTRACT_EXTRACT_MAX_TOKENS = 2048;

function buildPrompt(ctx: ContractExtractContext, source: "image" | "text"): string {
  const { locale, customerNameHint } = ctx;
  const sourceHint =
    source === "image"
      ? locale === "zh"
        ? "必须阅读图片中的文字（帆软 CRM 合同/机会详情截图），禁止猜测看不到的内容。"
        : "READ text in the screenshot (FanRuan CRM contract/opportunity page). Do not guess missing text."
      : locale === "zh"
        ? "必须阅读用户提供的合同文字，禁止猜测。"
        : "READ the contract text. Do not guess.";

  const customerHint =
    customerNameHint?.trim() &&
    (locale === "zh"
      ? `\n当前页面客户：${customerNameHint.trim()}（若截图客户名一致可沿用）。`
      : `\nCurrent page customer: ${customerNameHint.trim()} (reuse if the screenshot matches).`);

  if (locale === "zh") {
    return `你是 CRM 合同截图结构化助手。${sourceHint}${customerHint || ""}

只输出 JSON：
{"name":"","customerName":"","contractType":"SUBSCRIPTION|BUYOUT|PRODUCT_MAINTENANCE|PROJECT|PROJECT_MAINTENANCE","status":"DRAFT|ACTIVE|EXPIRED|CANCELLED|RENEWED","amount":"","currency":"CNY|USD|EUR|SGD|HKD","crmContractId":"","billingCycle":"MONTHLY|QUARTERLY|YEARLY|OTHER","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","renewsAt":"YYYY-MM-DD","salesOwnerName":"","notes":"","lineItems":[{"product":"","version":"","amount":"","currency":"","cycleYears":1}]}

字段映射（CRM → 本系统）：
- 机会名称/合同名称 → name
- 客户名称 → customerName
- 预计采购方式：年费订阅/订阅 → SUBSCRIPTION+YEARLY；买断/永久 → BUYOUT；产品维保 → PRODUCT_MAINTENANCE；项目合同 → PROJECT；项目维保 → PROJECT_MAINTENANCE
- 预计总金额 → amount（纯数字，去逗号）；币种 → currency（USD/CNY…）
- 机会ID/合同ID → crmContractId（UUID 或 CRM 编号原样）
- 预计日期/关闭日 → endDate 或 renewsAt（续费场景优先 renewsAt）；创建日 → startDate（可空）
- 机会销售 → salesOwnerName
- 预计产品与服务表格 → lineItems（product/version/amount/cycleYears）
- 需求概述/备注/最新跟进 → 合并进 notes
- 赢单概率、流程状态等商机字段：若无明确合同状态则 status=ACTIVE；勿编造金额或 ID

日期只输出 YYYY-MM-DD。金额不要带币种符号。看不到的字段用空字符串/空数组。`;
  }

  return `CRM contract screenshot extraction. ${sourceHint}${customerHint || ""}

JSON only:
{"name":"","customerName":"","contractType":"SUBSCRIPTION|BUYOUT|PRODUCT_MAINTENANCE|PROJECT|PROJECT_MAINTENANCE","status":"DRAFT|ACTIVE|EXPIRED|CANCELLED|RENEWED","amount":"","currency":"CNY|USD|EUR|SGD|HKD","crmContractId":"","billingCycle":"MONTHLY|QUARTERLY|YEARLY|OTHER","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","renewsAt":"YYYY-MM-DD","salesOwnerName":"","notes":"","lineItems":[{"product":"","version":"","amount":"","currency":"","cycleYears":1}]}

CRM → Hub mapping:
- Opportunity/contract name → name; customer → customerName
- Procurement: annual subscription → SUBSCRIPTION+YEARLY; buyout → BUYOUT; product maint → PRODUCT_MAINTENANCE; project → PROJECT; project maint → PROJECT_MAINTENANCE
- Total amount → amount (digits only); currency → currency
- Opportunity/contract ID → crmContractId
- Estimated/close date → endDate or renewsAt; created date → startDate (optional)
- Sales owner → salesOwnerName
- Products table → lineItems
- Demand notes / follow-up → notes
- Win % / pipeline status: default status=ACTIVE if unclear; never invent amounts/IDs

Dates as YYYY-MM-DD. Empty string/[] when not visible.`;
}

function parseJsonContent(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(jsonStr.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeDateYmd(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  const m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  // Chinese: 2026年6月18日
  const zh = s.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (zh) {
    return `${zh[1]}-${zh[2].padStart(2, "0")}-${zh[3].padStart(2, "0")}`;
  }
  return undefined;
}

export function hasUsefulContractExtract(r: ContractExtractResult): boolean {
  return !!(
    r.name?.trim() ||
    r.amount?.trim() ||
    r.crmContractId?.trim() ||
    r.customerName?.trim() ||
    r.contractType ||
    (r.lineItems && r.lineItems.length > 0) ||
    r.endDate ||
    r.renewsAt
  );
}

export function normalizeContractExtractResult(raw: Record<string, unknown>): ContractExtractResult {
  const procurement = String(raw.procurementMode ?? raw.采购方式 ?? "").trim();
  let contractType =
    normalizeContractType(String(raw.contractType ?? "")) ??
    normalizeContractType(procurement);

  // Extra CRM wording
  if (!contractType && procurement) {
    if (/年费|订阅|subscription|saas/i.test(procurement)) contractType = "SUBSCRIPTION";
    else if (/买断|buyout|永久/i.test(procurement)) contractType = "BUYOUT";
  }

  let billingCycle = normalizeBillingCycle(String(raw.billingCycle ?? "") || null);
  if (!billingCycle && contractType === "SUBSCRIPTION") billingCycle = "YEARLY";
  if (!billingCycle && /年费|annual|yearly/i.test(procurement)) billingCycle = "YEARLY";

  const lineRaw = Array.isArray(raw.lineItems) ? raw.lineItems : [];
  const lineItems = lineRaw
    .map((item) => normalizeLineItem(item))
    .filter((x): x is ContractLineItemInput => !!x);

  const amount =
    normalizeAmountInput(raw.amount) ??
    normalizeAmountInput(String(raw.amount ?? "").replace(/[^\d.]/g, ""));

  const currency = normalizeCurrency(raw.currency) ?? undefined;

  const notesParts = [
    String(raw.notes ?? "").trim(),
    String(raw.demandOverview ?? "").trim(),
    String(raw.demandRemarks ?? "").trim(),
    String(raw.latestFollowUp ?? "").trim(),
  ].filter(Boolean);

  const statusRaw = String(raw.status ?? "").trim();
  const result: ContractExtractResult = {
    name: String(raw.name ?? "").trim() || undefined,
    customerName: String(raw.customerName ?? "").trim() || undefined,
    contractType: contractType ?? undefined,
    status: statusRaw ? normalizeContractStatus(statusRaw) : undefined,
    amount: amount ?? undefined,
    currency,
    crmContractId: String(raw.crmContractId ?? raw.opportunityId ?? "").trim() || undefined,
    billingCycle: billingCycle ?? undefined,
    startDate: normalizeDateYmd(raw.startDate ?? raw.createdAt),
    endDate: normalizeDateYmd(raw.endDate ?? raw.estimatedDate),
    renewsAt: normalizeDateYmd(raw.renewsAt ?? raw.renewalDate),
    salesOwnerName: String(raw.salesOwnerName ?? "").trim() || undefined,
    notes: notesParts.length ? notesParts.join("\n") : undefined,
    lineItems: lineItems.length ? lineItems : undefined,
  };

  // If only endDate and looks like renewal, keep both; if subscription and renewsAt empty, copy endDate
  if (result.contractType === "SUBSCRIPTION" && result.endDate && !result.renewsAt) {
    result.renewsAt = result.endDate;
  }

  return result;
}

export async function extractContractFromImages(
  images: ChatImage[],
  ctx: ContractExtractContext
): Promise<ContractExtractResult> {
  if (!images.length) throw new AIError(ctx.locale === "zh" ? "请上传截图" : "Please upload a screenshot");

  const system = buildPrompt(ctx, "image");
  const userMsg: ChatMessage = {
    role: "user",
    content:
      ctx.locale === "zh"
        ? "请仔细阅读截图中的 CRM 合同/机会信息并输出 JSON。"
        : "Read the CRM contract/opportunity info in the screenshot and output JSON.",
    images,
  };
  return runContractExtractChat(system, userMsg, ctx, "image");
}

export async function extractContractFromText(
  text: string,
  ctx: ContractExtractContext
): Promise<ContractExtractResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new AIError(ctx.locale === "zh" ? "请粘贴合同文字" : "Paste contract text");
  }

  const system = buildPrompt(ctx, "text");
  const userMsg: ChatMessage = {
    role: "user",
    content:
      ctx.locale === "zh"
        ? `请从以下合同/CRM 文字中提取信息并输出 JSON：\n\n${trimmed}`
        : `Extract contract info from the following text and output JSON:\n\n${trimmed}`,
  };
  return runContractExtractChat(system, userMsg, ctx, "text");
}

async function runContractExtractChat(
  system: string,
  userMsg: ChatMessage,
  ctx: ContractExtractContext,
  source: "image" | "text"
): Promise<ContractExtractResult> {
  const chat: ChatMessage[] = [
    { role: "system", content: system },
    userMsg,
  ];
  normalizeMessagesForAi(chat);

  const { content } = await chatCompletion(chat, {
    jsonMode: true,
    temperature: 0,
    feature: source === "image" ? "Contract: extract screenshot" : "Contract: extract text",
    userId: ctx.userId,
    maxTokens: CONTRACT_EXTRACT_MAX_TOKENS,
    toolChoice: "none",
  });

  const parsed = parseJsonContent(content) ?? {};
  const result = normalizeContractExtractResult(parsed);

  if (!hasUsefulContractExtract(result)) {
    throw new AIError(
      ctx.locale === "zh"
        ? source === "image"
          ? "未能从截图识别到合同信息。请确认截图含名称/金额/产品等清晰文字，并在「设置 → 场景模型 → 图片识别」配置视觉模型。"
          : "未能从文字识别到合同信息。请补充合同名称、金额或产品明细后再试。"
        : source === "image"
          ? "Could not extract contract info from the screenshot. Ensure readable name/amount/product text, and assign a vision model under Settings → Scene models → Vision."
          : "Could not extract contract info from the text. Add name, amount, or line items and try again."
    );
  }

  return result;
}
