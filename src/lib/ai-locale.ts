import { CUSTOMER_FIELD_LABELS, CUSTOMER_FIELD_LABELS_ZH, PARTNER_FIELD_LABELS, SOLUTION_STATUS_LABELS } from "./constants";
import { getLabels, type LabelsBundle } from "./i18n";
import type { Locale } from "./i18n/locale";
import { intakeClarificationHint } from "./ai-clarifications";

export type IntakeScope =
  | "new_partner"
  | "powermap"
  | "opportunity"
  | "profile"
  | "training"
  | "solution"
  | "business_record"
  | "todo"
  | "new_customer"
  | "customer_profile";

/** Customer (end-customer / account) intake scopes — distinct field set from partner scopes. */
export function isCustomerScope(scope: IntakeScope): boolean {
  return scope === "new_customer" || scope === "customer_profile";
}

export function customerFieldLabels(locale: Locale): Record<string, string> {
  return locale === "zh" ? CUSTOMER_FIELD_LABELS_ZH : CUSTOMER_FIELD_LABELS;
}

/** Scope-aware field label: customer scopes use the customer field set, others fall back to partner labels. */
export function fieldLabelForScope(locale: Locale, scope: IntakeScope, field: string): string {
  if (isCustomerScope(scope)) {
    return customerFieldLabels(locale)[field] ?? CUSTOMER_FIELD_LABELS[field] ?? field;
  }
  return fieldLabel(locale, field);
}

/** Scope-aware "field(code)" list for prompts. */
export function fieldListForScope(locale: Locale, scope: IntakeScope): string {
  if (isCustomerScope(scope)) {
    return Object.entries(customerFieldLabels(locale))
      .map(([f, l]) => `${f}(${l})`)
      .join(listSep(locale));
  }
  return fieldListForAi(locale);
}

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

/** Scopes that don't touch partner-profile fields — they get a lean locale rule. */
const PROFILE_HEAVY_SCOPES: ReadonlySet<IntakeScope> = new Set<IntakeScope>([
  "profile",
  "new_partner",
  "new_customer",
  "customer_profile",
]);

