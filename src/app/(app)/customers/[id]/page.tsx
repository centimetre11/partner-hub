import { Suspense } from "react";
import { DetailBodySkeleton, DetailHeaderSkeleton } from "@/components/page-skeleton";
import { resolveCustomerTab } from "@/lib/detail-tabs";
import { CustomerDetailBody } from "./customer-detail-body";
import { CustomerDetailHeader } from "./customer-detail-header";

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = resolveCustomerTab(sp.tab);
  return (
    <div className="pb-4">
      <Suspense fallback={<DetailHeaderSkeleton />}>
        <CustomerDetailHeader id={id} />
      </Suspense>
      <Suspense fallback={<DetailBodySkeleton />}>
        <CustomerDetailBody id={id} tab={tab} />
      </Suspense>
    </div>
  );
}
