import { db } from "./db";
import { getWecomMemberProfile, resolveWecomOauthConfig } from "./wecom-oauth";

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
  /** 未匹配到发消息者时，仅用于日志，勿展示为「你的」绑定状态 */
  fallbackBotUser?: {
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

/** 去掉 @机器人 前缀，保留业务正文（支持多词 bot 名，如 @MENA Beard Gang …） */
export function stripWecomCommandPrefix(text: string): string {
  let t = text.trim();
  const multiWord = t.match(/^@([\w.\s-]{1,40})\s+([\s\S]+)$/);
  if (multiWord) return multiWord[2].trim();
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

    const cfg = resolveWecomOauthConfig();
    if (cfg) {
      const profile = await getWecomMemberProfile(fromUserId, cfg);
      if (profile && profile.userid !== fromUserId) {
        const byCanonical = await db.user.findFirst({
          where: { wecomUserId: profile.userid },
          select: {
            id: true,
            name: true,
            wecomUserId: true,
            wecomDisplayName: true,
            crmSalesmanName: true,
          },
        });
        if (byCanonical) {
          return { userId: byCanonical.id, matchedBy: "wecomUserId", hubUser: byCanonical };
        }

        const byEmail = profile.emails.length
          ? await db.user.findFirst({
              where: {
                OR: profile.emails.map((email) => ({ email: { equals: email, mode: "insensitive" } })),
              },
              select: {
                id: true,
                name: true,
                wecomUserId: true,
                wecomDisplayName: true,
                crmSalesmanName: true,
              },
            })
          : null;
        if (byEmail) {
          return { userId: byEmail.id, matchedBy: "wecomUserId", hubUser: byEmail };
        }
      }
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
    hubUser: null,
    fallbackBotUser: fallback,
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
    "  （复制时不要带反引号；或直接用绑定码绑定）",
  ];

  if (opts.resolution.matchedBy === "fallback") {
    lines.push("", "⚠️ 尚未匹配到你的 Partner Hub 账号。");
    lines.push(
      "",
      "**快速绑定**",
      "1. Web **个人中心 → 身份绑定** → 生成绑定码",
      "2. 发送：`@我 绑定 XXXXXX`",
      "3. 可选：`@我 绑定 CRM chenmin`",
    );
  } else {
    lines.push("", `• Partner Hub 账号：**${hub?.name ?? "—"}**`);
    lines.push(`• 匹配方式：${opts.resolution.matchedBy === "wecomUserId" ? "企微 userid" : "企微显示名"}`);
  }

  const showUser = hub;
  lines.push(
    "",
    `• 企微 userid 绑定：${showUser?.wecomUserId ? `✅ \`${showUser.wecomUserId}\`` : "❌ 未绑定"}`,
    `• 企微显示名绑定：${showUser?.wecomDisplayName ? `✅ ${showUser.wecomDisplayName}` : "❌ 未绑定"}`,
    `• CRM 销售账号：${showUser?.crmSalesmanName ? `✅ ${showUser.crmSalesmanName}` : "❌ 未绑定"}`,
    "",
    "发送 `@我 绑定` 查看绑定说明，`@我 帮助` 查看全部指令。",
  );

  return lines.join("\n");
}
