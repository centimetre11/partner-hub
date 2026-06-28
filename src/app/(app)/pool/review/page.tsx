import Link from "next/link";
import { requireUser } from "@/lib/session";
import { PageHeader, EmptyState } from "@/components/ui";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";
import { labelFromMap, loadTaxonomyLabelMaps } from "@/lib/taxonomy";
import { computeCompleteness, type PartnerWithRelations } from "@/lib/completeness";
import { getNextPoolReviewPartner, getPoolReviewCounts } from "@/lib/pool-review";
import { PoolReviewCard } from "../pool-review-card";

function parseSkipIds(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export default async function PoolReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ skip?: string }>;
}) {
  await requireUser();
  const { labels, messages: m } = await getServerI18n();
  const L = labelConstants(labels);
  const sp = await searchParams;
  const skipIds = parseSkipIds(sp.skip);
  const labelMaps = await loadTaxonomyLabelMaps();

  const [counts, next] = await Promise.all([getPoolReviewCounts(), getNextPoolReviewPartner(skipIds)]);

  const progressParts = [
    m.pool.progressPendingContact.replace("{count}", String(counts.pendingContact)),
    m.pool.progressPendingDecision.replace("{count}", String(counts.pendingDecision)),
    m.pool.progressProcessed.replace("{count}", String(counts.processed)),
  ];

  return (
    <div className="pb-16">
      <PageHeader
        title={m.pool.reviewTitle}
        desc={m.pool.reviewDesc}
        actions={
          <Link
            href="/pool"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {m.pool.backToPool}
          </Link>
        }
      />

      <div className="px-8 max-w-3xl">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 mb-6">
          {progressParts.map((part, i) => (
            <span key={i}>{part}</span>
          ))}
        </div>

        {next ? (
          <PoolReviewCard
            partner={next.partner}
            phase={next.phase}
            skipIds={skipIds}
            categoryLabel={labelFromMap(labelMaps.CATEGORY, next.partner.category)}
            completenessScore={computeCompleteness(next.partner as unknown as PartnerWithRelations, labels).score}
            messages={{
              phasePendingContact: m.pool.phasePendingContact,
              phasePendingDecision: m.pool.phasePendingDecision,
              markContacted: m.pool.markContacted,
              skipReview: m.pool.skipReview,
              viewFullProfile: m.pool.viewFullProfile,
              promote: m.pool.promote,
              drop: m.common.drop,
              watch: m.common.watch,
              fitScore: m.pool.fitScore,
              coreBusiness: m.pool.coreBusiness,
              knownClients: m.pool.knownClients,
              pitch: m.pool.pitch,
              common: {
                company: m.common.company,
                category: m.common.category,
                region: m.common.region,
                completeness: m.common.completeness,
                verification: m.common.verification,
              },
            }}
            labels={{
              POOL_FLAG_LABELS: L.POOL_FLAG_LABELS,
              AI_VERIFIED_LABELS: L.AI_VERIFIED_LABELS,
              STATUS_LABELS: L.STATUS_LABELS,
            }}
          />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm">
            <EmptyState text={m.pool.reviewComplete} />
            <p className="text-center text-sm text-slate-500 px-6 pb-8 -mt-4">{m.pool.reviewCompleteDesc}</p>
            {skipIds.length > 0 && (
              <div className="text-center pb-8">
                <Link href="/pool/review" className="text-sm text-sky-600 hover:underline">
                  {m.pool.clearSkipped}
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
