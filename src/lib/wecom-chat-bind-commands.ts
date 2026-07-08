import {
  bindWecomChatToCustomer,
  bindWecomChatToPartner,
  getWecomChatByChatId,
  listRecentBindableCustomers,
  listRecentBindablePartners,
  type BindableEntityRow,
} from "./wecom-chats";
import { db } from "./db";
import { stripWecomCommandPrefix } from "./wecom-user-resolve";

export type WecomChatBindCommand =
  | { type: "list_customers" }
  | { type: "list_partners" }
  | { type: "bind_customer_number"; number: number }
  | { type: "bind_partner_number"; number: number }
  | { type: "bind_customer_code"; code: string }
  | { type: "bind_partner_code"; code: string }
  | { type: "help"; entity: "customer" | "partner" }
  | { type: "status" };

type CachedBindList = {
  kind: "customer" | "partner";
  items: BindableEntityRow[];
  expiresAt: number;
};

const LIST_TTL_MS = 5 * 60 * 1000;
const bindListCache = new Map<string, CachedBindList>();

const CUSTOMER_LIST_RE = /^(?:绑定客户|bind\s+customer)(?:\s+(?:帮助|help|说明))?$/i;
const PARTNER_LIST_RE = /^(?:绑定伙伴|bind\s+partner)(?:\s+(?:帮助|help|说明))?$/i;
const CUSTOMER_NUMBER_RE = /^(?:绑定客户|bind\s+customer)\s+(\d{1,2})$/i;
const PARTNER_NUMBER_RE = /^(?:绑定伙伴|bind\s+partner)\s+(\d{1,2})$/i;
const CUSTOMER_CODE_RE = /^(?:绑定客户|bind\s+customer)\s+([A-Z0-9]{6})$/i;
const PARTNER_CODE_RE = /^(?:绑定伙伴|bind\s+partner)\s+([A-Z0-9]{6})$/i;
const CUSTOMER_HELP_RE = /^(?:绑定客户|bind\s+customer)\s+(?:帮助|help|说明)$/i;
const PARTNER_HELP_RE = /^(?:绑定伙伴|bind\s+partner)\s+(?:帮助|help|说明)$/i;
const SHORT_NUMBER_RE = /^绑定\s+(\d{1,2})$/i;

function bodyUsedShortNumber(text: string): boolean {
  const body = extractChatBindBody(text);
  return body ? SHORT_NUMBER_RE.test(body) : false;
}

function extractChatBindBody(text: string): string | null {
  const trimmed = text.trim();
  const direct = stripWecomCommandPrefix(trimmed);
  if (
    /^(?:绑定客户|绑定伙伴|bind\s+customer|bind\s+partner|本群|群状态|绑定\s+\d)/i.test(direct)
  ) {
    return direct;
  }
  const atMatch = trimmed.match(
    /^@(.+)\s+((?:绑定客户|绑定伙伴|bind\s+customer|bind\s+partner|本群|群状态|绑定\s+\d{1,2})(?:\s+.+)?)\s*$/i,
  );
  if (!atMatch) return null;
  if (!/^[\w.\s\u4e00-\u9fff-]{1,40}$/.test(atMatch[1].trim())) return null;
  return atMatch[2].trim();
}

export function isWecomChatStatusQuery(text: string): boolean {
  const body = extractChatBindBody(text);
  if (!body) {
    const cmd = stripWecomCommandPrefix(text);
    return /^(本群|群状态|group\s+status)$/i.test(cmd);
  }
  return /^(本群|群状态|group\s+status)$/i.test(body);
}

export function parseWecomChatBindCommand(text: string): WecomChatBindCommand | null {
  const body = extractChatBindBody(text);
  if (!body) return null;

  if (/^(本群|群状态|group\s+status)$/i.test(body)) return { type: "status" };

  if (CUSTOMER_HELP_RE.test(body)) return { type: "help", entity: "customer" };
  if (PARTNER_HELP_RE.test(body)) return { type: "help", entity: "partner" };

  const customerCode = body.match(CUSTOMER_CODE_RE);
  if (customerCode) return { type: "bind_customer_code", code: customerCode[1].toUpperCase() };

  const partnerCode = body.match(PARTNER_CODE_RE);
  if (partnerCode) return { type: "bind_partner_code", code: partnerCode[1].toUpperCase() };

  const customerNum = body.match(CUSTOMER_NUMBER_RE);
  if (customerNum) return { type: "bind_customer_number", number: parseInt(customerNum[1], 10) };

  const partnerNum = body.match(PARTNER_NUMBER_RE);
  if (partnerNum) return { type: "bind_partner_number", number: parseInt(partnerNum[1], 10) };

  const shortNum = body.match(SHORT_NUMBER_RE);
  if (shortNum) return { type: "bind_customer_number", number: parseInt(shortNum[1], 10) };

  if (CUSTOMER_LIST_RE.test(body)) return { type: "list_customers" };
  if (PARTNER_LIST_RE.test(body)) return { type: "list_partners" };

  return null;
}

