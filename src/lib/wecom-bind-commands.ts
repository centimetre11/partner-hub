import { db } from "./db";
import {
  isValidWecomDisplayName,
  isValidWecomUserId,
  sanitizeWecomDisplayName,
  sanitizeWecomUserId,
} from "./wecom-identity-validation";
import { stripWecomCommandPrefix } from "./wecom-user-resolve";

export type WecomBindCommand =
  | { type: "help" }
  | { type: "auto" }
  | { type: "redeem"; code: string }
  | { type: "crm"; name: string }
  | { type: "display"; name: string };

const BIND_BODY_RE =
  /^(?:绑定|bind)(?:\s+(?:帮助|help|说明))?$/i;
const BIND_CODE_RE = /^(?:绑定|bind)\s+([A-Z0-9]{6})$/i;
const BIND_CRM_RE = /^(?:绑定|bind)\s+CRM\s+(.+)$/i;
const BIND_DISPLAY_RE = /^(?:绑定|bind)\s+(?:显示名|昵称)\s+(.+)$/i;

function extractBindBody(text: string): string | null {
  const trimmed = text.trim();
  const direct = stripWecomCommandPrefix(trimmed);
  if (/^(?:绑定|bind)/i.test(direct)) return direct;

  const atMatch = trimmed.match(/^@(.+)\s+((?:绑定|bind)(?:\s+.+)?)\s*$/i);
  if (!atMatch) return null;
  if (!/^[\w.\s-]{1,40}$/.test(atMatch[1].trim())) return null;
  return atMatch[2].trim();
}

export function parseWecomBindCommand(text: string): WecomBindCommand | null {
  const body = extractBindBody(text);
  if (!body) return null;

  if (BIND_BODY_RE.test(body)) return { type: "auto" };
  if (/^(?:绑定|bind)\s+(?:帮助|help|说明)$/i.test(body)) return { type: "help" };

  const codeMatch = body.match(BIND_CODE_RE);
  if (codeMatch) return { type: "redeem", code: codeMatch[1].toUpperCase() };

  const crmMatch = body.match(BIND_CRM_RE);
  if (crmMatch) return { type: "crm", name: crmMatch[1].trim() };

  const displayMatch = body.match(BIND_DISPLAY_RE);
  if (displayMatch) return { type: "display", name: displayMatch[1].trim() };

  return null;
}

export function isWecomBotHelpQuery(text: string): boolean {
  const cmd = stripWecomCommandPrefix(text);
  if (/^(帮助|指令|命令|能做什么|help|commands)$/i.test(cmd)) return true;
  const atMatch = text.trim().match(/^@(.+)\s+(帮助|指令|命令|能做什么|help|commands)\s*$/i);
  if (!atMatch) return false;
  return /^[\w.\s-]{1,40}$/.test(atMatch[1].trim());
}

export function formatWecomBotHelpReply(): string {
  return [
    "**Partner Hub 企微助手 · 常用指令**",
    "",
    "**身份绑定**",
    "• `@我 我是谁` — 查看 userid 与绑定状态",
    "• `@我 绑定` — 绑定说明（推荐用 Web 生成绑定码）",
    "• `@我 绑定 XXXXXX` — 使用个人中心生成的 6 位绑定码完成企微绑定",
    "• `@我 绑定 CRM chenmin` — 设置 CRM 销售账号（需已完成企微绑定）",
    "• `@我 绑定 显示名 saber-陈敏` — 设置群聊显示名（可选）",
    "",
    "**Agent 创建（自动化工作流）**",
    "• `@我 创建一个 Agent：每天扫描…` → 多轮澄清目标/触发/推送方式 → `@我 确认`",
    "• `@我 试运行` — 创建后立即执行一次",
    "",
    "**录入（仅保存 Partner Hub，商务记录另同步 CRM）**",
    "• `@我 帮我记个商务记录…` → `@我 确认`",
    "• `@我 记个待办…` / `@我 添加商机…` / `@我 加联系人…` → `@我 确认`",
    "",
    "**查询与协作**",
    "• 直接 @我 提问：伙伴档案、Tier、待办、商机等",
    "",
    "Web 个人中心：/account → 身份绑定",
  ].join("\n");
}

async function findHubUserByWecomUserId(fromUserId: string) {
  return db.user.findFirst({
    where: { wecomUserId: fromUserId },
    select: {
      id: true,
      name: true,
      wecomUserId: true,
      wecomDisplayName: true,
      crmSalesmanName: true,
    },
  });
}

