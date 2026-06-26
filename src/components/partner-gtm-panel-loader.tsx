import type { Partner } from "@prisma/client";
import { PartnerGtmPanel } from "@/components/partner-gtm-panel";
import { searchGtmLibraryAction } from "@/lib/gtm-library-actions";
import type { TaxonomyDimension } from "@/lib/taxonomy";

export async function PartnerGtmPanelLoader({
  partner,
  labelMaps,
}: {
  partner: Partner;
  labelMaps: Record<TaxonomyDimension, Record<string, string>>;
}) {
  const libraryItems = await searchGtmLibraryAction("");
  return <PartnerGtmPanel partner={partner} libraryItems={libraryItems} labelMaps={labelMaps} />;
}
