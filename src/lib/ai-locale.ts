import { PARTNER_FIELD_LABELS, SOLUTION_STATUS_LABELS } from "./constants";
import { getLabels, type LabelsBundle } from "./i18n";
import type { Locale } from "./i18n/locale";

export type IntakeScope =
  | "new_partner"
  | "powermap"
  | "opportunity"
  | "profile"
  | "training"
  | "solution"
  | "business_record"
  | "todo";

export function replyLanguage(locale: Locale): "Chinese" | "English" {
  return locale === "zh" ? "Chinese" : "English";
}

export function partnerFieldLabels(locale: Locale): Record<string, string> {
  return getLabels(locale).partnerFieldLabels;
}

export function fieldLabel(locale: Locale, field: string): string {
  return partnerFieldLabels(locale)[field] ?? PARTNER_FIELD_LABELS[field] ?? field;
}

function listSep(locale: Locale): string {
  return locale === "zh" ? "、" : ", ";
}

export function fieldListForAi(locale: Locale): string {
  const sep = listSep(locale);
  return Object.entries(partnerFieldLabels(locale))
    .map(([f, l]) => `${f}(${l})`)
    .join(sep);
}

export function categoryListForAi(locale: Locale): string {
  const labels = getLabels(locale);
  return Object.entries(labels.categoryLabels)
    .map(([k, v]) => `${k}=${v}`)
    .join(listSep(locale));
}

export function industryListForAi(locale: Locale): string {
  const labels = getLabels(locale);
  return Object.entries(labels.industryLabels)
    .map(([k, v]) => `${k}=${v}`)
    .join(listSep(locale));
}

export function stageListForAi(locale: Locale): string {
  const labels = getLabels(locale);
  return labels.pipelineStages.map((s) => `${s.stage}=${s.name}`).join(listSep(locale));
}

/** Which proposal keys are free-text and should match UI language */
const FREE_TEXT_FIELD_KEYS = new Set([
  "name",
  "city",
  "country",
  "headcount",
  "website",
  "companyType",
  "coreBusiness",
  "capability",
  "knownClients",
  "certLevel",
  "currentTools",
  "keyDifferentiator",
  "playbook",
  "pitch",
  "bestChannel",
  "priority",
  "dedicatedHeadcount",
  "valuePartnerOffer",
  "valueFanruanOffer",
  "valueCustomerOutcome",
  "notes",
]);

export function localeOutputRules(locale: Locale): string {
  const lang = replyLanguage(locale);
  const fieldLabels = partnerFieldLabels(locale);
  const freeTextExamples = ["valuePartnerOffer", "valueFanruanOffer", "playbook", "coreBusiness", "notes"]
    .map((f) => `${f}(${fieldLabels[f]})`)
    .join(locale === "zh" ? "、" : ", ");

  return `[User interface language: ${lang} (${locale})]
- User-facing text MUST be in ${lang}: reply, questions, clarifications.question, clarifications.options, proposal.summary, todos (title/detail), contact approach/notes/reason, solution descriptions (name/targetCustomer/painPoint/fanruanOffer/partnerOffer/pricingModel/notes/reason), fieldUpdates.reason.
- Free-text profile fields (${freeTextExamples}, etc.) → write newValue in ${lang}.
- fieldUpdates.label → use the ${lang} display name from the field list (e.g. valuePartnerOffer → "${fieldLabels.valuePartnerOffer}").
- JSON property names and stored enum codes stay English: field keys (country, category, …), category=POWER_BI, industries JSON array of BANKING/GOVERNMENT codes, role=DECISION_MAKER, pipelineStage as number 1–10, tier as A/B/C only (never numbers, "Tier 1", P0/P1, or fitScore), training/solution status codes (PLANNED/DRAFT/…), priority HIGH/MEDIUM/LOW for todos only.
- Person names and company names: keep as found in source material (may be English or local language).`;
}

