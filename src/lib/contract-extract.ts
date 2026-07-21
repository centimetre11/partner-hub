import "server-only";

import { AIError, chatCompletion, type ChatImage, type ChatMessage } from "./ai";
import { maxTokensForTaskTier, maxTokensForVisionIntake } from "./ai-capabilities";
import { normalizeMessagesForAi } from "./ai-images-server";
import type { Locale } from "./i18n/locale";
import {
  normalizeBillingCycle,
  normalizeContractStatus,
  normalizeContractType,
} from "./contract-types";
import { normalizeAmountInput, normalizeCurrency } from "./amount";
import { normalizeLineItem, type ContractLineItemInput } from "./contract-line-items";
import { normalizeTermYears, termYearsFromDateRange } from "./arr";
import type { ContractExtractResult } from "./contract-extract-types";

export type { ContractExtractResult } from "./contract-extract-types";

export type ContractExtractContext = {
  locale: Locale;
  userId: string;
  /** Optional hint: current customer name on the form. */
  customerNameHint?: string | null;
};

/** Text JSON structuring (after OCR). Vision one-shot fallback uses maxTokensForVisionIntake. */
const CONTRACT_EXTRACT_TEXT_MAX_TOKENS = 2048;

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
{"name":"","customerName":"","contractType":"SUBSCRIPTION|BUYOUT|PRODUCT_MAINTENANCE|PROJECT|PROJECT_MAINTENANCE","status":"DRAFT|ACTIVE|EXPIRED|CANCELLED|RENEWED","amount":"","currency":"CNY|USD|EUR|SGD|HKD","crmContractId":"","billingCycle":"MONTHLY|QUARTERLY|YEARLY|OTHER","termYears":1,"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","renewsAt":"YYYY-MM-DD","salesOwnerName":"","notes":"","lineItems":[{"product":"","version":"","amount":"","currency":"","cycleYears":1}]}

支持两类帆软 CRM 页面：

【A. 机会详情】
- 机会名称 → name；客户名称 → customerName
- 预计采购方式：年费订阅/订阅 → SUBSCRIPTION+YEARLY；买断 → BUYOUT；产品维保 → PRODUCT_MAINTENANCE；项目合同 → PROJECT；项目维保 → PROJECT_MAINTENANCE
- 预计总金额 → amount；币种 → currency
- 机会ID → crmContractId；机会销售 → salesOwnerName
- 预计产品与服务表 → lineItems
- 预计日期/关闭日 → endDate 或 renewsAt；创建日 → startDate
- 若起止跨多年，termYears 填整数年数（约等于结束年−开始年，近整年则四舍五入）

【B. 合同详情（合同文件 + 合同内容）】
- 合同名称 → name；公司名称/最终用户 → customerName
- 产品金额 → amount（纯数字去逗号）；页面无币种可留空 currency
- 合同id（UUID）优先，其次文件编号 → crmContractId
- 签单日期 → startDate；结束日期 → endDate（订阅同时 renewsAt=结束日期）
- 责任销售/合同销售 → salesOwnerName
- 合同状态：执行中/生效 → ACTIVE；草稿 → DRAFT；到期 → EXPIRED；取消 → CANCELLED
- 合同类型写「其他合同」但名称含「订阅」→ SUBSCRIPTION+YEARLY；含买断 → BUYOUT；含维保按产品/项目维保
- 无产品表时：从合同名推断产品（FineBI/FineReport 等）写入 lineItems，金额用产品金额，cycleYears=1
- 多年订阅：产品金额通常是合同总价，termYears 按签单日到结束日估算（如 2026-01 至 2030-12 → 5）

需求概述/备注/文件备注 → notes。勿编造金额或 ID。日期 YYYY-MM-DD。看不到的字段空字符串/空数组。`;
  }

  return `CRM contract screenshot extraction. ${sourceHint}${customerHint || ""}

JSON only:
{"name":"","customerName":"","contractType":"SUBSCRIPTION|BUYOUT|PRODUCT_MAINTENANCE|PROJECT|PROJECT_MAINTENANCE","status":"DRAFT|ACTIVE|EXPIRED|CANCELLED|RENEWED","amount":"","currency":"CNY|USD|EUR|SGD|HKD","crmContractId":"","billingCycle":"MONTHLY|QUARTERLY|YEARLY|OTHER","termYears":1,"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","renewsAt":"YYYY-MM-DD","salesOwnerName":"","notes":"","lineItems":[{"product":"","version":"","amount":"","currency":"","cycleYears":1}]}

Two FanRuan page types:

[A. Opportunity] name/customer; procurement→type; total amount/currency; opportunity ID; sales; products table; dates; termYears if multi-year.

[B. Contract detail] contract name→name; company/end user→customerName; 产品金额→amount (often multi-year total); contract UUID/file no→crmContractId; signing→startDate; end→endDate (+renewsAt for subscription); sales; status 执行中→ACTIVE; type「其他合同」+订阅 in name→SUBSCRIPTION; infer FineBI line item from name if no product table; termYears from signing→end (e.g. 2026-01 to 2030-12 → 5).

