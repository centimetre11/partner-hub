import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, ScoreBar, TierBadge, EmptyState, tierTone } from "@/components/ui";
import { normalizePartnerTier } from "@/lib/tier";
import { labelFromMap, loadTaxonomyLabelMaps, getTaxonomyOptionsMany } from "@/lib/taxonomy";
import { computeCompleteness } from "@/lib/completeness";
import { deletePartnerAction, promotePartnerAction, restorePartnerAction, setPoolFlagAction } from "@/lib/actions";
import { getPoolReviewCounts, poolReviewListFilter } from "@/lib/pool-review";
import { AddPartnerForm } from "./add-partner-form";
import { DeletePartnerButton } from "./delete-partner-button";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";
import { nameContainsWhere } from "@/lib/name-search";
import { InstantSearchInput } from "@/components/instant-search-input";
import { ListPagination } from "@/components/list-pagination";
import { parseListPage } from "@/lib/list-pagination";

export default async function PoolPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; country?: string; tier?: string; flag?: string; view?: string; review?: string; page?: string }>;
}) {
  await requireUser();
  const { labels, messages: m } = await getServerI18n();
  const L = labelConstants(labels);
  const sp = await searchParams;
  const view = ["prospect", "archived", "all"].includes(sp.view ?? "") ? sp.view! : "prospect";
  const { page, take, skip } = parseListPage(sp.page);

  const VIEWS = [
    { k: "prospect", label: m.pool.prospects },
    { k: "archived", label: m.pool.archivedTab },
    { k: "all", label: m.pool.allTab },
  ];

  const statusWhere =
    view === "archived" ? "ARCHIVED" : view === "all" ? { in: ["PROSPECT", "ARCHIVED"] } : "PROSPECT";

  const reviewFilter = view !== "archived" ? poolReviewListFilter(sp.review, view as "prospect" | "all") : null;
  const nameFilter = nameContainsWhere(sp.q);
  const listWhere = {
    ...(reviewFilter ?? { status: statusWhere as never }),
    ...(nameFilter ? { name: nameFilter } : {}),
    ...(sp.category ? { category: sp.category } : {}),
    ...(sp.tier ? { tier: sp.tier } : {}),
    ...(sp.flag && view !== "archived" && !reviewFilter ? { poolFlag: sp.flag } : {}),
    ...(sp.country ? { country: { contains: sp.country } } : {}),
  };

  const [labelMaps, taxonomy, partners, total, counts, reviewCounts, countries] = await Promise.all([
    loadTaxonomyLabelMaps(),
    getTaxonomyOptionsMany(["CATEGORY", "INDUSTRY"]),
    db.partner.findMany({
      where: listWhere,
      include: {
        contacts: { select: { role: true, email: true, phone: true, contactInfo: true } },
        opportunities: { select: { id: true } },
        events: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 5 },
        trainings: { select: { status: true } },
      },
      orderBy: [{ status: "asc" }, { tier: "asc" }, { name: "asc" }],
      skip,
      take,
    }),
    db.partner.count({ where: listWhere }),
    Promise.all([
      db.partner.count({ where: { status: "PROSPECT" } }),
      db.partner.count({ where: { status: "ARCHIVED" } }),
    ]).then(([prospect, archived]) => ({ prospect, archived })),
    getPoolReviewCounts(),
    db.partner.findMany({
      where: { status: { in: ["PROSPECT", "ARCHIVED"] } },
      select: { country: true },
      distinct: ["country"],
    }),
  ]);
  const categoryOptions = taxonomy.CATEGORY ?? [];
  const industryOptions = taxonomy.INDUSTRY ?? [];

  const flagTone = (f: string) =>
    f === "ADVANCING" ? "green" : f === "WATCHING" ? "amber" : f === "DROPPED" ? "zinc" : "blue";

  const qs = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { q: sp.q, category: sp.category, tier: sp.tier, country: sp.country, review: sp.review, view, ...next };
    for (const [k, v] of Object.entries(merged)) {
      if (k === "page") continue;
      if (v) params.set(k, v);
    }
    if (next.page && next.page !== "1") params.set("page", next.page);
    return `/pool?${params.toString()}`;
  };

  return (
    <div className="pb-16">
      <PageHeader
        title={m.pool.title}
        desc={m.pool.desc}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {reviewCounts.pendingTotal > 0 ? (
              <Link
                href="/pool/review"
                className="relative rounded-lg bg-slate-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-slate-800"
              >
                {m.pool.startReview}
                <span className="ml-1.5 inline-flex min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-medium items-center justify-center align-middle">
                  {reviewCounts.pendingTotal > 99 ? "99+" : reviewCounts.pendingTotal}
                </span>
              </Link>
            ) : (
              <Link
                href="/pool/review"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                {m.pool.startReview}
              </Link>
            )}
            <AddPartnerForm taxonomy={{ CATEGORY: categoryOptions, INDUSTRY: industryOptions }} />
          </div>
        }
      />

      <div className="px-8">
        <div className="flex items-center gap-1 mb-4 border-b border-slate-200 overflow-x-auto pb-px -mx-1 px-1">
          {VIEWS.map((v) => {
            const active = v.k === view;
            const badge = v.k === "prospect" ? counts.prospect : v.k === "archived" ? counts.archived : counts.prospect + counts.archived;
            return (
              <Link
                key={v.k}
                href={qs({ view: v.k, flag: undefined })}
                className={`px-4 py-2 text-sm border-b-2 -mb-px ${
                  active ? "border-slate-900 text-slate-900 font-medium" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {v.label}
                <span className="ml-1.5 text-xs text-slate-400">{badge}</span>
              </Link>
            );
          })}
        </div>

        <form className="flex flex-wrap gap-2 mb-4" method="get">
          <input type="hidden" name="view" value={view} />
          <InstantSearchInput
            placeholder={m.pool.searchPlaceholder}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm w-full sm:w-44 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <select name="category" defaultValue={sp.category ?? ""} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{m.pool.allCategories}</option>
            {categoryOptions.map((o) => (
              <option key={o.code} value={o.code}>{o.label}</option>
            ))}
          </select>
          <select name="tier" defaultValue={sp.tier ?? ""} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{m.pool.allTiers}</option>
            <option value="A">{m.pool.tierADesc}</option>
            <option value="B">{m.pool.tierBDesc}</option>
            <option value="C">{m.pool.tierCDesc}</option>
          </select>
          {view !== "archived" && (
            <select name="flag" defaultValue={sp.flag ?? ""} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
              <option value="">{m.pool.allStatuses}</option>
              {Object.entries(L.POOL_FLAG_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          )}
          {view !== "archived" && (
            <select name="review" defaultValue={sp.review ?? ""} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
              <option value="">{m.pool.allReviewStatuses}</option>
              <option value="pending_contact">{m.pool.reviewPendingContact}</option>
              <option value="contacted">{m.pool.reviewContacted}</option>
              <option value="processed">{m.pool.reviewProcessed}</option>
            </select>
          )}
          <select name="country" defaultValue={sp.country ?? ""} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{m.pool.allCountries}</option>
            {countries.filter((c) => c.country).map((c) => (
              <option key={c.country!} value={c.country!}>{c.country}</option>
            ))}
          </select>
          <button className="rounded-lg bg-slate-900 text-white px-4 py-1.5 text-sm hover:bg-slate-700">{m.common.filter}</button>
          {(sp.q || sp.category || sp.tier || sp.flag || sp.country || sp.review) && (
            <Link href={qs({ q: undefined, category: undefined, tier: undefined, country: undefined, flag: undefined, review: undefined })} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800">
              {m.common.clear}
            </Link>
          )}
        </form>

        <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">{m.common.company}</th>
                <th className="px-3 py-3 font-medium">{m.common.category}</th>
                <th className="px-3 py-3 font-medium">{m.common.region}</th>
                <th className="px-3 py-3 font-medium">{m.common.tier}</th>
                <th className="px-3 py-3 font-medium">{m.common.verification}</th>
                <th className="px-3 py-3 font-medium">{m.common.completeness}</th>
                <th className="px-3 py-3 font-medium">{m.common.status}</th>
                <th className="px-3 py-3 font-medium text-right">{m.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => {
                const c = computeCompleteness(p as Parameters<typeof computeCompleteness>[0], labels);
                const archived = p.status === "ARCHIVED";
                return (
                  <tr key={p.id} className={`border-b border-slate-50 hover:bg-slate-50/60 ${archived ? "opacity-70" : ""}`}>
                    <td className="px-4 py-3">
                      <Link href={`/partners/${p.id}`} className="font-medium text-slate-900 hover:text-sky-600">
                        {p.name}
                      </Link>
                      {p.knownClients && (
                        <div className="text-xs text-slate-400 mt-0.5 max-w-[260px] truncate">{p.knownClients}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{labelFromMap(labelMaps.CATEGORY, p.category)}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{p.city ?? p.country ?? "—"}</td>
                    <td className="px-3 py-3">
                      {normalizePartnerTier(p.tier) ? <TierBadge tier={p.tier} /> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={p.aiVerified === "VERIFIED" ? "green" : "zinc"}>
                        {L.AI_VERIFIED_LABELS[p.aiVerified ?? "UNKNOWN"]}
                      </Badge>
                    </td>
                    <td className="px-3 py-3"><ScoreBar score={c.score} /></td>
                    <td className="px-3 py-3">
                      {archived ? (
                        <Badge tone="zinc">{m.common.archived}</Badge>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge tone={flagTone(p.poolFlag)}>{L.POOL_FLAG_LABELS[p.poolFlag]}</Badge>
                          {!archived && p.status === "PROSPECT" && p.poolContactedAt && (
                            <Badge tone="indigo">{m.pool.contactedBadge}</Badge>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {archived ? (
                          <form action={restorePartnerAction.bind(null, p.id)}>
                            <button className="rounded-md bg-slate-900 text-white px-2.5 py-1 text-xs hover:bg-slate-800" title={p.prevStatus === "ACTIVE" ? m.pool.restoreAsActive : m.pool.restoreAsProspect}>
                              {m.common.restore}{p.prevStatus === "ACTIVE" ? ` ${m.pool.restoreAsActive}` : ` ${m.pool.restoreAsProspect}`}
                            </button>
                          </form>
                        ) : (
                          <>
                            <form action={promotePartnerAction.bind(null, p.id)}>
                              <button className="rounded-md bg-slate-900 text-white px-2.5 py-1 text-xs hover:bg-slate-800" title={m.pool.promoteTitle}>
                                {m.pool.promote}
                              </button>
                            </form>
                            {p.poolFlag !== "WATCHING" && (
                              <form action={setPoolFlagAction.bind(null, p.id, "WATCHING")}>
                                <button className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">{m.common.watch}</button>
                              </form>
                            )}
                            {p.poolFlag !== "DROPPED" ? (
                              <form action={setPoolFlagAction.bind(null, p.id, "DROPPED")}>
                                <button className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-400 hover:text-red-600 hover:border-red-200">{m.common.drop}</button>
                              </form>
                            ) : (
                              <form action={setPoolFlagAction.bind(null, p.id, "NEW")}>
                                <button className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">{m.common.restore}</button>
                              </form>
                            )}
                          </>
                        )}
                        <DeletePartnerButton
                          partnerName={p.name}
                          action={deletePartnerAction.bind(null, p.id)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {partners.length === 0 && <EmptyState text={view === "archived" ? m.pool.emptyArchived : m.pool.emptyFiltered} />}
          </div>
          <ListPagination
            pathname="/pool"
            searchParams={{
              q: sp.q,
              category: sp.category,
              country: sp.country,
              tier: sp.tier,
              flag: sp.flag,
              view: view === "prospect" ? undefined : view,
              review: sp.review,
            }}
            page={page}
            total={total}
            pageSize={take}
            labels={{
              prevPage: m.common.prevPage,
              nextPage: m.common.nextPage,
              pageOf: m.common.pageOf,
            }}
          />
        </div>
      </div>
    </div>
  );
}