function cacheKey(chatId: string) {
  return chatId;
}

function setBindListCache(chatId: string, kind: "customer" | "partner", items: BindableEntityRow[]) {
  bindListCache.set(cacheKey(chatId), {
    kind,
    items,
    expiresAt: Date.now() + LIST_TTL_MS,
  });
}

function getBindListCache(chatId: string, kind: "customer" | "partner"): BindableEntityRow[] | null {
  const cached = bindListCache.get(cacheKey(chatId));
  if (!cached || cached.kind !== kind || cached.expiresAt < Date.now()) return null;
  return cached.items;
}

function formatRelativeDays(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "今天";
  if (days === 1) return "1天前";
  return `${days}天前`;
}

function formatEntityList(kind: "customer" | "partner", items: BindableEntityRow[]): string {
  const label = kind === "customer" ? "客户" : "伙伴";
  if (!items.length) {
    return `暂无可绑定的${label}（均已绑定群或已停用）。可在 Web 详情页生成绑定码后发送 \`@我 绑定${label} XXXXXX\`。`;
  }
  const lines = items.map(
    (item, i) => `${i + 1}. ${item.name}（${formatRelativeDays(item.createdAt)}）`,
  );
  return [
    `最近添加且未绑定群的${label}：`,
    "",
    ...lines,
    "",
    `请回复：\`@我 绑定${label} 编号\`（如 \`@我 绑定${label} 1\`）`,
    `不在列表中？Web 详情页生成绑定码 → \`@我 绑定${label} XXXXXX\``,
    `发送 \`@我 绑定${label} 帮助\` 查看说明`,
  ].join("\n");
}

function formatChatBindHelp(entity: "customer" | "partner"): string {
  const label = entity === "customer" ? "客户" : "伙伴";
  return [
    `**群绑定${label} · 三种方式**`,
    "",
    `1. **编号（推荐）**：\`@我 绑定${label}\` → 看列表 → \`@我 绑定${label} 编号\``,
    `2. **绑定码**：Web ${label}详情 → 帆软连接 → 生成群绑定码 → \`@我 绑定${label} XXXXXX\``,
    `3. **Web 选群**：${label}详情 → 帆软连接 → 从下拉选择企微群`,
    "",
    "查看本群状态：`@我 本群`",
  ].join("\n");
}

export function formatWecomChatStatusReply(chat: {
  chatType: string;
  partner?: { name: string } | null;
  customer?: { name: string } | null;
} | null): string {
  if (!chat || chat.chatType !== "group") {
    return "请在企微群聊中发送 `@我 本群` 查看绑定状态。";
  }
  if (chat.partner) {
    return `✅ 本群已绑定伙伴：**${chat.partner.name}**`;
  }
  if (chat.customer) {
    return `✅ 本群已绑定客户：**${chat.customer.name}**`;
  }
  return [
    "本群尚未绑定客户或伙伴。",
    "",
    "绑定方式：",
    "• `@我 绑定客户` — 从最近添加的客户列表选择编号",
    "• `@我 绑定伙伴` — 从最近添加的伙伴列表选择编号",
    "• Web 详情页 → 帆软连接 → 下拉选群或生成绑定码",
  ].join("\n");
}

async function redeemCustomerBindCode(code: string) {
  return db.customer.findFirst({
    where: {
      wecomChatBindCode: code,
      wecomChatBindCodeExpiresAt: { gt: new Date() },
    },
    select: { id: true, name: true },
  });
}

async function redeemPartnerBindCode(code: string) {
  return db.partner.findFirst({
    where: {
      wecomChatBindCode: code,
      wecomChatBindCodeExpiresAt: { gt: new Date() },
    },
    select: { id: true, name: true },
  });
}

async function clearCustomerBindCode(customerId: string) {
  await db.customer.update({
    where: { id: customerId },
    data: { wecomChatBindCode: null, wecomChatBindCodeExpiresAt: null },
  });
}

