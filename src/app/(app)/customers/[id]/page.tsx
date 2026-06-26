import { Suspense } from "react";
import { DetailBodySkeleton, DetailHeaderSkeleton } from "@/components/page-skeleton";
import { CustomerDetailBody } from "./customer-detail-body";
import { CustomerDetailHeader } from "./customer-detail-header";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="pb-4">
      <Suspense fallback={<DetailHeaderSkeleton />}>
        <CustomerDetailHeader id={id} />
      </Suspense>
      <Suspense fallback={<DetailBodySkeleton />}>
        <CustomerDetailBody id={id} />
      </Suspense>
    </div>
  );
}
