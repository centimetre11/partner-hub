import { db } from "./db";

export type WecomActorMatch = "wecomUserId" | "wecomDisplayName" | "fallback";

export type WecomActorResolution = {
  userId: string;
  matchedBy: WecomActorMatch;
  hubUser: {
    id: string;
    name: string;
    wecomUserId: string | null;
    wecomDisplayName: string | null;
    crmSalesmanName: string | null;
  } | null;
};

const WECOM_IDENTITY_QUERY_RE =
  /^(我是谁|我的绑定|查询userid|userid|绑定说明|绑定帮助|身份绑定)$/i;

/** 群聊 @ 机器人后查询绑定信息 */
export function isWecomIdentityQuery(text: string): boolean {
  const cmd = stripWecomCommandPrefix(text);
  if (WECOM_IDENTITY_QUERY_RE.test(cmd)) return true;
  const m = text.trim().match(/^@(.+)\s+(我是谁|我的绑定|查询userid|userid|绑定说明|绑定帮助|身份绑定)\s*$/i);
  if (!m) return false;
  return /^[\w.\s-]{1,40}$/.test(m[1].trim());
}

/** 去掉 @机器人 前缀，保留业务正文 */
export function stripWecomCommandPrefix(text: string): string {
  let t = text.trim();
  t = t.replace(/^(?:@[^\s]+\s*)+/, "").trim();
  return t;
}

function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export async function resolveWecomActorUserId(input: {
  fromUserId?: string | null;
  fallbackUserId: string;
}): Promise<WecomActorResolution> {
  const fromUserId = input.fromUserId?.trim();
  if (fromUserId) {
    const byUserId = await db.user.findFirst({
      where: { wecomUserId: fromUserId },
      select: {
        id: true,
        name: true,
        wecomUserId: true,
        wecomDisplayName: true,
        crmSalesmanName: true,
      },
    });
    if (byUserId) {
      return { userId: byUserId.id, matchedBy: "wecomUserId", hubUser: byUserId };
    }
  }

  const fallback = await db.user.findUnique({
    where: { id: input.fallbackUserId },
    select: {
      id: true,
      name: true,
      wecomUserId: true,
      wecomDisplayName: true,
      crmSalesmanName: true,
    },
  });
  return {
    userId: input.fallbackUserId,
    matchedBy: "fallback",
    hubUser: fallback,
  };
}

/** 按企微显示名匹配（需用户先在个人中心填写） */
export async function resolveWecomActorByDisplayName(
  displayName: string,
  fallbackUserId: string,
): Promise<WecomActorResolution> {
  const normalized = normalizeDisplayName(displayName);
  if (!normalized) {
    return resolveWecomActorUserId({ fallbackUserId });
  }

  const candidates = await db.user.findMany({
    where: { wecomDisplayName: { not: null } },
    select: {
      id: true,
      name: true,
      wecomUserId: true,
      wecomDisplayName: true,
      crmSalesmanName: true,
    },
  });
  const lower = normalized.toLowerCase();
  const byDisplay = candidates.find(
    (u) => u.wecomDisplayName && u.wecomDisplayName.toLowerCase() === lower,
  );
  if (byDisplay) {
    return { userId: byDisplay.id, matchedBy: "wecomDisplayName", hubUser: byDisplay };
  }

  return resolveWecomActorUserId({ fallbackUserId });
}

export function formatWecomIdentityReply(opts: {
  fromUserId?: string | null;
  resolution: WecomActorResolution;
}): string {
  const fromUserId = opts.fromUserId?.trim() || "（未收到 userid）";
  const hub = opts.resolution.hubUser;
  const lines = [
    "**企微身份绑定信息**",
    "",
    `• 本次消息 userid：\`${fromUserId}\``,
    "  （可复制到 Partner Hub → 个人中心 → 身份绑定）",
  ];

  if (opts.resolution.matchedBy === "fallback") {
    lines.push("", "⚠️ 尚未匹配到你的 Partner Hub 账号。");
  } else {
    lines.push("", `• Partner Hub 账号：**${hub?.name ?? "—"}**`);
    lines.push(`• 匹配方式：${opts.resolution.matchedBy === "wecomUserId" ? "企微 userid" : "企微显示名"}`);
  }

  lines.push(
    "",
    `• 企微 userid 绑定：${hub?.wecomUserId ? `✅ \`${hub.wecomUserId}\`` : "❌ 未绑定"}`,
    `• 企微显示名绑定：${hub?.wecomDisplayName ? `✅ ${hub.wecomDisplayName}` : "❌ 未绑定"}`,
    `• CRM 销售账号：${hub?.crmSalesmanName ? `✅ ${hub.crmSalesmanName}` : "❌ 未绑定"}`,
    "",
    "请在 Web 打开 **个人中心**（/account）完成三项绑定，商务记录才会以你的 CRM 账号归档。",
  );

  return lines.join("\n");
}