async function clearPartnerBindCode(partnerId: string) {
  await db.partner.update({
    where: { id: partnerId },
    data: { wecomChatBindCode: null, wecomChatBindCodeExpiresAt: null },
  });
}

export async function handleWecomChatBindCommand(
  command: WecomChatBindCommand,
  input: {
    chatId: string;
    chatType: string;
    hubUserId: string | null;
    text?: string;
  },
): Promise<string> {
  if (input.chatType !== "group") {
    return "群绑定请在企微群聊中操作。";
  }

  if (!input.hubUserId) {
    return "⚠️ 请先完成企微身份绑定（Web 个人中心生成绑定码 → `@我 绑定 XXXXXX`），再绑定群。";
  }

  const existing = await getWecomChatByChatId(input.chatId);

  if (command.type === "status") {
    return formatWecomChatStatusReply(existing);
  }

  if (command.type === "help") {
    return formatChatBindHelp(command.entity);
  }

  if (existing?.partnerId || existing?.customerId) {
    const bound = existing.partner?.name ?? existing.customer?.name ?? "已绑定实体";
    return `本群已绑定 **${bound}**。如需更换，请先在 Web 详情页解绑。`;
  }

  if (command.type === "list_customers") {
    const items = await listRecentBindableCustomers();
    setBindListCache(input.chatId, "customer", items);
    return formatEntityList("customer", items);
  }

  if (command.type === "list_partners") {
    const items = await listRecentBindablePartners();
    setBindListCache(input.chatId, "partner", items);
    return formatEntityList("partner", items);
  }

  if (command.type === "bind_customer_number" || command.type === "bind_partner_number") {
    let kind: "customer" | "partner" =
      command.type === "bind_customer_number" ? "customer" : "partner";

    if (command.type === "bind_customer_number" && input.text && bodyUsedShortNumber(input.text)) {
      const partnerCached = getBindListCache(input.chatId, "partner");
      const customerCached = getBindListCache(input.chatId, "customer");
      if (partnerCached && !customerCached) kind = "partner";
      else if (customerCached && !partnerCached) kind = "customer";
    }

    let items = getBindListCache(input.chatId, kind);
    if (!items) {
      items =
        kind === "customer"
          ? await listRecentBindableCustomers()
          : await listRecentBindablePartners();
      setBindListCache(input.chatId, kind, items);
    }
    const idx = command.number - 1;
    if (idx < 0 || idx >= items.length) {
      const label = kind === "customer" ? "客户" : "伙伴";
      return `编号无效。请先发送 \`@我 绑定${label}\` 查看当前列表（1–${items.length || 10}）。`;
    }
    const target = items[idx];
    if (kind === "customer") {
      await bindWecomChatToCustomer(input.chatId, target.id, `${target.name} 群`);
      return `✅ 已绑定本群到客户 **${target.name}**。可开始 \`@我 记商务记录…\``;
    }
    await bindWecomChatToPartner(input.chatId, target.id, `${target.name} 群`);
    return `✅ 已绑定本群到伙伴 **${target.name}**。可开始 \`@我 记商务记录…\``;
  }

  if (command.type === "bind_customer_code") {
    const customer = await redeemCustomerBindCode(command.code);
    if (!customer) {
      return "❌ 客户绑定码无效或已过期，请在 Web 客户详情 → 帆软连接 重新生成。";
    }
    const taken = await db.wecomChat.findUnique({ where: { customerId: customer.id } });
    if (taken && taken.chatId !== input.chatId) {
      return `❌ 客户 **${customer.name}** 已绑定其他群。`;
    }
    await bindWecomChatToCustomer(input.chatId, customer.id, `${customer.name} 群`);
    await clearCustomerBindCode(customer.id);
    return `✅ 已绑定本群到客户 **${customer.name}**。`;
  }

  if (command.type === "bind_partner_code") {
    const partner = await redeemPartnerBindCode(command.code);
    if (!partner) {
      return "❌ 伙伴绑定码无效或已过期，请在 Web 伙伴详情 → 帆软连接 重新生成。";
    }
    const taken = await db.wecomChat.findUnique({ where: { partnerId: partner.id } });
    if (taken && taken.chatId !== input.chatId) {
      return `❌ 伙伴 **${partner.name}** 已绑定其他群。`;
    }
    await bindWecomChatToPartner(input.chatId, partner.id, `${partner.name} 群`);
    await clearPartnerBindCode(partner.id);
    return `✅ 已绑定本群到伙伴 **${partner.name}**。`;
  }

  return formatChatBindHelp("customer");
}