export function localeOutputRules(locale: Locale, scope?: IntakeScope): string {
  const lang = replyLanguage(locale);

  // Lean variant for record-entry scopes (todo / business_record / opportunity / powermap /
  // training / solution): they never emit profile fieldUpdates, so the big partner-profile
  // rule block is pure noise. Keep only what these scopes actually need.
  if (scope && !PROFILE_HEAVY_SCOPES.has(scope)) {
    return `[User interface language: ${lang} (${locale})]
- All user-facing text (reply, questions, clarifications, titles, details, notes, summaries) MUST be in ${lang}.
- Keep enum codes / IDs canonical: priority HIGH/MEDIUM/LOW, role=DECISION_MAKER, status codes (PLANNED/DRAFT/…), pipelineStage as a number 1–10, traceNature/traceAction as their listed values.
- Person and company names: keep exactly as in the source (English or local language).`;
  }

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
      ? `{ "id":"country", "question":"主要在哪个国家？", "options":["阿联酋","沙特"], "tier":"preference", "apply":"direct", "kind":"field" }`
      : `{ "id":"country", "question":"Primary country?", "options":["UAE","Saudi Arabia"], "tier":"preference", "apply":"direct", "kind":"field" }`;

  const clarificationFooter = intakeClarificationHint(locale);

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
      "traceNature": "现场|非现场 (required — 现场 for in-person visits/meals/meetings; 非现场 for remote/chat/email)",
      "traceAction": "CRM business behavior (required) — one of: 接待|培训|服务|调研|方案|催款|客情|其它|远程会议|WhatsApp or Line|Email",
      "reason": "source snippet (${lang})"
    }]
  }
}
Rules:
- Fill businessRecords only; fields/contacts/opportunities/todos/trainings/solutions MUST stay empty arrays.
- businessRecords MUST contain at least one item — NEVER leave it empty. summary alone is NOT a saveable record.
- title = concise headline (≤30 chars); content = full details. Do NOT put the only copy of the record in summary.
- This is NOT partner onboarding — never emit profile fields (website, category, headcount, etc.).
- When partner is pre-bound in [伙伴绑定], omit partnerName entirely.
- One user message may yield multiple businessRecords if they describe several milestones.
- traceNature and traceAction are mandatory for CRM KPI sync — infer from text; user confirms before save (WeCom reply「确认」or Web).
- Progress-sync / status-update notes (迁移进展、配合测试、待定事项): infer traceNature=非现场; traceAction=其它 or 远程会议 or WhatsApp or Line.
- When user names a person listed in [Existing contacts], set contactName to that contact.
- If traceNature or traceAction cannot be inferred confidently, set ready=false and add clarifications (direct apply) e.g. id "br-0-nature" with options 现场|非现场, or "br-0-action" with CRM action options.
- category: VISIT=meetings/visits; TRAINING=training; NEGOTIATION=deals; DELIVERY=delivery/migration/testing; RELATIONSHIP=relationship; OTHER=rest.
- reply MUST match ready: if ready=false, say what is missing (现场/非现场、商务行为、记录标题); NEVER say「可以确认」「已成功提取可保存」when ready=false.
- Extract only from user text; do not invent. ready=true only when every record has title + traceNature + traceAction.
${clarificationFooter}`;
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
    "todos": [{"title":"...","dueDate":"YYYY-MM-DD","priority":"HIGH|MEDIUM|LOW","assigneeName":"...","detail":"..."}],
    "trainings": [],
    "solutions": [],
    "businessRecords": []
  }
}
Rules:
- Fill todos only; other arrays must be empty.
- ready=true when at least one todo has a clear title and partner lookup is resolved (single match auto-linked; ambiguous/missing partner handled by system clarifications).
- Set proposal.partnerName when user mentions a company; omit for personal/global todos.
${clarificationFooter}`;
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
- role/attitude use English codes; title/department/reason may be ${lang}.
${clarificationFooter}`;
  }

  if (isCustomerScope(scope)) {
    const cfl = fieldListForScope(locale, scope);
    return `Output a single JSON object only. User-facing strings in ${lang}. Structure:
{
  "reply": "Your message to the user (${lang}, natural tone; ask clarifications here, at most 1–2 key points)",
  "questions": ["clarification point 1", "..."],
  "clarifications": [
    ${clarifyExample}
  ],
  "ready": true/false,
  "proposal": {
    "partnerName": "(the END-CUSTOMER / account company name — this is the customer being profiled, NOT a Fanruan partner)",
    "summary": "One-line summary of what will be saved (${lang})",
    "fields": [{"field":"...","label":"${lang} field display name","oldValue":"...","newValue":"...","reason":"source (${lang})"}],
    "contacts": [{"action":"add|update","id":"(when update)","name":"...","role":"APPROVER|DECISION_MAKER|SUPPORTER|EVALUATOR|INFLUENCER","title":"...","department":"...","attitude":0,"reportsToName":"...","contactInfo":"...","reason":"..."}],
    "opportunities": [],
    "todos": [{"title":"...","dueDate":"YYYY-MM-DD","priority":"HIGH|MEDIUM|LOW","assigneeName":"...","detail":"..."}],
    "trainings": [],
    "solutions": [],
    "businessRecords": []
  }
}
Customer field codes for the fields array (use ONLY these): ${cfl}.
- status values: ACTIVE (合作中) / PROSPECT (潜在) / INACTIVE (已停止).
Rules:
- This is END-CUSTOMER (account) profiling — NOT partner onboarding. Never emit partner-only codes (category, tier, industries, playbook, valuePattern, etc.). Use the customer field codes above only.
- partnerName = the customer's company name (required for new_customer).
- Put all people into the contacts array (power map); do not use contactName/contactTitle/contactPhone/contactEmail fields.
- Extract only supported content from user text or tool results; cite reason. Do not invent beyond tools.
- ready: true when the customer name and at least one profile field are present, or when the user says save now.
- proposal accumulates confirmed content each turn (do not clear prior extractions).
${clarificationFooter}`;
  }

  if (scope === "opportunity") {
    return `Output a single JSON object. User-facing strings in ${lang}:
{
  "reply": "Your message to the user (${lang}, brief)",
  "questions": [],
  "clarifications": [],
  "ready": true/false,
  "proposal": {
    "partnerName": "(the customer/account this opportunity belongs to; omit when a customer/partner is pre-bound)",
    "summary": "One-line summary (${lang})",
    "opportunities": [{"action":"add|update","id":"(when update)","name":"...","client":"...","amount":"...","stage":"...","nextStep":"...","status":"ACTIVE|WON|LOST|PAUSED","reason":"..."}]
  }
}
Rules:
- Fill opportunities only; all other proposal arrays stay empty (omit them).
- Opportunities are owned by a CUSTOMER (account). When the company is named in an open session, set proposal.partnerName to it; a bound partner books it under that partner's own customer profile.
- ready=true when at least one opportunity has a name.
${clarificationFooter}`;
  }

  if (scope === "profile") {
    return `Output a single JSON object. User-facing strings in ${lang}:
{
  "reply": "Your message to the user (${lang}, natural tone; 1–2 clarifications max)",
  "questions": [],
  "clarifications": [
    ${clarifyExample}
  ],
  "ready": true/false,
  "proposal": {
    "summary": "One-line summary of what will be saved (${lang})",
    "fields": [{"field":"...","label":"${lang} field display name","oldValue":"...","newValue":"...","reason":"source (${lang})"}]
  }
}
Field codes for fields array (use ONLY these): ${fl}.
Rules:
- Fill fields only; all other proposal arrays stay empty (omit them).
- Extract only supported content; cite reason. Do not invent beyond tools.
- ready=true when required fields are present, or the user says save now.
- proposal accumulates confirmed content each turn (do not clear prior extractions).
${clarificationFooter}`;
  }

  if (scope === "training") {
    return `Output a single JSON object. User-facing strings in ${lang}:
{
  "reply": "Your message to the user (${lang}, brief)",
  "questions": [],
  "clarifications": [],
  "ready": true/false,
  "proposal": {
    "summary": "One-line summary (${lang})",
    "trainings": [{"person":"...","currentSkill":"...","targetCert":"...","deadline":"YYYY-MM-DD","status":"PLANNED|IN_PROGRESS|DONE","reason":"..."}]
  }
}
Rules:
- Fill trainings only; all other proposal arrays stay empty (omit them).
- ready=true when at least one training has a person.
${clarificationFooter}`;
  }

  if (scope === "solution") {
    return `Output a single JSON object. User-facing strings in ${lang}:
{
  "reply": "Your message to the user (${lang}, brief)",
  "questions": [],
  "clarifications": [],
  "ready": true/false,
  "proposal": {
    "summary": "One-line summary (${lang})",
    "solutions": [{"name":"...","targetCustomer":"...","painPoint":"...","fanruanOffer":"...","partnerOffer":"...","pricingModel":"...","status":"...","reason":"..."}]
  }
}
Rules:
- Fill solutions only; all other proposal arrays stay empty (omit them).
- ready=true when at least one solution has a name.
${clarificationFooter}`;
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
    "todos": [{"title":"...","dueDate":"YYYY-MM-DD","priority":"HIGH|MEDIUM|LOW","assigneeName":"...","detail":"..."}],
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
- clarifications: when key info is missing, 1-3 items max; see rules below.
${clarificationFooter}`;
}

