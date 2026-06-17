import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, ScoreBar, tierTone, EmptyState } from "@/components/ui";
import { AI_VERIFIED_LABELS, POOL_FLAG_LABELS } from "@/lib/constants";
import { getTaxonomyOptions, labelFromMap, loadTaxonomyLabelMaps } from "@/lib/taxonomy";
import { computeCompleteness } from "@/lib/completeness";
import { deletePartnerAction, promotePartnerAction, restorePartnerAction, setPoolFlagAction } from "@/lib/actions";
import { AddPartnerForm } from "./add-partner-form";
import { DeletePartnerButton } from "./delete-partner-button";

const VIEWS = [
  { k: "prospect", label: "Prospects" },
  { k: "archived", label: "Archived" },
  { k: "all", label: "All" },
];

export default async function PoolPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; country?: string; tier?: string; flag?: string; view?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const labelMaps = await loadTaxonomyLabelMaps();
  const categoryOptions = await getTaxonomyOptions("CATEGORY");
  const industryOptions = await getTaxonomyOptions("INDUSTRY");
  const view = VIEWS.some((v) => v.k === sp.view) ? sp.view! : "prospect";

  const statusWhere =
    view === "archived" ? "ARCHIVED" : view === "all" ? { in: ["PROSPECT", "ARCHIVED"] } : "PROSPECT";

  const partners = await db.partner.findMany({
    where: {
      status: statusWhere as never,
      ...(sp.q ? { name: { contains: sp.q } } : {}),
      ...(sp.category ? { category: sp.category } : {}),
      ...(sp.tier ? { tier: sp.tier } : {}),
      ...(sp.flag && view !== "archived" ? { poolFlag: sp.flag } : {}),
      ...(sp.country ? { country: { contains: sp.country } } : {}),
    },
    include: { contacts: true, opportunities: true, events: true, trainings: true },
    orderBy: [{ status: "asc" }, { tier: "asc" }, { name: "asc" }],
  });

  const counts = {
    prospect: await db.partner.count({ where: { status: "PROSPECT" } }),
    archived: await db.partner.count({ where: { status: "ARCHIVED" } }),
  };

  const countries = await db.partner.findMany({
    where: { status: { in: ["PROSPECT", "ARCHIVED"] } },
    select: { country: true },
    distinct: ["country"],
  });

  const flagTone = (f: string) =>
    f === "ADVANCING" ? "green" : f === "WATCHING" ? "amber" : f === "DROPPED" ? "zinc" : "blue";

  const qs = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { q: sp.q, category: sp.category, tier: sp.tier, country: sp.country, view, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `/pool?${params.toString()}`;
  };

  return (
    <div className="pb-16">
      <PageHeader
        title="Partner Pool"
        desc="Prospects and archived partners; manage active partners on the Active Partners page"
        actions={<AddPartnerForm taxonomy={{ CATEGORY: categoryOptions, INDUSTRY: industryOptions }} />}
      />

      <div className="px-8">
        {/* 状态 Tab */}
        <div className="flex items-center gap-1 mb-4 border-b border-zinc-200 overflow-x-auto pb-px -mx-1 px-1">
          {VIEWS.map((v) => {
            const active = v.k === view;
            const badge = v.k === "prospect" ? counts.prospect : v.k === "archived" ? counts.archived : counts.prospect + counts.archived;
            return (
              <Link
                key={v.k}
                href={qs({ view: v.k, flag: undefined })}
                className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
                  active ? "border-indigo-600 text-indigo-600 font-medium" : "border-transparent text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {v.label}
                <span className="ml-1.5 text-xs text-zinc-400">{badge}</span>
              </Link>
            );
          })}
        </div>

        {/* 筛选 */}
        <form className="flex flex-wrap gap-2 mb-4" method="get">
          <input type="hidden" name="view" value={view} />
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="Search company name…"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm w-full sm:w-44 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select name="category" defaultValue={sp.category ?? ""} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">All categories</option>
            {categoryOptions.map((o) => (
              <option key={o.code} value={o.code}>{o.label}</option>
            ))}
          </select>
          <select name="tier" defaultValue={sp.tier ?? ""} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">All tiers</option>
            <option value="A">Tier A — pursue now</option>
            <option value="B">Tier B — high priority</option>
            <option value="C">Tier C — follow up later</option>
          </select>
          {view !== "archived" && (
            <select name="flag" defaultValue={sp.flag ?? ""} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm">
              <option value="">All statuses</option>
              {Object.entries(POOL_FLAG_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          )}
          <select name="country" defaultValue={sp.country ?? ""} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">All countries</option>
            {countries.filter((c) => c.country).map((c) => (
              <option key={c.country!} value={c.country!}>{c.country}</option>
            ))}
          </select>
          <button className="rounded-lg bg-zinc-900 text-white px-4 py-1.5 text-sm hover:bg-zinc-700">Filter</button>
          {(sp.q || sp.category || sp.tier || sp.flag || sp.country) && (
            <Link href={qs({ q: undefined, category: undefined, tier: undefined, country: undefined, flag: undefined })} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-800">
              Clear
            </Link>
          )}
        </form>

        {/* 列表 */}
        <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-3 py-3 font-medium">Category</th>
                <th className="px-3 py-3 font-medium">Region</th>
                <th className="px-3 py-3 font-medium">Tier</th>
                <th className="px-3 py-3 font-medium">Verification</th>
                <th className="px-3 py-3 font-medium">Completeness</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => {
                const c = computeCompleteness(p);
                const archived = p.status === "ARCHIVED";
                return (
                  <tr key={p.id} className={`border-b border-zinc-50 hover:bg-zinc-50/60 ${archived ? "opacity-70" : ""}`}>
                    <td className="px-4 py-3">
                      <Link href={`/partners/${p.id}`} className="font-medium text-zinc-900 hover:text-indigo-600">
                        {p.name}
                      </Link>
                      {p.knownClients && (
                        <div className="text-xs text-zinc-400 mt-0.5 max-w-[260px] truncate">{p.knownClients}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{labelFromMap(labelMaps.CATEGORY, p.category)}</td>
                    <td className="px-3 py-3 text-zinc-600 whitespace-nowrap">{p.city ?? p.country ?? "—"}</td>
                    <td className="px-3 py-3">
                      {p.tier ? <Badge tone={tierTone(p.tier)}>Tier {p.tier}</Badge> : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={p.aiVerified === "VERIFIED" ? "green" : "zinc"}>
                        {AI_VERIFIED_LABELS[p.aiVerified ?? "UNKNOWN"]}
                      </Badge>
                    </td>
                    <td className="px-3 py-3"><ScoreBar score={c.score} /></td>
                    <td className="px-3 py-3">
                      {archived ? (
                        <Badge tone="zinc">Archived</Badge>
                      ) : (
                        <Badge tone={flagTone(p.poolFlag)}>{POOL_FLAG_LABELS[p.poolFlag]}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {archived ? (
                          <form action={restorePartnerAction.bind(null, p.id)}>
                            <button className="rounded-md bg-indigo-600 text-white px-2.5 py-1 text-xs hover:bg-indigo-700" title={`Restore as ${p.prevStatus === "ACTIVE" ? "active partner" : "prospect"}`}>
                              Restore{p.prevStatus === "ACTIVE" ? " as active" : " as prospect"}
                            </button>
                          </form>
                        ) : (
                          <>
                            <form action={promotePartnerAction.bind(null, p.id)}>
                              <button className="rounded-md bg-indigo-600 text-white px-2.5 py-1 text-xs hover:bg-indigo-700" title="Promote to active partner">
                                Promote
                              </button>
                            </form>
                            {p.poolFlag !== "WATCHING" && (
                              <form action={setPoolFlagAction.bind(null, p.id, "WATCHING")}>
                                <button className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50">Watch</button>
                              </form>
                            )}
                            {p.poolFlag !== "DROPPED" ? (
                              <form action={setPoolFlagAction.bind(null, p.id, "DROPPED")}>
                                <button className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-400 hover:text-red-600 hover:border-red-200">Drop</button>
                              </form>
                            ) : (
                              <form action={setPoolFlagAction.bind(null, p.id, "NEW")}>
                                <button className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50">Restore</button>
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
          {partners.length === 0 && <EmptyState text={view === "archived" ? "No archived partners" : "No partners match your filters"} />}
          </div>
        </div>
      </div>
    </div>
  );
}
