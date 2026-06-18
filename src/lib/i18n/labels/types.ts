import type { Locale } from "../locale";

export type WorkspacePanelId = "guide" | "positioning" | "pipeline" | "capability" | "relationship";

export type TaxonomyDimension = "ARCHETYPE" | "INDUSTRY" | "VALUE_PATTERN" | "CATEGORY";

export type LabelsBundle = {
  locale: Locale;
  pipelineStages: { stage: number; name: string; desc: string }[];
  categoryLabels: Record<string, string>;
  industryLabels: Record<string, string>;
  poolFlagLabels: Record<string, string>;
  statusLabels: Record<string, string>;
  contactRoleLabels: Record<string, string>;
  attitudeLabels: Record<number, string>;
  todoPriorityLabels: Record<string, string>;
  eventTypeLabels: Record<string, string>;
  monitorDimensionLabels: Record<string, string>;
  monitorSentimentLabels: Record<string, string>;
  monitorSourceTypeLabels: Record<string, string>;
  aiVerifiedLabels: Record<string, string>;
  documentTypeLabels: Record<string, string>;
  materialCategoryLabels: Record<string, string>;
  knowledgeCategoryLabels: Record<string, string>;
  solutionStatusLabels: Record<string, string>;
  /** Partner profile field display names (JSON keys stay English) */
  partnerFieldLabels: Record<string, string>;
  partnerArchetypeLabels: Record<string, string>;
  valuePatternLabels: Record<string, string>;
  actionDomainLabels: Record<string, string>;
  userRoleLabels: Record<string, string>;
  workspacePanels: { id: WorkspacePanelId; label: string; desc: string }[];
  completenessLabels: string[];
  taxonomyMeta: Record<TaxonomyDimension, { label: string; hint: string }>;
  fallbacks: Record<string, string>;
  frameworkLayerOrder: string[];
};
