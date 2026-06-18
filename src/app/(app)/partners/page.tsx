import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, ScoreBar, tierTone, EmptyState } from "@/components/ui";
import { computeCompleteness, staleDays } from "@/lib/completeness";
import { getTaxonomyOptions, labelFromMap, loadTaxonomyLabelMaps, parseIndustries } from "@/lib/taxonomy";
import { AddPartnerForm } from "../pool/add-partner-form";
import { getServerI18n, stageName } from "@/lib/server-i18n";

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; owner?: string; tier?: string; industry?: string }>;
}) {
  await requireUser();
  const { labels, messages: m } = await getServerI18n();
  const sp = await searchParams;
  const labelMaps = await loadTaxonomyLabelMaps();
  const industryOptions = await getTaxonomyOptions("INDUSTRY");
  const categoryOptions = await getTaxonomyOptions("CATEGORY");

  const partners = await db.partner.findMany({
    where: {
      status: "ACTIVE",
      ...(sp.q ? { name: { contains: sp.q } } : {}),
      ...(sp.stage ? { pipelineStage: parseInt(sp.stage, 10) } : {}),
      ...(sp.owner
        ? {
            OR: [
              { salesUserId: sp.owner },
              { ownerId: sp.owner },
              { presalesUserId: sp.owner },
            ],
          }
        : {}),
      ...(sp.tier ? { tier: sp.tier } : {}),
      ...(sp.industry
        ? {
            OR: [
              { industry: sp.industry },
              { industries: { contains: `"${sp.industry}"` } },
            ],
          }
        : {}),
    },
    include: {
      contacts: true,
      opportunities: true,
      events: { orderBy: { createdAt: "desc" } },
      trainings: true,
      owner: true,
      salesUser: true,
      presalesUser: true,
    },
    orderBy: { pipelineStage: "desc" },
  });

  const users = await db.user.findMany();

  return (
    <div className="pb-16">
      <PageHeader
        title={m.partners.title}
        desc={m.partners.desc.replace("{count}", String(partners.length))}
        actions={<AddPartnerForm intent="active" taxonomy={{ CATEGORY: categoryOptions, INDUSTRY: industryOptions }} />}
      />
      <div className="px-8">
        <form className="flex flex-wrap gap-2 mb-4" method="get">
          <input name="q" defaultValue={sp.q} placeholder={m.partners.searchPlaceholder} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm w-full sm:w-44" />
          <select name="stage" defaultValue={sp.stage ?? ""} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{m.partners.allStages}</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => (
              <option key={s} value={s}>{s}. {stageName(labels, s)}</option>
            ))}
          </select>
          <select name="owner" defaultValue={sp.owner ?? ""} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{m.partners.allTeamMembers}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select name="tier" defaultValue={sp.tier ?? ""} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{m.partners.allTiers}</option>
            <option value="A">{m.partners.tierA}</option>
            <option value="B">{m.partners.tierB}</option>
            <option value="C">{m.partners.tierC}</option>
          </select>
          <select name="industry" defaultValue={sp.industry ?? ""} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{m.partners.allIndustries}</option>
            {industryOptions.map((o) => (
              <option key={o.code} value={o.code}>{o.label}</option>
            ))}
          </select>
          <button className="rounded-lg bg-zinc-900 text-white px-4 py-1.5 text-sm hover:bg-zinc-700">{m.common.filter}</button>
        </form>

        {partners.length === 0 ? (
          <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm">
            <EmptyState text={m.partners.empty} />
            <div className="text-center pb-8 -mt-4">
              <Link href="/pool" className="text-sm text-indigo-600 hover:underline">{m.partners.goToPool}</Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {partners.map((p) => {
              const c = computeCompleteness(p, labels);
              const stale = staleDays(p);
              return (
                <Link
                  key={p.id}
                  href={`/partners/${p.id}`}
                  className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-5 hover:border-indigo-300 hover:shadow-md transition-all block"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-zinc-900">{p.name}</span>
                        {p.tier && <Badge tone={tierTone(p.tier)}>{m.common.tier} {p.tier}</Badge>}
                        <Badge tone="zinc">{labelFromMap(labelMaps.CATEGORY, p.category)}</Badge>
                        {parseIndustries(p).map((code) => (
                          <Badge key={code} tone="blue">{labelFromMap(labelMaps.INDUSTRY, code)}</Badge>
                        ))}
                        {stale > 30 && <Badge tone="red">{m.partners.stalled.replace("{days}", String(stale))}</Badge>}
                      </div>
                      <div className="text-xs text-zinc-400 mt-1">
                        {p.city ?? p.country ?? "—"} · {m.partners.salesOwner}: {p.salesUser?.name ?? p.owner?.name ?? "—"} · {m.partners.presalesOwner}: {p.presalesUser?.name ?? "—"}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-zinc-400">{m.partners.stageOf.replace("{n}", String(p.pipelineStage))}</div>
                      <div className="text-sm font-medium text-indigo-700">{stageName(labels, p.pipelineStage)}</div>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${p.pipelineStage * 10}%` }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                    <span>
                      {m.partners.contactsCount.replace("{n}", String(p.contacts.length))} · {m.partners.opportunitiesCount.replace("{n}", String(p.opportunities.length))} · {m.partners.activitiesCount.replace("{n}", String(p.events.length))}
                    </span>
                    <div className="w-32">
                      <ScoreBar score={c.score} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