export function schemaHintForScope(scope: IntakeScope, locale: Locale): string {
  const fl = fieldListForAi(locale);
  const cat = categoryListForAi(locale);
  const ind = industryListForAi(locale);
  const st = stageListForAi(locale);
  const solutionStatuses = Object.keys(SOLUTION_STATUS_LABELS).join("/");

  switch (scope) {
    case "new_partner":
      return `Set partnerName to the company name; fill other profile fields in fields (field names only: ${fl}; category values: ${cat}; industries values: ${ind}; pipelineStage 1–10: ${st}); add contacts if people appear in text/research. Do NOT extract opportunities/deals — leave opportunities as empty array. Leave trainings/solutions as empty arrays.`;
    case "powermap":
      return "Fill contacts only (action=add or update with id). Leave fields/opportunities/todos/trainings/solutions as empty arrays.";
    case "opportunity":
      return "Fill opportunities only (owned by a customer/account). Leave others as empty arrays.";
    case "profile":
      return `Fill fields only (FieldUpdate; oldValue may be empty). Field names: ${fl} (category: ${cat}; industries: ${ind}). Use tools when info is insufficient. Leave others as empty arrays.`;
    case "training":
      return "Fill trainings only. Leave others as empty arrays.";
    case "solution":
      return `Fill solutions only. status codes: ${solutionStatuses}. Leave others as empty arrays.`;
    case "business_record":
      return "Fill businessRecords only (title, traceNature, traceAction required). Leave other arrays empty.";
    case "todo":
      return "Fill todos only (title=task content only; assigneeName for 负责人/owner; strip command words from title). Leave fields/contacts/opportunities/trainings/solutions/businessRecords as empty arrays.";
    case "new_customer":
      return `Set partnerName to the END-CUSTOMER company name; fill customer profile fields in fields (codes only: ${fieldListForScope(locale, scope)}; status: ACTIVE/PROSPECT/INACTIVE). Add people to contacts. Leave opportunities/trainings/solutions/businessRecords as empty arrays.`;
    case "customer_profile":
      return `Fill customer fields only (FieldUpdate; oldValue may be empty). Codes: ${fieldListForScope(locale, scope)}. Use tools when info is insufficient. Add new people to contacts. Leave opportunities/trainings/solutions/businessRecords as empty arrays.`;
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

1. User gave KMS link/pageId → read_kms first (or use system pre-fetched KMS); if KMS clearly states company name + website, write them to proposal without blocking identity clarifications. When company name is known, the system may already have run web_search + linkedin_search in parallel — use those injected results; do NOT call them again unless you need different keywords.
2. After identifying company name from user/KMS → search_partners dedupe; if web/linkedin were not pre-fetched, call web_search AND linkedin_search in the SAME tool_calls round (they execute in parallel).
3. Still missing category/playbook/Fanruan angle → search_knowledge team knowledge base; for cases/solutions/collateral → search_knowhow Know-how knowledge base
4. After each tool round, check field checklist; keep researching until major fields are sourced or public channels truly have nothing
5. If a tool fails, skip it and use others—do not block onboarding. Do NOT assume KMS is unconfigured without calling read_kms when [KMS token status] says configured. Do NOT assume Know-how is unconfigured without calling search_knowhow when [Know-how token status] says configured.
6. After research, output JSON proposal (no more tools); in reply briefly note what each source found and what is still missing`;

function knowhowStatusBlock(locale: Locale, configured: boolean): string {
  if (locale === "zh") {
    return configured
      ? "【Know-how 令牌状态】已配置。可调用 search_knowhow 检索帆软 Know-how 知识库（案例、方案、宣传物料等）。禁止说「Know-how 未配置」。"
      : "【Know-how 令牌状态】未配置。跳过 search_knowhow，改用 search_knowledge、web_search 等渠道。";
  }
  return configured
    ? "[Know-how token status] Configured. Call search_knowhow to retrieve cases, solutions, and collateral from the Fanruan Know-how knowledge base. Do NOT say Know-how is unconfigured."
    : "[Know-how token status] Not configured. Skip search_knowhow; use search_knowledge, web_search, and other sources.";
}

function kmsStatusBlock(locale: Locale, configured: boolean): string {
  if (locale === "zh") {
    return configured
      ? "【KMS 令牌状态】已配置。用户提供 KMS 链接时，系统会自动预读并注入内容；也可调用 read_kms（支持 pageId 与 /display/ 链接）。若 KMS 中公司名与官网明确，直接写入 proposal，无需 blocking 身份确认。禁止说「KMS 未配置」。"
      : "【KMS 令牌状态】未配置。跳过 read_kms，改用 web_search、linkedin_search 等公开渠道。";
  }
  return configured
    ? "[KMS token status] Configured. KMS links are auto pre-fetched; you may also call read_kms (pageId and /display/ URLs). If KMS gives a clear company name and website, write them to proposal without blocking identity clarifications. Do NOT say KMS is unconfigured."
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
    guide: `Minimum for onboarding: company name (partnerName, required). Try to fill profile fields via research (see tool notes). Ask 1–2 brief follow-ups only after research. Do NOT extract sales opportunities/deals from meeting notes — those belong to end-customers and are added separately.

Identity: only tier:"required" identity clarifications when genuinely ambiguous; KMS/user clear name+website → write directly. search_partners near-match → dedupe clarification. Profile fields use tier:"preference".`,
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
    intro:
      "The user wants to add or update an opportunity. Opportunities belong to a CUSTOMER (end-customer/account), not a partner. If a partner is bound and self-selling, it is booked under that partner's own customer profile.",
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
      "The user wants to record key business progress for this partner (visits, training scheduled, negotiations, delivery, migration/testing updates, relationship events). Input is usually free-form notes or chat paste—extract structured milestone(s) into businessRecords (never summary-only).",
    guide: `From user text extract one or more businessRecords (businessRecords.length >= 1 always):
- title (required): concise headline; content: full details (summary is a one-line recap only)
- traceNature (required): 现场 | 非现场 — 现场 for in-person; 非现场 for remote/chat/email/progress sync
- traceAction (required): one of 接待|培训|服务|调研|方案|催款|客情|其它|远程会议|WhatsApp or Line|Email
- category: VISIT / TRAINING / NEGOTIATION / DELIVERY / RELATIONSHIP / OTHER
- occurredAt: YYYY-MM-DD if mentioned, else today
- contactName: match [Existing contacts] when user names someone (e.g. Mohammed)
Progress-sync example — input: "跟 Mohammed 确认了沙特节点迁移进展，后续配合 FDL 性能测试，Doris 待定"
→ businessRecords: [{ title: "确认沙特节点迁移进展，安排 FDL 性能测试", content: "...(full text)...", contactName: "Mohammed", traceNature: "非现场", traceAction: "其它", category: "DELIVERY", occurredAt: today }]
No web research. ready=true only when title + traceNature + traceAction are set for each record; reply must not promise save when ready=false.`,
  },
  todo: {
    title: "Create todo",
    intro: "The user wants to create one or more follow-up todos. Prefer linking to a partner/customer when mentioned.",
    guide: `Extract todos with title (required), optional dueDate (YYYY-MM-DD), priority (HIGH/MEDIUM/LOW), assigneeName (负责人/owner name), detail.
Title = the actual task only — strip command words like「增加待办/创建todo」and metadata like「负责人是 xxx」(put name in assigneeName, not in title).
If user names a company/partner, set proposal.partnerName — the system will auto-link on a single match.
Multiple matches require blocking partnerName clarification. If the company is named but not found in Partner Hub, the system will ask the user to confirm an unlinked todo (do not set ready=true yourself in that case).
If no company is mentioned, omit partnerName for a global/personal todo.
No web research. ready=true when title is clear AND no blocking partner clarifications remain.`,
  },
  new_customer: {
    title: "New customer onboarding",
    intro:
      "The user wants to create a new END-CUSTOMER (account) — the company that buys/uses Fanruan products (possibly served by a partner), NOT a Fanruan partner. Input may be: company name only, meeting/chat text, a company intro, or a Fanruan KMS link. Combine KMS with web/LinkedIn research to profile the customer as fully as possible.",
    guide: `Minimum to create: customer company name (partnerName, required). Try to fill profile fields via research (industry, scale, city, country, website, primary contact). Ask 1–2 brief follow-ups only after research.
This is a CUSTOMER, not a partner: never emit partner-only fields (category, tier, partnerArchetype, valuePattern, playbook, etc.).
Identity: only emit a tier:"required" identity clarification when the company is genuinely ambiguous; a clear unique name/website from KMS or the user → write it directly.`,
  },
  customer_profile: {
    title: "Complete customer profile",
    intro:
      "The user wants to fill or update an existing END-CUSTOMER's profile fields. May include a KMS link or scattered notes; combine the existing record with tool research.",
    guide: "Map user input and research to the customer profile fields. Use tools when info is insufficient. Add new people to contacts.",
  },
};

/** A clean-input rule for record-entry scopes so titles never echo command words. */
function cleanInputRule(scope: IntakeScope, locale: Locale): string {
  if (PROFILE_HEAVY_SCOPES.has(scope)) return "";
  return locale === "zh"
    ? `- 标题/名称只写真正的事项本身，禁止包含「帮我/请/麻烦/记一下/记录/新建/待办/商务记录/商机/联系人」等命令词，禁止把用户整句原样当标题。`
    : `- title/name = the actual item only; never include command words (help me / log / add / todo / record …) and never copy the user's whole sentence as the title.`;
}

/** Authoritative current-draft block so follow-up turns PATCH instead of re-extract. */
function currentDraftBlock(currentDraft: string | undefined, locale: Locale): string {
  if (!currentDraft) return "";
  return locale === "zh"
    ? `\n[当前草稿 · 权威状态]\n这是本次录入已生成的草稿。用户接下来的消息通常是补充或纠正其中的字段。请在此基础上输出完整 JSON：被用户改到的字段更新，其余字段原样保留，绝不要丢弃已有内容。\n${currentDraft}\n`
    : `\n[Current draft · authoritative]\nThis is the draft already produced this session. The user's next message usually adds or corrects fields. Output the full JSON on top of it: update what the user changed, keep every other field as-is, never drop existing content.\n${currentDraft}\n`;
}

export function buildIntakeSystemPrompt(opts: {
  locale: Locale;
  scope: IntakeScope;
  today: string;
  taxonomyHint: string;
  partnerContext?: string;
  partnerBinding?: string;
  useResearch: boolean;
  kmsConfigured?: boolean;
  knowhowConfigured?: boolean;
  currentDraft?: string;
}): string {
  const cfg = SCOPE_CONFIG[opts.scope];
  const lang = replyLanguage(opts.locale);
  const ctx = opts.partnerContext ? `\n\n${opts.partnerContext}` : "";
  const kmsHint = opts.useResearch ? `\n${kmsStatusBlock(opts.locale, !!opts.kmsConfigured)}` : "";
  const knowhowHint = opts.useResearch ? `\n${knowhowStatusBlock(opts.locale, !!opts.knowhowConfigured)}` : "";
  const cleanRule = cleanInputRule(opts.scope, opts.locale);

  return `You are the AI intake assistant for Fanruan Software (Fanruan, leading BI vendor in China; products FineReport/FineBI/FineDataLink) Middle East partner management.
Today's date: ${opts.today}.
Current task: ${cfg.title}. ${cfg.intro}

${localeOutputRules(opts.locale, opts.scope)}

[Guidance rules (important, not rigid)]
${cfg.guide}${cleanRule ? `\n${cleanRule}` : ""}
Follow-ups should feel like a colleague—natural and brief, not a form. When the user has given enough, produce the proposal and set ready=true; don't chase optional fields.
${opts.useResearch ? `\n${RESEARCH_GUIDE}${kmsHint}${knowhowHint}` : ""}

${opts.partnerBinding ? `\n${opts.partnerBinding}\n` : ""}
[Proposal scope for this task]
${schemaHintForScope(opts.scope, opts.locale)}
${opts.taxonomyHint}
${ctx}
${currentDraftBlock(opts.currentDraft, opts.locale)}
${buildOutputSchema(opts.scope, opts.locale)}`;
}

/** Compact prompt for fast AI Add scopes (single LLM call, no tools). */
export function buildFastIntakeSystemPrompt(opts: {
  locale: Locale;
  scope: IntakeScope;
  today: string;
  partnerContext?: string;
  partnerBinding?: string;
  currentDraft?: string;
}): string {
  const cfg = SCOPE_CONFIG[opts.scope];
  const lang = replyLanguage(opts.locale);
  const ctx = opts.partnerContext ? `\n${opts.partnerContext}` : "";
  const bind = opts.partnerBinding ? `\n${opts.partnerBinding}` : "";
  const cleanRule = cleanInputRule(opts.scope, opts.locale);

  return `Fast JSON extractor for Fanruan Middle East partner management. Today: ${opts.today}.
Task: ${cfg.title}. ${cfg.guide}${cleanRule ? `\n${cleanRule}` : ""}
${bind}${ctx}

${localeOutputRules(opts.locale, opts.scope)}

${schemaHintForScope(opts.scope, opts.locale)}
${currentDraftBlock(opts.currentDraft, opts.locale)}
${buildOutputSchema(opts.scope, opts.locale)}

Rules: one JSON object only; user-facing strings in ${lang}; ready=true when required items are clear; no web research; no profile/onboarding fields outside this task.${opts.scope === "business_record" ? " businessRecords MUST be non-empty (≥1 item); summary alone does not count." : ""}`;
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

export function buildWeeklyReportSystemPrompt(locale: Locale): string {
  const lang = replyLanguage(locale);
  return `You are a business analyst for Fanruan Middle East partner operations.
Based on the operational data provided, write this week's business report entirely in ${lang}.

Structure (use ${lang} section headings and prose):
1) Overall progress — 2-3 sentences on pipeline and partner ecosystem movement
2) Risk signals — stalled partners, overdue todos; name specific partners/tasks
3) Three partners to focus on this week — who and why
4) Key actions for next week — 3-5 concrete items

Rules:
- All headings, bullets, and narrative must be in ${lang} (Simplified Chinese when locale is zh).
- Keep partner/company/person names exactly as in the data.
- Be concise and direct — no filler or generic advice.`;
}

export function buildWeeklyReportUserContent(opts: {
  locale: Locale;
  prospects: number;
  activeCount: number;
  openTodos: number;
  partnerLines: string;
  eventLines: string;
  overdueLines: string;
}): string {
  const none = opts.locale === "zh" ? "（无）" : "(none)";
  if (opts.locale === "zh") {
    return `候选池：${opts.prospects}
正式伙伴：${opts.activeCount}
进行中待办：${opts.openTodos}

【正式伙伴状态】
${opts.partnerLines || none}

【近 7 天动态】
${opts.eventLines || none}

【逾期待办】
${opts.overdueLines || none}`;
  }
  return `Prospect pool: ${opts.prospects}
Active partners: ${opts.activeCount}
Open todos: ${opts.openTodos}

[Active partner status]
${opts.partnerLines || none}

[Last 7 days activity]
${opts.eventLines || none}

[Overdue todos]
${opts.overdueLines || none}`;
}

export function weeklyPartnerStatusLine(
  locale: Locale,
  labels: LabelsBundle,
  opts: { name: string; stage: number; oppCount: number; staleDays: number },
): string {
  const stage = stageDisplayName(labels, opts.stage);
  if (locale === "zh") {
    return `${opts.name}：阶段 ${opts.stage}（${stage}），${opts.oppCount} 个进行中商机，${opts.staleDays} 天无活动`;
  }
  return `${opts.name}: stage ${opts.stage} (${stage}), ${opts.oppCount} active opportunit${opts.oppCount === 1 ? "y" : "ies"}, ${opts.staleDays} days without activity`;
}

export function buildPatchExtractPrompt(scope: IntakeScope, locale: Locale): string {
  const fl = fieldListForScope(locale, scope);
  const lang = replyLanguage(locale);
  const exampleLabel = fieldLabelForScope(locale, scope, "country");

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