export function buildOutputSchema(scope: IntakeScope, locale: Locale): string {
  const lang = replyLanguage(locale);
  const fl = fieldListForAi(locale);
  const clarifyExample =
    locale === "zh"
      ? `{ "id":"country", "question":"该公司主要在哪个国家？", "options":["阿联酋","沙特","卡塔尔","埃及"], "multi":false, "allowOther":true, "apply":"direct", "kind":"field" }`
      : `{ "id":"country", "question":"Which country is this company primarily in?", "options":["UAE","Saudi Arabia","Qatar","Egypt"], "multi":false, "allowOther":true, "apply":"direct", "kind":"field" }`;
  const identityExample =
    locale === "zh"
      ? `{ "id":"partnerName", "question":"确认是哪家公司？", "options":["Beinex Analytics","Beinex IT Solutions"], "multi":false, "allowOther":true, "apply":"direct", "kind":"identity", "blocking":true }`
      : `{ "id":"partnerName", "question":"Which company is this?", "options":["Beinex Analytics","Beinex IT Solutions"], "multi":false, "allowOther":true, "apply":"direct", "kind":"identity", "blocking":true }`;

  if (scope === "business_record") {
    return `Output a single JSON object. User-facing strings in ${lang}:
{
  "reply": "Your message to the user (${lang}, brief; confirm what you extracted)",
  "questions": [],
  "clarifications": [],
  "ready": true/false,
  "proposal": {
    "partnerName": "(when session is open/unbound: company this record belongs to; omit when partner is pre-bound)",
    "summary": "One-line summary of milestone(s) to save (${lang})",
    "fields": [],
    "contacts": [],
    "opportunities": [],
    "todos": [],
    "trainings": [],
    "solutions": [],
    "businessRecords": [{
      "title": "Short headline e.g. visited VP / scheduled L2 training (${lang})",
      "content": "Optional details (${lang})",
      "category": "VISIT|TRAINING|NEGOTIATION|DELIVERY|RELATIONSHIP|OTHER",
      "occurredAt": "YYYY-MM-DD (default today if unclear)",
      "contactName": "optional: name matching existing contact",
      "reason": "source snippet (${lang})"
    }]
  }
}
Rules:
- Fill businessRecords only; fields/contacts/opportunities/todos/trainings/solutions MUST stay empty arrays.
- This is NOT partner onboarding — never emit profile fields (website, category, headcount, etc.).
- When partner is pre-bound in [伙伴绑定], omit partnerName entirely.
- One user message may yield multiple businessRecords if they describe several milestones.
- category: VISIT=meetings/visits; TRAINING=training/cert scheduling; NEGOTIATION=deals/terms; DELIVERY=contract/first delivery; RELATIONSHIP=relationship building; OTHER=rest.
- Extract only from user text; do not invent. ready=true when at least one record has a clear title.`;
  }

  if (scope === "todo") {
    return `Output a single JSON object. User-facing strings in ${lang}:
{
  "reply": "Your message to the user (${lang}, brief)",
  "questions": [],
  "clarifications": [],
  "ready": true/false,
  "proposal": {
    "partnerName": "(optional: company to link this todo; omit for personal/global todos)",
    "summary": "One-line summary (${lang})",
    "fields": [],
    "contacts": [],
    "opportunities": [],
    "todos": [{"title":"...","dueDate":"YYYY-MM-DD","priority":"HIGH|MEDIUM|LOW","detail":"..."}],
    "trainings": [],
    "solutions": [],
    "businessRecords": []
  }
}
Rules:
- Fill todos only; other arrays must be empty.
- ready=true when at least one todo has a clear title.
- partnerName only when user mentions a specific company/partner.`;
  }

  if (scope === "powermap") {
    const reportsExample =
      locale === "zh"
        ? `{ "id":"reportsTo", "question":"{name} 向谁汇报？", "options":["现有联系人姓名","顶层","未知"], "multi":false, "allowOther":true }`
        : `{ "id":"reportsTo", "question":"Who does {name} report to?", "options":["existing contact name","Top level","Unknown"], "multi":false, "allowOther":true }`;
    return `Output a single JSON object. User-facing strings in ${lang}:
{
  "reply": "Your message to the user (${lang}, brief)",
  "questions": [],
  "clarifications": [
    ${reportsExample}
  ],
  "ready": true/false,
  "proposal": {
    "summary": "One-line summary of people identified (${lang})",
    "fields": [],
    "contacts": [{"action":"add|update","id":"(when update)","name":"...","role":"APPROVER|DECISION_MAKER|SUPPORTER|EVALUATOR|INFLUENCER","title":"...","department":"...","attitude":0,"reportsToName":"...","contactInfo":"...","reason":"source in material (${lang})"}],
    "opportunities": [],
    "todos": [],
    "trainings": [],
    "solutions": []
  }
}
Rules:
- Fill contacts only; keep fields/opportunities/todos/trainings/solutions as empty arrays.
- Extract only from material (text/image); cite reason; do not invent.
- Match [Existing contacts] for add vs update (update must include id).
- ready=true when core info is enough; use clarifications only for missing reporting lines.
- role/attitude use English codes; title/department/reason may be ${lang}.`;
  }

  return `Output a single JSON object only. User-facing strings in ${lang}. Structure:
{
  "reply": "Your message to the user (${lang}, natural tone; ask clarifications here, at most 1–2 key points)",
  "questions": ["clarification point 1", "..."],
  "clarifications": [
    ${clarifyExample}
  ],
  "ready": true/false,
  "proposal": {
    "partnerName": "(new_partner only: company name)",
    "summary": "One-line summary of what will be saved (${lang})",
    "fields": [{"field":"...","label":"${lang} field display name","oldValue":"...","newValue":"...","reason":"source (${lang})"}],
    "contacts": [{"action":"add|update","id":"(when update)","name":"...","role":"...","title":"...","department":"...","attitude":0,"reportsToName":"...","contactInfo":"...","reason":"..."}],
    "opportunities": [{"action":"add|update","id":"...","name":"...","client":"...","amount":"...","stage":"...","nextStep":"...","status":"...","reason":"..."}],
    "todos": [{"title":"...","dueDate":"YYYY-MM-DD","priority":"HIGH|MEDIUM|LOW","detail":"..."}],
    "trainings": [{"person":"...","currentSkill":"...","targetCert":"...","deadline":"YYYY-MM-DD","status":"PLANNED|IN_PROGRESS|DONE","reason":"..."}],
    "solutions": [{"name":"...","targetCustomer":"...","painPoint":"...","fanruanOffer":"...","partnerOffer":"...","pricingModel":"...","status":"...","reason":"..."}],
    "businessRecords": []
  }
}
Field codes for fields array: ${fl}.
Rules:
- Extract only supported content from user text or tool results; cite reason. Do not invent beyond tools.
- ready: true when required fields are present. If user says save now / that's all, ready must be true.
- proposal accumulates confirmed content each turn (do not clear prior extractions).
- clarifications: when key info is missing and you can enumerate options, give 1–3 multiple-choice items (id = English field name e.g. country/category/headcount; options in ${lang}).
- Identity checkpoints (new_partner): when company name is ambiguous (multiple candidates), website uncertain, or search_partners finds similar records, emit kind:"identity" + blocking:true clarifications BEFORE claiming ready. Examples:
  · partnerName — ${identityExample}
  · website — id:"website", kind:"identity", blocking:true, apply:"direct", options = candidate URLs + "No website yet"
  · dedupe — id:"dedupe", kind:"identity", blocking:true, apply:"ai", options = existing partner names + "Create new anyway"
- For profile field ids (country, headcount, category, industry, pipelineStage, etc.) set apply:"direct", kind:"field".
- For reporting lines or ambiguous context, set apply:"ai". Empty clarifications array if none needed.`;
}

