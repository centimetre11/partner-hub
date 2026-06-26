import { Suspense } from "react";
import { DetailBodySkeleton, DetailHeaderSkeleton } from "@/components/page-skeleton";
import { PartnerDetailBody } from "./partner-detail-body";
import { PartnerDetailHeader } from "./partner-detail-header";

export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <Suspense fallback={<DetailHeaderSkeleton />}>
        <PartnerDetailHeader id={id} />
      </Suspense>
      <Suspense fallback={<DetailBodySkeleton />}>
        <PartnerDetailBody id={id} />
      </Suspense>
    </div>
  );
}
