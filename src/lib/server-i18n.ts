import type { Locale } from "./i18n/locale";
import { getLabels, getMessages, getLocale, localeToBcp47 } from "./i18n";

export async function getServerI18n() {
  const locale = await getLocale();
  return {
    locale,
    labels: getLabels(locale),
    messages: getMessages(locale),
    bcp47: localeToBcp47(locale),
  };
}

export type ServerI18n = Awaited<ReturnType<typeof getServerI18n>>;

/** Resolve label maps for server components (backward-compatible shape) */
export function labelConstants(ui: ServerI18n["labels"]) {
  return {
    STATUS_LABELS: ui.statusLabels,
    POOL_FLAG_LABELS: ui.poolFlagLabels,
    CATEGORY_LABELS: ui.categoryLabels,
    INDUSTRY_LABELS: ui.industryLabels,
    CONTACT_ROLE_LABELS: ui.contactRoleLabels,
    ATTITUDE_LABELS: ui.attitudeLabels,
    TODO_PRIORITY_LABELS: ui.todoPriorityLabels,
    EVENT_TYPE_LABELS: ui.eventTypeLabels,
    BUSINESS_RECORD_CATEGORY_LABELS: ui.businessRecordCategoryLabels,
    MONITOR_DIMENSION_LABELS: ui.monitorDimensionLabels,
    MONITOR_SENTIMENT_LABELS: ui.monitorSentimentLabels,
    MONITOR_SOURCE_TYPE_LABELS: ui.monitorSourceTypeLabels,
    AI_VERIFIED_LABELS: ui.aiVerifiedLabels,
    DOCUMENT_TYPE_LABELS: ui.documentTypeLabels,
    MATERIAL_CATEGORY_LABELS: ui.materialCategoryLabels,
    KNOWLEDGE_CATEGORY_LABELS: ui.knowledgeCategoryLabels,
    SOLUTION_STATUS_LABELS: ui.solutionStatusLabels,
    PIPELINE_STAGES: ui.pipelineStages,
    USER_ROLE_LABELS: ui.userRoleLabels,
  };
}

export function stageName(ui: ServerI18n["labels"], stage: number) {
  return ui.pipelineStages.find((s) => s.stage === stage)?.name ?? ui.fallbacks.stage.replace("{n}", String(stage));
}

export function attitudeLabel(ui: ServerI18n["labels"], a: number | null | undefined) {
  return ui.attitudeLabels[a ?? 0] ?? ui.fallbacks.attitude;
}

export { getLocale, getLabels, getMessages, localeToBcp47, type Locale };
