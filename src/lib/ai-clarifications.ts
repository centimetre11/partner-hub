/**
 * Unified AI clarification model — shared by Intake, Agent Builder, Automation Builder.
 *
 * Two tiers:
 * - **required** — uncertainty gate: AI cannot proceed until user picks (blocks input & ready).
 * - **preference** — optional refine: AI already assumed the first option; user may adjust without blocking.
 */

export type ClarificationTier = "required" | "preference";

export type ClarificationControl = "choice" | "select";

export type AiClarification = {
  id: string;
  question: string;
  options: string[];
  multi?: boolean;
  allowOther?: boolean;
  /** choice = 少量选项卡片；select = 系统列表下拉（伙伴/群/邮箱等） */
  control?: ClarificationControl;
  /** select 控件的空选项文案 */
  placeholder?: string;
  /** required = must answer; preference = optional, defaults to first option */
  tier?: ClarificationTier;
  /** Legacy alias: true → required, false → preference */
  blocking?: boolean;
  /** Intake: direct write to draft vs batch to LLM */
  apply?: "direct" | "ai";
  kind?: "identity" | "field";
  /** Override default (otherwise options[0]) */
  defaultOption?: string;
};

export type ClarificationAnswer = { id: string; question: string; value: string };

export function getClarificationTier(c: AiClarification): ClarificationTier {
  if (c.tier === "required" || c.tier === "preference") return c.tier;
  if (c.blocking === true) return "required";
  if (c.blocking === false) return "preference";
  if (c.kind === "identity") return "required";
  return "required";
}

export function getDefaultOption(c: AiClarification): string {
  const d = c.defaultOption?.trim();
  if (d) return d;
  return c.options[0]?.trim() ?? "";
}

export function partitionClarificationsByTier(clarifications: AiClarification[]) {
  const required: AiClarification[] = [];
  const preference: AiClarification[] = [];
  for (const c of clarifications) {
    (getClarificationTier(c) === "required" ? required : preference).push(c);
  }
  return { required, preference };
}

export function hasRequiredClarifications(clarifications: AiClarification[]): boolean {
  return clarifications.some((c) => getClarificationTier(c) === "required");
}

/** Blocks free-form chat until required items are answered */
export function shouldBlockChatInput(clarifications: AiClarification[]): boolean {
  return hasRequiredClarifications(clarifications);
}

export function normalizeAiClarification(
  raw: Partial<AiClarification> | null,
  index: number,
  opts?: { defaultTier?: ClarificationTier }
): AiClarification | null {
  if (!raw || typeof raw.question !== "string") return null;
  const maxOptions = raw.control === "select" ? 200 : 6;
  const options = Array.isArray(raw.options)
    ? raw.options.map((o) => String(o).trim()).filter(Boolean).slice(0, maxOptions)
    : [];
  if (!options.length) return null;
  const tier =
    raw.tier ??
    (raw.blocking === false ? "preference" : raw.blocking === true ? "required" : opts?.defaultTier ?? "required");
  const control: ClarificationControl = raw.control === "select" ? "select" : "choice";
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : `confirm-${index}`,
    question: raw.question.trim(),
    options,
    multi: raw.multi,
    allowOther: control === "select" ? raw.allowOther !== false : raw.allowOther,
    control,
    placeholder: raw.placeholder?.trim() || undefined,
    tier,
    blocking: tier === "required",
    apply: raw.apply,
    kind: raw.kind,
    defaultOption: raw.defaultOption?.trim() || options[0],
  };
}

export function normalizeAiClarifications(
  raw: unknown,
  opts?: { defaultTier?: ClarificationTier; max?: number }
): AiClarification[] {
  const max = opts?.max ?? 4;
  const out: AiClarification[] = [];
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length && out.length < max; i++) {
      const c = normalizeAiClarification(raw[i] as Partial<AiClarification>, i, opts);
      if (c) out.push(c);
    }
  }
  return out;
}

/** Compact clarification rules for Intake JSON schemas (avoid duplicating long examples in buildOutputSchema). */
export function intakeClarificationHint(locale: "zh" | "en"): string {
  if (locale === "zh") {
    return `[clarifications 规则 — 最多 3 条]
- 字段: id, question, options(2-4,首项=默认), tier(required|preference), kind(identity|field), apply(direct|ai)
- tier:required 仅真歧义(多公司名/多官网/search_partners 近似匹配); KMS/用户已给唯一公司名+官网 → 直接写 proposal，勿 blocking
- dedupe: id=dedupe, kind=identity, tier=required, apply=ai
- 档案字段(country/headcount等): tier=preference; 汇报线缺失时最多 1 条
- 勿列举伙伴列表/邮箱/企微群 — 系统 UI 处理; ready=true 时无未答 tier:required`;
  }
  return `[clarifications — max 3]
- Fields: id, question, options(2-4; first=default), tier(required|preference), kind(identity|field), apply(direct|ai)
- tier:required only for genuine ambiguity (multiple names/URLs, search_partners near-matches); if KMS/user gives one clear name+website → write proposal directly
- dedupe: id=dedupe, kind=identity, tier=required, apply=ai
- Profile fields: tier=preference; at most one clarification for missing reporting line
- Do NOT list partners/emails/WeCom groups — server UI handles; ready=true requires no unanswered tier:required`;
}

/** Prompt appendix for LLM JSON schemas */
export function clarificationSchemaHint(locale: "zh" | "en"): string {
  if (locale === "zh") {
    return `clarifications[] 每条含 id, question, options (2-4 个，第一项为推荐默认值), tier:
- tier:"required" — 信息缺失/歧义，不回答不能继续（如：目标不明、多家公司匹配、交付方式未定）
- tier:"preference" — 可选项，不阻碍继续（如：9:00 还是 10:00、每天还是每周）；AI 已按第一项写入草案，用户可稍后调整
preference 时仍可在 reply 中说明已采用的默认值。ready=true 时不得残留 tier:"required" 未答项。`;
  }
  return `clarifications[] each: id, question, options (2-4; FIRST = recommended default), tier:
- tier:"required" — missing/ambiguous info; user must answer before proceeding (unclear goal, company disambiguation, delivery unset)
- tier:"preference" — optional refine; does NOT block (9:00 vs 10:00, daily vs weekly); AI already applied the first option to the draft
For preference items, mention the assumed default in reply. ready=true only when no unanswered tier:"required" items remain.`;
}

export function formatClarificationAnswers(answers: ClarificationAnswer[], locale: "zh" | "en" = "zh"): string {
  const prefix = locale === "zh" ? "【确认选择】" : "[Confirmations]";
  const sep = locale === "zh" ? "：" : ": ";
  return `${prefix}\n${answers.map((a, i) => `${i + 1}. ${a.question}${sep}${a.value}`).join("\n")}`;
}

export function formatPreferencePick(answer: ClarificationAnswer, locale: "zh" | "en" = "zh"): string {
  const prefix = locale === "zh" ? "【偏好调整】" : "[Preference]";
  const sep = locale === "zh" ? "：" : ": ";
  return `${prefix} ${answer.question}${sep}${answer.value}`;
}
