import { parseKmsDisplayUrl, extractKmsUrls } from "./kms";
import { runSkill, newSkillContext } from "./skills";
import { emitTraceResultChunks, nextTraceId, summarizeToolResult, toolTraceStep, type TraceEmitter } from "./ai-trace";
import type { Locale } from "./i18n/locale";
import type { IntakeScope } from "./ai-locale";
import { intakeScopePrefetchesPublicResearch as scopePrefetchesResearch } from "./proposal-scope";

export function intakeScopePrefetchesPublicResearch(scope: IntakeScope): boolean {
  return scopePrefetchesResearch(scope);
}

/** Infer company/account name for parallel web + LinkedIn prefetch. */
export function inferCompanyNameForPublicResearch(userText: string, kmsContent?: string): string | null {
  if (kmsContent) {
    const bracket = kmsContent.match(/^\[([^\]]+)\]/m);
    if (bracket?.[1]?.trim()) return bracket[1].trim();
  }

  for (const url of extractKmsUrls(userText)) {
    const display = parseKmsDisplayUrl(url);
    if (display?.title?.trim()) return display.title.trim();
  }

  const trimmed = userText.trim();
  if (
    trimmed &&
    trimmed.length <= 80 &&
    !trimmed.includes("\n") &&
    !/^https?:\/\//i.test(trimmed) &&
    !/^【确认|^确认选择/i.test(trimmed)
  ) {
    return trimmed;
  }

  return null;
}

function regionHint(text: string): string | undefined {
  const m = text.match(
    /\b(UAE|Dubai|Abu Dhabi|Saudi Arabia|Riyadh|Jeddah|Qatar|Kuwait|Bahrain|Oman|Middle East|Ethiopia|KSA)\b/i
  );
  return m?.[1];
}

function buildWebQuery(company: string, hint?: string): string {
  const region = hint ? ` ${hint}` : " Middle East";
  return `${company}${region} company website official partner`.replace(/\s+/g, " ").trim();
}

function buildLinkedinArgs(company: string, hint?: string) {
  const region = hint ? ` ${hint}` : "";
  return {
    company,
    query: `${company}${region} LinkedIn CEO executives`.replace(/\s+/g, " ").trim(),
  };
}

export type ParallelPublicResearchResult = {
  companyName: string;
  webText: string;
  linkedinText: string;
  injectionMessage: string;
  /** Skip duplicate web_search / linkedin_search in the tool loop */
  skipToolNames: Set<string>;
};

async function runOnePublicTool(
  toolName: "web_search" | "linkedin_search",
  args: Record<string, unknown>,
  userId: string | undefined,
  emit: TraceEmitter | undefined
): Promise<string> {
  const step = toolTraceStep(toolName, args);
  emit?.({ event: "trace", step });
  const ctx = newSkillContext({ mode: "assistant", userId: userId ?? null });
  try {
    const result = await runSkill(toolName, args, ctx);
    const summary = summarizeToolResult(toolName, result);
    await emitTraceResultChunks(emit, step.id, summary);
    emit?.({ event: "trace_patch", id: step.id, patch: { status: "done" } });
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    emit?.({ event: "trace_patch", id: step.id, patch: { status: "error", error: msg.slice(0, 120) } });
    return `Error: ${msg}`;
  }
}

/**
 * Run web_search + linkedin_search in parallel before the intake tool loop.
 * Saves ~30s when the model would otherwise call them in separate rounds.
 */
export async function prefetchParallelWebLinkedinResearch(opts: {
  scope: IntakeScope;
  userText: string;
  kmsContent?: string;
  locale: Locale;
  userId?: string;
  emit?: TraceEmitter;
}): Promise<ParallelPublicResearchResult | null> {
  if (!intakeScopePrefetchesPublicResearch(opts.scope)) return null;

  const companyName = inferCompanyNameForPublicResearch(opts.userText, opts.kmsContent);
  if (!companyName) return null;

  const hint = regionHint(`${opts.kmsContent ?? ""}\n${opts.userText}`);
  const webArgs = { query: buildWebQuery(companyName, hint) };
  const linkedinArgs = buildLinkedinArgs(companyName, hint);

  const batchId = nextTraceId("reason");
  opts.emit?.({
    event: "trace",
    step: {
      type: "reasoning",
      id: batchId,
      content:
        opts.locale === "zh"
          ? `并行检索公开信息：${companyName}（网页 + LinkedIn）`
          : `Parallel public research: ${companyName} (web + LinkedIn)`,
      status: "running",
    },
  });

  const [webText, linkedinText] = await Promise.all([
    runOnePublicTool("web_search", webArgs, opts.userId, opts.emit),
    runOnePublicTool("linkedin_search", linkedinArgs, opts.userId, opts.emit),
  ]);

  opts.emit?.({
    event: "trace_patch",
    id: batchId,
    patch: { status: "done", content: opts.locale === "zh" ? "并行检索完成" : "Parallel research done" },
  });

  const injectionMessage =
    opts.locale === "zh"
      ? `[系统已并行完成 web_search 与 linkedin_search（公司：${companyName}）。请直接使用下方结果填写 proposal；除非需要不同关键词，否则勿再次调用 web_search / linkedin_search。]\n\n## web_search\n查询：${webArgs.query}\n\n${webText}\n\n## linkedin_search\n查询：${linkedinArgs.query}\n\n${linkedinText}`
      : `[System already ran web_search and linkedin_search in parallel for "${companyName}". Use the results below in your proposal; do NOT call web_search or linkedin_search again unless you need different keywords.]\n\n## web_search\nQuery: ${webArgs.query}\n\n${webText}\n\n## linkedin_search\nQuery: ${linkedinArgs.query}\n\n${linkedinText}`;

  return {
    companyName,
    webText,
    linkedinText,
    injectionMessage,
    skipToolNames: new Set(["web_search", "linkedin_search", "$web_search"]),
  };
}
