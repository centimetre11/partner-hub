import "server-only";
import {
  appendWecomBotGuideText,
  buildBotGuideTextcardDescription,
  DEFAULT_BOT_GUIDE_BTNTXT,
  wecomAppTextcardJumpUrl,
} from "../wecom-bot-guide";
import {
  isWecomAppMessageConfigured,
  parseWecomUserIds,
  resolveHubUserIdsToWecomUserIds,
  resolveHubUserNamesToWecomUserIds,
  sendWecomAppMessage,
  fitTextcardPlainBody,
  type WecomAppMessageType,
} from "../wecom-app-message";

function splitList(raw: string): string[] {
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseGuideToBot(raw: unknown): boolean {
  if (raw === false || raw === "false" || raw === "0") return false;
  return true;
}

function formatSendResult(
  recipients: string[],
  result: Awaited<ReturnType<typeof sendWecomAppMessage>>,
): string {
  if (!result.ok) return result.error;

  const lines = [
    `WeCom app message sent to ${recipients.length} userid(s): ${recipients.join(", ")}`,
  ];
  if (result.msgid) lines.push(`msgid: ${result.msgid}`);
  if (result.invaliduser?.length) lines.push(`invalid userid(s): ${result.invaliduser.join(", ")}`);
  return lines.join("; ");
}

export async function runSendWecomAppMessageTool(
  args: Record<string, unknown>,
  ctx: { actions: string[] },
): Promise<string> {
  if (!isWecomAppMessageConfigured()) {
    return "WeCom app message is not configured. Set WECOM_CORP_ID, WECOM_APP_SECRET, and WECOM_AGENT_ID on the server.";
  }

  const guideToBot = parseGuideToBot(args.guideToBot);
  const msgtypeRaw = String(args.msgtype ?? "").trim().toLowerCase();
  const titleArg = String(args.title ?? "").trim();
  const useTextcard =
    msgtypeRaw === "textcard" ||
    args.useTextcard === true ||
    args.useTextcard === "true" ||
    titleArg.length > 0;

  let content = String(args.content ?? "").trim();
  if (!content && !titleArg) return "Please provide content";

  let title = titleArg;
  let url = String(args.url ?? "").trim();
  let btntxt = String(args.btntxt ?? "").trim();

  if (useTextcard) {
    if (!title && content.includes("\n")) {
      const [first, ...rest] = content.split("\n");
      title = first.trim();
      content = rest.join("\n").trim();
    }
    if (!title) title = "Partner Hub 通知";
    if (guideToBot) {
      content = fitTextcardPlainBody(content);
      content = buildBotGuideTextcardDescription(content);
      if (!url) url = wecomAppTextcardJumpUrl();
      if (!btntxt) btntxt = DEFAULT_BOT_GUIDE_BTNTXT;
    } else {
      content = fitTextcardPlainBody(content, 40);
    }
    if (!url) return "textcard requires url (set url or guideToBot=true for default guide page)";
  } else if (guideToBot && content) {
    content = appendWecomBotGuideText(content);
  }

  const msgtype: WecomAppMessageType = useTextcard
    ? "textcard"
    : msgtypeRaw === "markdown"
      ? "markdown"
      : "text";

  const wecomUserIds: string[] = [];
  const warnings: string[] = [];

  const wecomUserIdRaw = String(args.wecomUserId ?? "").trim();
  if (wecomUserIdRaw) {
    const parsed = parseWecomUserIds(wecomUserIdRaw);
    wecomUserIds.push(...parsed.valid);
    if (parsed.invalid.length) {
      warnings.push(`invalid wecomUserId: ${parsed.invalid.join(", ")}`);
    }
  }

  const hubUserIdRaw = String(args.hubUserId ?? "").trim();
  if (hubUserIdRaw) {
    const resolved = await resolveHubUserIdsToWecomUserIds(splitList(hubUserIdRaw));
    wecomUserIds.push(...resolved.wecomUserIds);
    if (resolved.missingHubUserIds.length) {
      warnings.push(`hub user not found: ${resolved.missingHubUserIds.join(", ")}`);
    }
    if (resolved.unboundHubUserIds.length) {
      warnings.push(`hub user without wecomUserId: ${resolved.unboundHubUserIds.join(", ")}`);
    }
  }

  const hubUserNameRaw = String(args.hubUserName ?? "").trim();
  if (hubUserNameRaw) {
    const resolved = await resolveHubUserNamesToWecomUserIds(splitList(hubUserNameRaw));
    wecomUserIds.push(...resolved.wecomUserIds);
    if (resolved.missingNames.length) {
      warnings.push(`hub user name not found: ${resolved.missingNames.join(", ")}`);
    }
    if (resolved.unboundNames.length) {
      warnings.push(`hub user without wecomUserId: ${resolved.unboundNames.join(", ")}`);
    }
  }

  const recipients = [...new Set(wecomUserIds)];
  if (!recipients.length) {
    const hint = "Provide wecomUserId, hubUserId, or hubUserName (recipient must bind wecomUserId in Account settings).";
    return warnings.length ? `${warnings.join("; ")}. ${hint}` : hint;
  }

  const result = await sendWecomAppMessage({
    touser: recipients,
    content: useTextcard ? content || buildBotGuideTextcardDescription("") : content,
    msgtype,
    title: useTextcard ? title : undefined,
    url: useTextcard ? url : undefined,
    btntxt: useTextcard ? btntxt : undefined,
  });

  const msg = formatSendResult(recipients, result);
  if (!result.ok) {
    return warnings.length ? `${msg}; ${warnings.join("; ")}` : msg;
  }

  const full = warnings.length ? `${msg}; ${warnings.join("; ")}` : msg;
  ctx.actions.push(full);
  return full;
}