export function schemaHintForScope(scope: IntakeScope, locale: Locale): string {
  const fl = fieldListForAi(locale);
  const cat = categoryListForAi(locale);
  const ind = industryListForAi(locale);
  const st = stageListForAi(locale);
  const solutionStatuses = Object.keys(SOLUTION_STATUS_LABELS).join("/");

  switch (scope) {
    case "new_partner":
      return `Set partnerName to the company name; fill other profile fields in fields (field names only: ${fl}; category values: ${cat}; industry values: ${ind}; pipelineStage 1–10: ${st}); add contacts if people appear in text/research, opportunities if deals are mentioned. Leave trainings/solutions as empty arrays.`;
    case "powermap":
      return "Fill contacts only (action=add or update with id). Leave fields/opportunities/todos/trainings/solutions as empty arrays.";
    case "opportunity":
      return "Fill opportunities only. Leave others as empty arrays.";
    case "profile":
      return `Fill fields only (FieldUpdate; oldValue may be empty). Field names: ${fl} (category: ${cat}; industry: ${ind}). Use tools when info is insufficient. Leave others as empty arrays.`;
    case "training":
      return "Fill trainings only. Leave others as empty arrays.";
    case "solution":
      return `Fill solutions only. status codes: ${solutionStatuses}. Leave others as empty arrays.`;
    case "business_record":
      return "Fill businessRecords only (title required). Leave fields/contacts/opportunities/todos/trainings/solutions as empty arrays.";
    case "todo":
      return "Fill todos only. Leave fields/contacts/opportunities/trainings/solutions/businessRecords as empty arrays.";
  }
}

