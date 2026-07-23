import type { Locale } from "../locale";

export type WorkspacePanelId = "guide" | "positioning" | "capability" | "pipeline" | "relationship";

export type TaxonomyDimension =
  | "ARCHETYPE"
  | "INDUSTRY"
  | "VALUE_PATTERN"
  | "CATEGORY"
  | "CAPABILITY"
  | "CUSTOMER_SEGMENT"
  | "BUYING_TRIGGER"
  | "ENTRY_PATH"
  | "ICP_TIER"
  | "WIN_FACTOR"
  | "LOSS_REASON";

export type LabelsBundle = {
  locale: Locale;
  pipelineStages: { stage: number; name: string; desc: string }[];
  categoryLabels: Record<string, string>;
  industryLabels: Record<string, string>;
  capabilityLabels: Record<string, string>;
  poolFlagLabels: Record<string, string>;
  statusLabels: Record<string, string>;
  contactRoleLabels: Record<string, string>;
  attitudeLabels: Record<number, string>;
  todoPriorityLabels: Record<string, string>;
  eventTypeLabels: Record<string, string>;
  businessRecordCategoryLabels: Record<string, string>;
  /** CRM KPI: 现场/非现场 — keys are canonical CRM values */
  crmTraceNatureLabels: Record<string, string>;
  /** CRM KPI: 商务行为 — keys are canonical CRM values */
  crmTraceActionLabels: Record<string, string>;
  monitorDimensionLabels: Record<string, string>;
  monitorSentimentLabels: Record<string, string>;
  monitorSourceTypeLabels: Record<string, string>;
  aiVerifiedLabels: Record<string, string>;
  documentTypeLabels: Record<string, string>;
  materialCategoryLabels: Record<string, string>;
  knowledgeCategoryLabels: Record<string, string>;
  faqCategoryLabels: Record<string, string>;
  solutionStatusLabels: Record<string, string>;
  /** Partner profile field display names (JSON keys stay English) */
  partnerFieldLabels: Record<string, string>;
  partnerArchetypeLabels: Record<string, string>;
  valuePatternLabels: Record<string, string>;
  customerSegmentLabels: Record<string, string>;
  buyingTriggerLabels: Record<string, string>;
  entryPathLabels: Record<string, string>;
  icpTierLabels: Record<string, string>;
  winFactorLabels: Record<string, string>;
  lossReasonLabels: Record<string, string>;
  actionDomainLabels: Record<string, string>;
  userRoleLabels: Record<string, string>;
  workspacePanels: { id: WorkspacePanelId; label: string; desc: string }[];
  completenessLabels: string[];
  taxonomyMeta: Record<TaxonomyDimension, { label: string; hint: string }>;
  fallbacks: Record<string, string>;
  frameworkLayerOrder: string[];
};
