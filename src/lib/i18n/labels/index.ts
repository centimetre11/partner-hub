import type { Locale } from "../locale";
import { labelsEn } from "./en";
import { labelsZh } from "./zh";
import type { LabelsBundle } from "./types";

export type { LabelsBundle } from "./types";
export { labelsEn, labelsZh };

export function getLabels(locale: Locale): LabelsBundle {
  const base = locale === "en" ? labelsEn : labelsZh;
  return { ...base, locale };
}

export function stageNameFromLabels(labels: LabelsBundle, stage: number): string {
  return labels.pipelineStages.find((s) => s.stage === stage)?.name ?? labels.fallbacks.stage.replace("{n}", String(stage));
}

export function attitudeLabelFromLabels(labels: LabelsBundle, a: number | null | undefined): string {
  return labels.attitudeLabels[a ?? 0] ?? labels.fallbacks.attitude;
}

/** Shorthand accessors matching old constant names */
export function labelMapsFromBundle(labels: LabelsBundle) {
  return {
    STATUS_LABELS: labels.statusLabels,
    POOL_FLAG_LABELS: labels.poolFlagLabels,
    CATEGORY_LABELS: labels.categoryLabels,
    INDUSTRY_LABELS: labels.industryLabels,
    CONTACT_ROLE_LABELS: labels.contactRoleLabels,
    ATTITUDE_LABELS: labels.attitudeLabels,
    TODO_PRIORITY_LABELS: labels.todoPriorityLabels,
    EVENT_TYPE_LABELS: labels.eventTypeLabels,
    MONITOR_DIMENSION_LABELS: labels.monitorDimensionLabels,
    MONITOR_SENTIMENT_LABELS: labels.monitorSentimentLabels,
    MONITOR_SOURCE_TYPE_LABELS: labels.monitorSourceTypeLabels,
    AI_VERIFIED_LABELS: labels.aiVerifiedLabels,
    DOCUMENT_TYPE_LABELS: labels.documentTypeLabels,
    MATERIAL_CATEGORY_LABELS: labels.materialCategoryLabels,
    KNOWLEDGE_CATEGORY_LABELS: labels.knowledgeCategoryLabels,
    SOLUTION_STATUS_LABELS: labels.solutionStatusLabels,
    PARTNER_ARCHETYPE_LABELS: labels.partnerArchetypeLabels,
    VALUE_PATTERN_LABELS: labels.valuePatternLabels,
    ACTION_DOMAIN_LABELS: labels.actionDomainLabels,
    USER_ROLE_LABELS: labels.userRoleLabels,
    PIPELINE_STAGES: labels.pipelineStages,
    WORKSPACE_PANELS: labels.workspacePanels,
  };
}