const RESEARCH_GUIDE = `[Proactive research (important)]
Goal: fill onboarding fields as completely as possible. All inputs (name only, long text, KMS link, chat) should use multi-source stacking—not one source only.
Before outputting the JSON proposal, combine tools as below (parallel OK, multiple calls OK):

[Web search language — mandatory]
- web_search and linkedin_search queries MUST be English keywords only (never Chinese). Middle East / international partners are indexed better in English.
- Query patterns (adapt company/country/product):
  · "{Company} {Country} company website official"
  · "{Company} SAP Business One partner {Country} contact"
  · "{Company} LinkedIn executives CEO CTO"
  · "{Company} clients case study Middle East"
- If the user pasted Chinese text, extract the English company name / country before searching.

1. User gave KMS link/pageId → read_kms first; then web_search + linkedin_search on company names from the doc for website, size, clients, key people not in KMS
2. After identifying company name from user/KMS → search_partners dedupe; web_search background; linkedin_search executives/contacts
3. Still missing category/playbook/Fanruan angle → search_knowledge team knowledge base
4. After each tool round, check field checklist; keep researching until major fields are sourced or public channels truly have nothing
5. If a tool fails, skip it and use others—do not block onboarding. Do NOT assume KMS is unconfigured without calling read_kms when [KMS token status] says configured.
6. After research, output JSON proposal (no more tools); in reply briefly note what each source found and what is still missing`;

function kmsStatusBlock(locale: Locale, configured: boolean): string {
  if (locale === "zh") {
    return configured
      ? "【KMS 令牌状态】已配置。用户提供 KMS 链接时，系统会自动预读并注入内容；也可调用 read_kms（支持 pageId 与 /display/ 链接）。禁止说「KMS 未配置」。"
      : "【KMS 令牌状态】未配置。跳过 read_kms，改用 web_search、linkedin_search 等公开渠道。";
  }
  return configured
    ? "[KMS token status] Configured. KMS links are auto pre-fetched; you may also call read_kms (pageId and /display/ URLs). Do NOT say KMS is unconfigured."
    : "[KMS token status] Not configured. Skip read_kms; use web_search, linkedin_search, and other public sources.";
}

type ScopeConfig = {
  title: string;
  intro: string;
  guide: string;
};