Never invent amounts/IDs. Dates YYYY-MM-DD. Empty string/[] when not visible.`;
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
  const procurement = String(raw.procurementMode ?? raw.采购方式 ?? raw.contractTypeLabel ?? "").trim();
  const nameHint = String(raw.name ?? raw.contractName ?? "").trim();
  let contractType =
    normalizeContractType(String(raw.contractType ?? "")) ??
    normalizeContractType(procurement) ??
    normalizeContractType(nameHint);

  // Extra CRM wording (机会采购方式 / 合同类型「其他合同」+ 名称含订阅)
  if (!contractType && (procurement || nameHint)) {
    const blob = `${procurement} ${nameHint}`;
    if (/年费|订阅|subscription|saas/i.test(blob)) contractType = "SUBSCRIPTION";
    else if (/买断|buyout|永久/i.test(blob)) contractType = "BUYOUT";
    else if (/项目维保/i.test(blob)) contractType = "PROJECT_MAINTENANCE";
    else if (/产品维保|维保/i.test(blob)) contractType = "PRODUCT_MAINTENANCE";
    else if (/项目合同/i.test(blob)) contractType = "PROJECT";
  }

  let billingCycle = normalizeBillingCycle(String(raw.billingCycle ?? "") || null);
  if (!billingCycle && contractType === "SUBSCRIPTION") billingCycle = "YEARLY";
  if (!billingCycle && /年费|annual|yearly|订阅/i.test(`${procurement} ${nameHint}`)) {
    billingCycle = "YEARLY";
  }

  const lineRaw = Array.isArray(raw.lineItems) ? raw.lineItems : [];
  let lineItems = lineRaw
    .map((item) => normalizeLineItem(item))
    .filter((x): x is ContractLineItemInput => !!x);

  const amount =
    normalizeAmountInput(raw.amount) ??
    normalizeAmountInput(raw.productAmount) ??
    normalizeAmountInput(raw.产品金额) ??
    normalizeAmountInput(String(raw.amount ?? raw.productAmount ?? "").replace(/[^\d.]/g, ""));

  const currency = normalizeCurrency(raw.currency) ?? undefined;

  // Infer a product line from contract name when CRM contract page has no product table.
  if (!lineItems.length && nameHint) {
    const productMatch = nameHint.match(/\b(FineBI|FineReport|FineDataLink|FDL|简道云|九数云)\b/i);
    if (productMatch) {
      const inferred = normalizeLineItem({
        product: productMatch[1],
        amount: amount ?? null,
        currency: currency ?? null,
        cycleYears: 1,
      });
      if (inferred) lineItems = [inferred];
    }
  }

  const notesParts = [
    String(raw.notes ?? "").trim(),
    String(raw.demandOverview ?? "").trim(),
    String(raw.demandRemarks ?? "").trim(),
    String(raw.latestFollowUp ?? "").trim(),
    String(raw.fileNotes ?? "").trim(),
  ].filter(Boolean);

  const statusRaw = String(raw.status ?? raw.contractStatus ?? "").trim();
  const startDate = normalizeDateYmd(
    raw.startDate ?? raw.signingDate ?? raw.签单日期 ?? raw.createdAt
  );
  const endDate = normalizeDateYmd(raw.endDate ?? raw.结束日期 ?? raw.estimatedDate);

  let termYears: number | undefined;
  const termRaw = raw.termYears ?? raw.subscriptionYears ?? raw.years;
  if (termRaw != null && String(termRaw).trim() !== "") {
    const n = Number(termRaw);
    if (Number.isFinite(n) && n > 0) termYears = normalizeTermYears(n);
  }
  if (termYears == null && startDate && endDate) {
    termYears = termYearsFromDateRange(startDate, endDate) ?? undefined;
  }

  const result: ContractExtractResult = {
    name: nameHint || undefined,
    customerName:
      String(raw.customerName ?? raw.endUser ?? raw.companyName ?? "").trim() || undefined,
    contractType: contractType ?? undefined,
    status: statusRaw ? normalizeContractStatus(statusRaw) : undefined,
    amount: amount ?? undefined,
    currency,
    crmContractId:
      String(raw.crmContractId ?? raw.contractId ?? raw.opportunityId ?? raw.fileNumber ?? "")
        .trim() || undefined,
    billingCycle: billingCycle ?? undefined,
    termYears,
    startDate,
    endDate,
    renewsAt: normalizeDateYmd(raw.renewsAt ?? raw.renewalDate),
    salesOwnerName:
      String(raw.salesOwnerName ?? raw.contractSales ?? raw.responsibleSales ?? "").trim() ||
      undefined,
    notes: notesParts.length ? notesParts.join("\n") : undefined,
    lineItems: lineItems.length ? lineItems : undefined,
  };

  if (result.contractType === "SUBSCRIPTION" && result.endDate && !result.renewsAt) {
    result.renewsAt = result.endDate;
  }

  return result;
}

/** OCR only — vision models are much faster/reliable dumping plain text than emitting JSON. */
async function ocrContractScreenshot(
  images: ChatImage[],
  ctx: ContractExtractContext
): Promise<string | null> {
  const prompt =
    ctx.locale === "zh"
      ? `请完整读取帆软 CRM 截图中所有可见字段文字（机会详情或合同详情均可）。
