import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Card, ScoreBar, TierBadge, tierTone } from "@/components/ui";
import { normalizePartnerTier } from "@/lib/tier";
import { computeCompleteness, staleDays } from "@/lib/completeness";
import { overdueDueDateBefore } from "@/lib/todo-dates";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";
import { OPEN_OPPORTUNITY_STATUSES } from "@/lib/opportunity-status";
import { loadSegmentInsightSummary } from "@/lib/customer-segment";
import { loadTaxonomyLabelMaps, labelFromMap } from "@/lib/taxonomy";

function Bar({ label, value, max, tone = "bg-slate-500", suffix }: { label: string; value: number; max: number; tone?: string; suffix?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-36 text-slate-600 text-xs shrink-0 truncate">{label}</div>
      <div className="flex-1 h-5 bg-slate-50 rounded-md overflow-hidden">
        <div className={`h-full ${tone} rounded-md`} style={{ width: max ? `${(value / max) * 100}%` : 0 }} />
      </div>
      <div className="w-12 text-right text-xs tabular-nums text-slate-500 shrink-0">
        {value}{suffix}
      </div>
    </div>
  );
}

export async function BoardOverview() {
  const { labels, messages: m } = await getServerI18n();
  const b = m.dashboard.board;
  const L = labelConstants(labels);

  const [all, segmentSummary, labelMaps, openTodos, overdueTodos, activeOppCount] = await Promise.all([
    db.partner.findMany({
      where: { status: { in: ["ACTIVE", "PROSPECT"] } },
      include: {
        contacts: { select: { role: true, email: true, phone: true, contactInfo: true } },
        opportunities: { select: { id: true } },
        events: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 5 },
        trainings: { select: { status: true } },
      },
    }),
    loadSegmentInsightSummary(),
    loadTaxonomyLabelMaps(),
    db.todoItem.count({ where: { status: "OPEN" } }),
    db.todoItem.count({ where: { status: "OPEN", dueDate: { lt: overdueDueDateBefore() } } }),
    db.opportunity.count({
      where: { status: { in: [...OPEN_OPPORTUNITY_STATUSES] }, partner: { status: "ACTIVE" } },
    }),
  ]);

  const active = all.filter((p) => p.status === "ACTIVE");
  const prospects = all.filter((p) => p.status === "PROSPECT");

  const funnel = [
    { label: b.funnelActive, value: active.length },
    { label: b.funnelActiveProgress, value: active.filter((p) => p.pipelineStage >= 2).length },
    { label: b.funnelSystem, value: active.filter((p) => p.pipelineStage >= 3).length },
  ];

  const stageDist = labels.pipelineStages.map((s) => ({
    label: `${s.stage}. ${s.name}`,
    value: active.filter((p) => p.pipelineStage === s.stage).length,
    tone: s.stage === 1 ? "bg-sky-500" : s.stage === 2 ? "bg-amber-500" : "bg-emerald-500",
  }));

  const tierDist = ["A", "B", "C"].map((t) => ({
    t,
    n: active.filter((p) => normalizePartnerTier(p.tier) === t).length,
  }));
  const noTier = active.filter((p) => !normalizePartnerTier(p.tier)).length;
  const catDist = Object.entries(L.CATEGORY_LABELS)
    .map(([k, v]) => ({ label: v, value: active.filter((p) => p.category === k).length }))
    .filter((x) => x.value > 0);
  const countryCount = new Map<string, number>();
  for (const p of active) {
    const key = (p.country ?? b.unknownCountry).split("/")[0].trim();
    countryCount.set(key, (countryCount.get(key) ?? 0) + 1);
  }
  const countries = [...countryCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const staleActive = active
    .map((p) => ({ p, stale: staleDays(p) }))
    .filter((x) => x.stale > 30)
    .sort((a, b) => b.stale - a.stale)
    .slice(0, 8);

  const ranked = active
    .map((p) => ({
      p,
      c: computeCompleteness(p as Parameters<typeof computeCompleteness>[0], labels),
      stale: staleDays(p),
    }))
    .sort((a, b) => a.c.score - b.c.score)
    .slice(0, 10);

  const maxStage = Math.max(...stageDist.map((s) => s.value), 1);
  const maxCat = Math.max(...catDist.map((s) => s.value), 1);
  const maxCountry = Math.max(...countries.map((c) => c[1]), 1);
  const pocPlus = active.filter((p) => p.pipelineStage >= 2).length;

  return (
    <div className="px-8 space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: b.statActivePartners, value: active.length, tone: "text-sky-600" },
          { label: b.statPocOnward, value: pocPlus, tone: "text-purple-600" },
          { label: b.statActiveOpps, value: activeOppCount, tone: "text-sky-600" },
          { label: b.statOpenTodos, value: openTodos, tone: "text-slate-900" },
          { label: b.statOverdueTodos, value: overdueTodos, tone: overdueTodos ? "text-red-600" : "text-slate-900" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-4">
            <div className={`text-2xl font-bold tabular-nums ${s.tone}`}>{s.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {prospects.length > 0 && (
        <p className="text-xs text-slate-400">
          {b.prospectPool.replace("{count}", String(prospects.length))}{" "}
          <Link href="/pool" className="text-sky-600 hover:underline">
            {b.goToPool}
          </Link>
          {b.notInBoardStats}
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card
          title={b.segmentInsightTitle}
          actions={
            <Link href="/segments" className="text-xs text-sky-600 hover:underline">
              {m.segments.boardLink}
            </Link>
          }
        >
          <p className="text-xs text-slate-500 mb-3">
            {b.segmentTaggedRate.replace("{rate}", String(segmentSummary.taggedRate))}
            {" · "}
            {m.segments.statTierA}: {segmentSummary.tierACount}
          </p>
          <div className="space-y-2">
            {segmentSummary.segments
              .filter((row) => row.code !== "_UNTAGGED")
              .slice(0, 5)
              .map((row) => (
                <Bar
                  key={row.code}
                  label={labelFromMap(labelMaps.CUSTOMER_SEGMENT, row.code, row.label)}
                  value={row.openOpps + row.won}
                  max={Math.max(...segmentSummary.segments.map((s) => s.openOpps + s.won), 1)}
                  tone="bg-violet-500"
                />
              ))}
          </div>
        </Card>

        <Card title={b.funnelTitle}>
          <div className="space-y-2.5">
            {funnel.map((f, i) => (
              <Bar
                key={f.label}
                label={f.label}
                value={f.value}
                max={funnel[0].value || 1}
                tone={["bg-slate-400", "bg-amber-500", "bg-emerald-600"][i]}
              />
            ))}
          </div>
        </Card>

        <Card title={b.pipelineDistTitle}>
          <div className="space-y-2">
            {stageDist.map((s) => (
              <Bar key={s.label} label={s.label} value={s.value} max={maxStage} tone={s.tone} />
            ))}
          </div>
        </Card>

        <Card title={b.tierCategoryTitle}>
          <div className="flex gap-3 mb-5">
            {tierDist.map(({ t, n }) => (
              <Link key={t} href={`/partners?tier=${t}`} className="flex-1 rounded-lg border border-slate-100 p-3 text-center hover:border-slate-300">
                <Badge tone={tierTone(t)}>{b.tierLabel.replace("{tier}", t)}</Badge>
                <div className="text-xl font-bold mt-1.5 tabular-nums">{n}</div>
              </Link>
            ))}
            <div className="flex-1 rounded-lg border border-slate-100 p-3 text-center">
              <Badge tone="zinc">{b.notTiered}</Badge>
              <div className="text-xl font-bold mt-1.5 tabular-nums">{noTier}</div>
            </div>
          </div>
          <div className="space-y-2">
            {catDist.map((c) => (
              <Bar key={c.label} label={c.label} value={c.value} max={maxCat} tone="bg-emerald-500" />
            ))}
          </div>
        </Card>

        <Card title={b.countryTitle}>
          <div className="space-y-2">
            {countries.map(([c, n]) => (
              <Bar key={c} label={c} value={n} max={maxCountry} tone="bg-amber-500" />
            ))}
          </div>
        </Card>
      </div>

      {staleActive.length > 0 && (
        <Card title={b.stallAlertsTitle}>
          <div className="divide-y divide-zinc-50">
            {staleActive.map(({ p, stale }) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link href={`/partners/${p.id}`} className="text-sm font-medium text-slate-800 hover:text-sky-600 truncate">
                  {p.name}
                </Link>
                <span className="text-xs text-red-500 shrink-0">{b.daysIdle.replace("{days}", String(stale))}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title={b.completenessTitle}>
        <div className="divide-y divide-zinc-50">
          {ranked.map(({ p, c, stale }) => (
            <div key={p.id} className="flex items-center gap-4 py-3">
              <Link href={`/partners/${p.id}`} className="w-48 shrink-0 text-sm font-medium text-slate-800 hover:text-sky-600 truncate">
                {p.name}
              </Link>
              {p.tier && <TierBadge tier={p.tier} />}
              <div className="w-36 shrink-0">
                <ScoreBar score={c.score} />
              </div>
              <div className="flex-1 text-xs text-slate-400 truncate">
                {b.missing}{c.missing.slice(0, 5).join(", ")}{c.missing.length > 5 ? "…" : ""}
              </div>
              {stale > 30 && (
                <span className="text-xs text-red-500 shrink-0">{b.daysIdleShort.replace("{days}", String(stale))}</span>
              )}
            </div>
          ))}
          {ranked.length === 0 && <p className="py-6 text-sm text-slate-400 text-center">{b.noActivePartners}</p>}
        </div>
      </Card>
    </div>
  );
}