const SCOPE_CONFIG: Record<IntakeScope, ScopeConfig> = {
  new_partner: {
    title: "New partner onboarding",
    intro:
      "The user wants to create a new prospect partner. Input may be: company name only, long meeting/chat text, company intro, or a Fanruan KMS link (combine KMS with web/LinkedIn research; goal is to fill the profile as completely as possible).",
    guide: `Minimum for onboarding: company name (partnerName, required). Try to fill: category, industry, country/city, headcount, website, coreBusiness, capability, knownClients, currentTools, playbook, tier (A/B/C). If key items are missing, ask 1–2 friendly follow-ups, but research proactively first (see tool notes below).

Identity checkpoints (important):
- After search_partners or when research finds multiple company name/website candidates, emit blocking identity clarifications (kind:"identity", blocking:true) for partnerName and/or website — do NOT set ready=true while blocking clarifications remain.
- When search_partners finds a close match, emit dedupe clarification (id:"dedupe", apply:"ai") with options = matched partner name(s) + "Create new anyway".
- Once user confirms identity via clarification, continue deep research and fill profile fields.`,
  },
  powermap: {
    title: "Add power map contact",
    intro:
      "The user wants to add or update people on this partner's power map. Extract person attributes directly from user text or images (business cards, meeting notes, org charts, chat screenshots). No web research needed.",
    guide: `Extract only what is supported by the material (text/image). Do not invent, guess, or search the web. For each person try to extract:
- name
- title, department
- role: APPROVER/DECISION_MAKER/SUPPORTER/EVALUATOR/INFLUENCER
- attitude score: 3=champion/2=supportive exclusive/1=supportive non-exclusive/0=neutral/-1=opposed
- reportsToName (when reporting/line-of-command is clear; prefer names from existing contacts below)
Decide add (action=add) vs update (action=update with id) against the existing list. Leave unknown fields empty; don't over-ask. Only when reporting line is clearly missing, use one structured clarification for reporting line with options = existing contact names + top level + unknown.`,
  },
  opportunity: {
    title: "Add opportunity",
    intro: "The user wants to add or update an opportunity for this partner.",
    guide: "For each opportunity try: client, amount, stage, nextStep. Ask one question if key info is missing.",
  },
  profile: {
    title: "Complete partner profile",
    intro: "The user wants to fill or update profile fields. May include a KMS link or scattered notes; combine existing record with tool research.",
    guide: "Map user input and research to profile fields. Use tools when info is insufficient.",
  },
  training: {
    title: "Add training plan",
    intro: "The user wants to schedule capability training/certification for this partner (e.g. FCA-FineBI, FCA-FineReport).",
    guide:
      "Per training try: person (required), currentSkill, targetCert, deadline (YYYY-MM-DD), status (PLANNED/IN_PROGRESS/DONE). Ask if person is missing.",
  },
  solution: {
    title: "Add joint solution",
    intro: "The user wants to capture a co-created joint solution with this partner.",
    guide: `Per solution try: name (required), targetCustomer, painPoint, fanruanOffer, partnerOffer, pricingModel, status (${Object.keys(SOLUTION_STATUS_LABELS).join("/")}).`,
  },
  business_record: {
    title: "Log business milestone",
    intro:
      "The user wants to record key business progress for this partner (visits, training scheduled, negotiations, delivery, relationship events). Input is usually free-form notes or chat paste—extract structured milestone(s).",
    guide: `From user text extract one or more businessRecords:
- title (required): concise headline in natural language
- content: optional details
- category: VISIT / TRAINING / NEGOTIATION / DELIVERY / RELATIONSHIP / OTHER
- occurredAt: YYYY-MM-DD if mentioned, else today
- contactName: if a known contact from [Existing contacts] is involved
No web research. ready=true when title(s) are clear. User may paste meeting notes, WeCom chat, or a short sentence like "visited their VP yesterday".`,
  },
  todo: {
    title: "Create todo",
    intro: "The user wants to create one or more follow-up todos. May or may not relate to a specific partner.",
    guide: `Extract todos with title (required), optional dueDate (YYYY-MM-DD), priority (HIGH/MEDIUM/LOW), detail.
If user names a company/partner, set proposal.partnerName. Global todos (no company) are OK.
No web research. ready=true when title is clear.`,
  },
};

export function buildIntakeSystemPrompt(opts: {
  locale: Locale;
  scope: IntakeScope;
  today: string;
  taxonomyHint: string;
  partnerContext?: string;
  partnerBinding?: string;
  useResearch: boolean;
  kmsConfigured?: boolean;
}): string {
  const cfg = SCOPE_CONFIG[opts.scope];
  const lang = replyLanguage(opts.locale);
  const ctx = opts.partnerContext ? `\n\n${opts.partnerContext}` : "";
  const kmsHint = opts.useResearch ? `\n${kmsStatusBlock(opts.locale, !!opts.kmsConfigured)}` : "";

  return `You are the AI intake assistant for Fanruan Software (Fanruan, leading BI vendor in China; products FineReport/FineBI/FineDataLink) Middle East partner management.
Today's date: ${opts.today}.
Current task: ${cfg.title}. ${cfg.intro}

${localeOutputRules(opts.locale)}

[Guidance rules (important, not rigid)]
${cfg.guide}
Follow-ups should feel like a colleague—natural and brief, not a form. When the user has given enough, produce the proposal and set ready=true; don't chase optional fields.
${opts.useResearch ? `\n${RESEARCH_GUIDE}${kmsHint}` : ""}

${opts.partnerBinding ? `\n${opts.partnerBinding}\n` : ""}
[Proposal scope for this task]
${schemaHintForScope(opts.scope, opts.locale)}
${opts.taxonomyHint}
${ctx}

${buildOutputSchema(opts.scope, opts.locale)}`;
}