export async function redeemWecomBindCode(fromUserId: string, code: string) {
  const wecomUserId = sanitizeWecomUserId(fromUserId);
  if (!isValidWecomUserId(wecomUserId)) {
    return { error: "无法识别你的企微 userid，请稍后重试或联系管理员" };
  }

  const normalizedCode = code.trim().toUpperCase();
  const user = await db.user.findFirst({
    where: {
      wecomBindCode: normalizedCode,
      wecomBindCodeExpiresAt: { gt: new Date() },
    },
    select: { id: true, name: true, wecomUserId: true },
  });
  if (!user) return { error: "绑定码无效或已过期，请在 Web 个人中心重新生成" };

  const taken = await db.user.findFirst({
    where: { wecomUserId, NOT: { id: user.id } },
    select: { name: true },
  });
  if (taken) return { error: `该企微账号已被「${taken.name}」绑定` };

  await db.user.update({
    where: { id: user.id },
    data: {
      wecomUserId,
      wecomBindCode: null,
      wecomBindCodeExpiresAt: null,
    },
  });

  return { ok: true as const, userName: user.name, wecomUserId };
}

export async function bindWecomCrmForSender(fromUserId: string, crmSalesmanName: string) {
  const hubUser = await findHubUserByWecomUserId(fromUserId);
  if (!hubUser) {
    return { error: "尚未完成企微绑定。请先在 Web 个人中心生成绑定码，再发送 `@我 绑定 XXXXXX`" };
  }

  const name = crmSalesmanName.trim();
  if (!name) return { error: "请指定 CRM 销售英文名，例如：@我 绑定 CRM chenmin" };

  await db.user.update({
    where: { id: hubUser.id },
    data: { crmSalesmanName: name },
  });

  return { ok: true as const, userName: hubUser.name, crmSalesmanName: name };
}

export async function bindWecomDisplayForSender(fromUserId: string, displayName: string) {
  const hubUser = await findHubUserByWecomUserId(fromUserId);
  if (!hubUser) {
    return { error: "尚未完成企微绑定。请先用绑定码完成 `@我 绑定 XXXXXX`" };
  }

  const wecomDisplayName = sanitizeWecomDisplayName(displayName);
  if (!isValidWecomDisplayName(wecomDisplayName)) {
    return { error: "显示名格式无效，请使用群聊里显示的名字（如 saber-陈敏）" };
  }

  const rows = await db.user.findMany({
    where: { wecomDisplayName: { not: null }, NOT: { id: hubUser.id } },
    select: { name: true, wecomDisplayName: true },
  });
  const lower = wecomDisplayName.toLowerCase();
  const taken = rows.find((r) => r.wecomDisplayName?.toLowerCase() === lower);
  if (taken) return { error: `该显示名已被「${taken.name}」使用` };

  await db.user.update({
    where: { id: hubUser.id },
    data: { wecomDisplayName },
  });

  return { ok: true as const, userName: hubUser.name, wecomDisplayName };
}

export async function handleWecomBindCommand(
  command: WecomBindCommand,
  fromUserId: string | null,
): Promise<string> {
  const userid = fromUserId?.trim() || null;

  if (command.type === "help" || command.type === "auto") {
    const lines = [
      "**企微身份绑定**",
      "",
      userid ? `• 你的 userid：\`${userid}\`` : "• 未能读取 userid，请重试",
      "",
      "**推荐（30 秒完成）**",
      "1. Web 打开 **个人中心 → 身份绑定**",
      "2. 点击 **生成企微绑定码**（6 位，15 分钟有效）",
      "3. 在群里发送：`@我 绑定 XXXXXX`",
      "4. 可选：`@我 绑定 CRM chenmin`",
      "",
      "也可在 Web 手动粘贴 userid 保存。",
      "",
      "发送 `@我 帮助` 查看全部指令。",
    ];

    if (userid) {
      const hubUser = await findHubUserByWecomUserId(userid);
      if (hubUser) {
        lines.splice(
          3,
          0,
          `• 已绑定 Hub 账号：**${hubUser.name}**`,
          `• CRM：${hubUser.crmSalesmanName ? `✅ ${hubUser.crmSalesmanName}` : "❌ 未绑定（可 @我 绑定 CRM xxx）"}`,
        );
      }
    }

    return lines.join("\n");
  }

  if (!userid) return "未能识别发消息者 userid，请稍后重试。";

  if (command.type === "redeem") {
    const result = await redeemWecomBindCode(userid, command.code);
    if ("error" in result) return `❌ ${result.error}`;
    return [
      `✅ **企微绑定成功**`,
      "",
      `• Hub 账号：**${result.userName}**`,
      `• 企微 userid：\`${result.wecomUserId}\``,
      "",
      "若 CRM 尚未绑定，可发送：`@我 绑定 CRM 你的销售英文名`",
    ].join("\n");
  }

  if (command.type === "crm") {
    const result = await bindWecomCrmForSender(userid, command.name);
    if ("error" in result) return `❌ ${result.error}`;
    return `✅ 已将 **${result.userName}** 的 CRM 销售设为 **${result.crmSalesmanName}**。`;
  }

  if (command.type === "display") {
    const result = await bindWecomDisplayForSender(userid, command.name);
    if ("error" in result) return `❌ ${result.error}`;
    return `✅ 已将 **${result.userName}** 的企微显示名设为 **${result.wecomDisplayName}**。`;
  }

  return formatWecomBotHelpReply();
}