逐行列出标签与取值，例如：合同名称、公司名称、最终用户、产品金额、合同id、文件编号、签单日期、结束日期、责任销售、合同销售、合同状态、合同类型、预计采购方式、预计总金额、机会ID、产品明细表等。
只输出图片中看得见的文字，不要编造，不要输出 JSON。`
      : `Read all visible FanRuan CRM fields in the screenshot (opportunity or contract detail).
List each label and value (name, company, amount, contract id, dates, sales, status, type, product table, etc.).
Only visible text — do not invent, do not output JSON.`;

  try {
    const chat: ChatMessage[] = [{ role: "user", content: prompt, images }];
    normalizeMessagesForAi(chat);
    const { content } = await chatCompletion(chat, {
      jsonMode: false,
      temperature: 0.1,
      feature: "Contract: vision OCR",
      userId: ctx.userId,
      scene: "vision",
      maxTokens: maxTokensForVisionIntake(),
      toolChoice: "none",
    });
    return content?.trim() || null;
  } catch {
    return null;
  }
}

export async function extractContractFromImages(
  images: ChatImage[],
  ctx: ContractExtractContext
): Promise<ContractExtractResult> {
  if (!images.length) throw new AIError(ctx.locale === "zh" ? "请上传截图" : "Please upload a screenshot");

  // Preferred path: OCR (vision) → structure (fast text). Avoids slow/empty vision+JSON.
  const ocr = await ocrContractScreenshot(images, ctx);
  if (ocr && ocr.length >= 20) {
    try {
      return await extractContractFromText(ocr, ctx, "ocr");
    } catch (e) {
      if (!(e instanceof AIError)) throw e;
      // Fall through to one-shot vision JSON
    }
  }

  const system = buildPrompt(ctx, "image");
  const userMsg: ChatMessage = {
    role: "user",
    content:
      ctx.locale === "zh"
        ? "请仔细阅读截图（机会详情或合同详情均可）中的字段并输出 JSON。"
        : "Read the CRM opportunity or contract-detail fields in the screenshot and output JSON.",
    images,
  };
  return runContractExtractChat(system, userMsg, ctx, "image");
}

export async function extractContractFromText(
  text: string,
  ctx: ContractExtractContext,
  /** Internal: text came from OCR of a screenshot */
  via: "text" | "ocr" = "text"
): Promise<ContractExtractResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new AIError(ctx.locale === "zh" ? "请粘贴合同文字" : "Paste contract text");
  }

  const system = buildPrompt(ctx, "text");
  const prefix =
    via === "ocr"
      ? ctx.locale === "zh"
        ? "以下是从 CRM 截图 OCR 得到的文字，请提取合同信息并输出 JSON：\n\n"
        : "OCR text from a CRM screenshot. Extract contract info as JSON:\n\n"
      : ctx.locale === "zh"
        ? "请从以下合同/CRM 文字中提取信息并输出 JSON：\n\n"
        : "Extract contract info from the following text and output JSON:\n\n";

  const userMsg: ChatMessage = {
    role: "user",
    content: `${prefix}${trimmed}`,
  };
  return runContractExtractChat(system, userMsg, ctx, via === "ocr" ? "ocr" : "text");
}

async function runContractExtractChat(
  system: string,
  userMsg: ChatMessage,
  ctx: ContractExtractContext,
  source: "image" | "text" | "ocr"
): Promise<ContractExtractResult> {
  const chat: ChatMessage[] = [
    { role: "system", content: system },
    userMsg,
  ];
  normalizeMessagesForAi(chat);

  const isVision = source === "image";
  const { content } = await chatCompletion(chat, {
    jsonMode: true,
    temperature: 0,
    feature:
      source === "image"
        ? "Contract: extract screenshot"
        : source === "ocr"
          ? "Contract: extract from OCR"
          : "Contract: extract text",
    userId: ctx.userId,
    maxTokens: isVision
      ? maxTokensForVisionIntake()
      : maxTokensForTaskTier("fast") ?? CONTRACT_EXTRACT_TEXT_MAX_TOKENS,
    taskTier: isVision ? undefined : "fast",
    scene: isVision ? "vision" : "fast",
    toolChoice: "none",
  });

  const parsed = parseJsonContent(content) ?? {};
  const result = normalizeContractExtractResult(parsed);

  if (!hasUsefulContractExtract(result)) {
    const imageLike = source === "image" || source === "ocr";
    throw new AIError(
      ctx.locale === "zh"
        ? imageLike
          ? "未能从截图识别到合同信息。请确认截图含名称/金额/产品等清晰文字，并在「设置 → 场景模型 → 图片识别」配置视觉模型。"
          : "未能从文字识别到合同信息。请补充合同名称、金额或产品明细后再试。"
        : imageLike
          ? "Could not extract contract info from the screenshot. Ensure readable name/amount/product text, and assign a vision model under Settings → Scene models → Vision."
          : "Could not extract contract info from the text. Add name, amount, or line items and try again."
    );
  }

  return result;
}