/** Compact prompt for fast AI Add scopes (single LLM call, no tools). */
export function buildFastIntakeSystemPrompt(opts: {
  locale: Locale;
  scope: IntakeScope;
  today: string;
  partnerContext?: string;
  partnerBinding?: string;
}): string {
  const cfg = SCOPE_CONFIG[opts.scope];
  const lang = replyLanguage(opts.locale);
  const ctx = opts.partnerContext ? `\n${opts.partnerContext}` : "";
  const bind = opts.partnerBinding ? `\n${opts.partnerBinding}` : "";

  return `Fast JSON extractor for Fanruan Middle East partner management. Today: ${opts.today}.
Task: ${cfg.title}. ${cfg.guide}
${bind}${ctx}

${localeOutputRules(opts.locale)}

${schemaHintForScope(opts.scope, opts.locale)}

${buildOutputSchema(opts.scope, opts.locale)}

Rules: one JSON object only; user-facing strings in ${lang}; ready=true when required items are clear; no web research; no profile/onboarding fields outside this task.`;
}

export function buildExtractSystemPrompt(locale: Locale): string {
  const fl = fieldListForAi(locale);
  const st = stageListForAi(locale);
  const lang = replyLanguage(locale);

  return `You are an information extraction engine for Fanruan Software (leading BI vendor in China; products FineReport / FineBI / FineDataLink) Middle East partner management.
The user provides raw text (meeting notes, WhatsApp/chat, email, news, etc.) and the current partner profile.
Compare text to the profile and output a JSON proposal of updates.

${localeOutputRules(locale)}

Rules:
1. Propose only changes supported by the text; attach reason (quote key phrase). Do not invent.
2. fieldUpdates only for: ${fl}. newValue always string; pipelineStage 1-10 (${st}); tier must be A, B, or C only.
3. People in text (power map): action=add if new; action=update with id if existing with new info (title, dept, attitude, reporting, contact). Fields:
   - role: APPROVER/DECISION_MAKER/SUPPORTER/EVALUATOR/INFLUENCER
   - attitude: 3=champion/2=supportive exclusive/1=supportive non-exclusive/0=neutral/-1=opposed
   - department; reportsToName when reporting line is clear
4. Opportunities: action=add for new; action=update with id for amount/stage/progress changes.
5. todos: commitments and next steps from text (${lang} titles; dueDate YYYY-MM-DD if known; priority HIGH/MEDIUM/LOW).
6. summary: 3-6 sentences on key info (${lang}); summaryTitle one-line ${lang} title.
7. signals: notable positive or risk signals (${lang} short phrases; empty array if none).
Output JSON only:
{"summaryTitle": "...", "summary": "...", "fieldUpdates": [{"field":"...","label":"...","oldValue":"...","newValue":"...","reason":"..."}], "contacts": [...], "opportunities": [...], "todos": [...], "signals": [...]}`;
}

export function buildPatchExtractPrompt(scope: IntakeScope, locale: Locale): string {
  const fl = fieldListForAi(locale);
  const lang = replyLanguage(locale);
  const exampleLabel = fieldLabel(locale, "country");

  return `Extract structured fragments from tool output for database intake. Task scope: ${scope}. Output JSON only:
{ "ops": [
  { "op":"set_partner","name":"Company name","source":"tool name" },
  { "op":"set_summary","summary":"One sentence (${lang})" },
  { "op":"upsert_field","key":"field:country","field":"country","label":"${exampleLabel}","newValue":"UAE","reason":"evidence (${lang})" },
  { "op":"upsert_contact","key":"contact:Name","contact":{"action":"add","name":"Name","title":"Title","reason":"evidence (${lang})"} }
]}
Field codes only: ${fl}. Empty ops if nothing extractable. Do not fabricate.
${localeOutputRules(locale)}`;
}

