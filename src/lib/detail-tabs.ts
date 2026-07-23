import type { WorkspacePanelId } from "@/lib/partner-framework";

export const PARTNER_PANELS: WorkspacePanelId[] = [
  "guide",
  "positioning",
  "capability",
  "pipeline",
  "relationship",
];

export const CUSTOMER_TABS = [
  "overview",
  "profile",
  "opportunities",
  "contracts",
  "projects",
  "capability",
  "relationship",
] as const;

export type CustomerTabId = (typeof CUSTOMER_TABS)[number];

export function resolvePartnerPanel(raw?: string | null): WorkspacePanelId {
  if (raw && (PARTNER_PANELS as string[]).includes(raw)) return raw as WorkspacePanelId;
  return "guide";
}

export function resolveCustomerTab(raw?: string | null): CustomerTabId {
  if (raw && (CUSTOMER_TABS as readonly string[]).includes(raw)) return raw as CustomerTabId;
  return "overview";
}
