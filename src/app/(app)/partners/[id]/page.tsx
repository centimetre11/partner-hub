import { Suspense } from "react";
import { DetailBodySkeleton, DetailHeaderSkeleton } from "@/components/page-skeleton";
import { resolvePartnerPanel } from "@/lib/detail-tabs";
import { PartnerDetailBody } from "./partner-detail-body";
import { PartnerDetailHeader } from "./partner-detail-header";

export default async function PartnerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ panel?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const panel = resolvePartnerPanel(sp.panel);
  return (
    <div>
      <Suspense fallback={<DetailHeaderSkeleton />}>
        <PartnerDetailHeader id={id} />
      </Suspense>
      <Suspense fallback={<DetailBodySkeleton />}>
        <PartnerDetailBody id={id} panel={panel} />
      </Suspense>
    </div>
  );
}
