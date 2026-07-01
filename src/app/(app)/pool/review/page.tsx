import Link from "next/link";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, ScoreBar, TierBadge, EmptyState } from "@/components/ui";
import { normalizePartnerTier } from "@/lib/tier";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";
import { labelFromMap, loadTaxonomyLabelMaps } from "@/lib/taxonomy";
import { computeCompleteness, type PartnerWithRelations } from "@/lib/completeness";
import { markPoolContactedAction, promotePartnerAction, setPoolFlagAction } from "@/lib/actions";
import { getPoolReviewCounts, getPoolReviewQueue } from "@/lib/pool-review";

export default async function PoolReviewPage() {
  await requireUser();
  const { labels, messages: m } = await getServerI18n();
  const L = labelConstants(labels);
  const labelMaps = await loadTaxonomyLabelMaps();

  const [counts, queue] = await Promise.all([getPoolReviewCounts(), getPoolReviewQueue()]);

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

      <div className="px-8">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 mb-4">
          {progressParts.map((part, i) => (
            <span key={i}>{part}</span>
          ))}
        </div>

        <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="px-4 py-3 font-medium">{m.common.company}</th>
                  <th className="px-3 py-3 font-medium">{m.pool.phasePendingContact}/{m.pool.phasePendingDecision}</th>
                  <th className="px-3 py-3 font-medium">{m.common.category}</th>
                  <th className="px-3 py-3 font-medium">{m.common.region}</th>
                  <th className="px-3 py-3 font-medium">{m.common.tier}</th>
                  <th className="px-3 py-3 font-medium">{m.pool.fitScore}</th>
                  <th className="px-3 py-3 font-medium">{m.common.verification}</th>
                  <th className="px-3 py-3 font-medium">{m.common.completeness}</th>
                  <th className="px-3 py-3 font-medium text-right">{m.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {queue.map(({ partner: p, phase }) => {
                  const c = computeCompleteness(p as unknown as PartnerWithRelations, labels);
                  const pending = phase === "pending_contact";
                  return (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <Link href={`/partners/${p.id}`} className="font-medium text-slate-900 hover:text-sky-600">
                          {p.name}
                        </Link>
                        {p.knownClients && (
                          <div className="text-xs text-slate-400 mt-0.5 max-w-[240px] truncate">{p.knownClients}</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={pending ? "blue" : "amber"}>
                          {pending ? m.pool.phasePendingContact : m.pool.phasePendingDecision}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{labelFromMap(labelMaps.CATEGORY, p.category)}</td>
                      <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{p.city ?? p.country ?? "—"}</td>
                      <td className="px-3 py-3">
                        {normalizePartnerTier(p.tier) ? <TierBadge tier={p.tier} /> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{p.fitScore ?? "—"}</td>
                      <td className="px-3 py-3">
                        <Badge tone={p.aiVerified === "VERIFIED" ? "green" : "zinc"}>
                          {L.AI_VERIFIED_LABELS[p.aiVerified ?? "UNKNOWN"]}
                        </Badge>
                      </td>
                      <td className="px-3 py-3"><ScoreBar score={c.score} /></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {pending && (
                            <form action={markPoolContactedAction.bind(null, p.id)}>
                              <button className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50">
                                {m.pool.markContacted}
                              </button>
                            </form>
                          )}
                          <form action={promotePartnerAction.bind(null, p.id)}>
                            <button className="rounded-md bg-slate-900 text-white px-2.5 py-1 text-xs hover:bg-slate-800" title={m.pool.promoteTitle}>
                              {m.pool.promote}
                            </button>
                          </form>
                          <form action={setPoolFlagAction.bind(null, p.id, "WATCHING")}>
                            <button className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">{m.common.watch}</button>
                          </form>
                          <form action={setPoolFlagAction.bind(null, p.id, "DROPPED")}>
                            <button className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-400 hover:text-red-600 hover:border-red-200">{m.common.drop}</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {queue.length === 0 && (
            <>
              <EmptyState text={m.pool.reviewComplete} />
              <p className="text-center text-sm text-slate-500 px-6 pb-8 -mt-4">{m.pool.reviewCompleteDesc}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