export function normalizeFieldUpdateLabels<T extends { field: string; label?: string }>(
  items: T[],
  locale: Locale,
): T[] {
  return items.map((f) => ({
    ...f,
    label: fieldLabel(locale, f.field) || f.label,
  }));
}

export function partnerContextHeader(locale: Locale, partnerName: string): string {
  return locale === "zh" ? `[伙伴档案：${partnerName}]` : `[Partner profile: ${partnerName}]`;
}

export function partnerContextSection(locale: Locale, section: "contacts" | "opportunities" | "powermap"): string {
  if (locale === "zh") {
    if (section === "contacts") return "[权力地图 / 关键人物]";
    if (section === "opportunities") return "[商机]";
    return "[现有联系人]";
  }
  if (section === "contacts") return "[Power map / key people]";
  if (section === "opportunities") return "[Opportunities]";
  return "[Existing contacts]";
}

export function emptyLabel(locale: Locale): string {
  return locale === "zh" ? "（空）" : "(empty)";
}

export function noneLabel(locale: Locale): string {
  return locale === "zh" ? "（无）" : "(none)";
}

export function applyFieldMessage(locale: Locale, label: string, value: string): string {
  return locale === "zh" ? `字段「${label}」→ ${value}` : `Field "${label}" → ${value}`;
}

export function applyFieldUpdatedMessage(locale: Locale, label: string, value: string): string {
  return locale === "zh" ? `字段「${label}」已更新为：${value}` : `Field "${label}" updated to: ${value}`;
}

export function applyContactAdded(locale: Locale, name: string): string {
  return locale === "zh" ? `已添加联系人：${name}` : `Added contact: ${name}`;
}

export function applyContactUpdated(locale: Locale, name: string): string {
  return locale === "zh" ? `已更新联系人：${name}` : `Updated contact: ${name}`;
}

export function applyPartnerCreated(locale: Locale, name: string, active: boolean): string {
  if (locale === "zh") return active ? `已创建正式伙伴：${name}` : `已创建候选伙伴：${name}`;
  return active ? `Created active partner: ${name}` : `Created prospect: ${name}`;
}

export function applyOpportunityAdded(locale: Locale, name: string): string {
  return locale === "zh" ? `已添加商机：${name}` : `Added opportunity: ${name}`;
}

export function applyOpportunityUpdated(locale: Locale, name: string): string {
  return locale === "zh" ? `已更新商机：${name}` : `Updated opportunity: ${name}`;
}

export function applyTrainingAdded(locale: Locale, person: string, cert?: string): string {
  if (locale === "zh") return `已添加培训：${person}${cert ? ` → ${cert}` : ""}`;
  return `Added training: ${person}${cert ? ` → ${cert}` : ""}`;
}

export function applySolutionAdded(locale: Locale, name: string): string {
  return locale === "zh" ? `已添加联合方案：${name}` : `Added joint solution: ${name}`;
}

export function applyTodoAdded(locale: Locale, title: string): string {
  return locale === "zh" ? `已添加待办：${title}` : `Added todo: ${title}`;
}

export function applyBusinessRecordAdded(locale: Locale, title: string): string {
  return locale === "zh" ? `已记录商务进展：${title}` : `Logged business milestone: ${title}`;
}

export function defaultIntakeReply(locale: Locale): string {
  return locale === "zh" ? "我已整理好内容，请确认。" : "I've put this together—please review.";
}

export function defaultExtractSummaryTitle(locale: Locale): string {
  return locale === "zh" ? "AI 提取摘要" : "AI extraction summary";
}

export function extractFinalJsonUserMessage(locale: Locale): string {
  return locale === "zh"
    ? "根据以上对话与研究，输出最终 JSON 提案（严格按 OUTPUT_SCHEMA，仅 JSON）。"
    : "Based on the conversation and research above, output the final JSON proposal (strict OUTPUT_SCHEMA, JSON only).";
}

export function stageDisplayName(labels: LabelsBundle, stage: number): string {
  return labels.pipelineStages.find((s) => s.stage === stage)?.name ?? String(stage);
}

export function attitudeDisplayName(labels: LabelsBundle, attitude: number | null | undefined): string {
  return labels.attitudeLabels[attitude ?? 0] ?? labels.fallbacks.attitude;
}

export { FREE_TEXT_FIELD_KEYS };
