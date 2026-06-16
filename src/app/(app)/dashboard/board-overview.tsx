import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Card, ScoreBar, tierTone } from "@/components/ui";
import { CATEGORY_LABELS, PIPELINE_STAGES } from "@/lib/constants";
import { computeCompleteness, staleDays } from "@/lib/completeness";

function Bar({ label, value, max, tone = "bg-indigo-500", suffix }: { label: string; value: number; max: number; tone?: string; suffix?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-36 text-zinc-600 text-xs shrink-0 truncate">{label}</div>
      <div className="flex-1 h-5 bg-zinc-50 rounded-md overflow-hidden">
        <div className={`h-full ${tone} rounded-md transition-all`} style={{ width: max ? `${(value / max) * 100}%` : 0 }} />
      </div>
      <div className="w-12 text-right text-xs tabular-nums text-zinc-500 shrink-0">
        {value}{suffix}
      </div>
    </div>
  );
}

export async function BoardOverview() {
  const all = await db.partner.findMany({
    where: { status: { in: ["ACTIVE", "PROSPECT"] } },
    include: { contacts: true, opportunities: true, events: true, trainings: true },
  });
  const openTodos = await db.todoItem.count({ where: { status: "OPEN" } });
  const overdueTodos = await db.todoItem.count({ where: { status: "OPEN", dueDate: { lt: new Date() } } });
  const activeOppCount = await db.opportunity.count({
    where: { status: "ACTIVE", partner: { status: "ACTIVE" } },
  });

  const active = all.filter((p) => p.status === "ACTIVE");
  const prospects = all.filter((p) => p.status === "PROSPECT");

  // 正式伙伴经营漏斗（不含候选池）
  const funnel = [
    { label: "正式伙伴", value: active.length },
    { label: "需求诊断及以后（≥3）", value: active.filter((p) => p.pipelineStage >= 3).length },
    { label: "POC 及以后（≥5）", value: active.filter((p) => p.pipelineStage >= 5).length },
    { label: "已签约（≥7）", value: active.filter((p) => p.pipelineStage >= 7).length },
    { label: "首单交付（≥8）", value: active.filter((p) => p.pipelineStage >= 8).length },
  ];

  const stageDist = PIPELINE_STAGES.map((s) => ({
    label: `${s.stage}. ${s.name}`,
    value: active.filter((p) => p.pipelineStage === s.stage).length,
  }));

  const tierDist = ["A", "B", "C"].map((t) => ({ t, n: active.filter((p) => p.tier === t).length }));
  const noTier = active.filter((p) => !p.tier).length;
  const catDist = Object.entries(CATEGORY_LABELS)
    .map(([k, v]) => ({ label: v, value: active.filter((p) => p.category === k).length }))
    .filter((x) => x.value > 0);
  const countryCount = new Map<string, number>();
  for (const p of active) {
    const key = (p.country ?? "未知").split("/")[0].trim();
    countryCount.set(key, (countryCount.get(key) ?? 0) + 1);
  }
  const countries = [...countryCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const staleActive = active
    .map((p) => ({ p, stale: staleDays(p) }))
    .filter((x) => x.stale > 30)
    .sort((a, b) => b.stale - a.stale)
    .slice(0, 8);

  // 完整度排行：仅正式伙伴
  const ranked = active
    .map((p) => ({ p, c: computeCompleteness(p), stale: staleDays(p) }))
    .sort((a, b) => a.c.score - b.c.score)
    .slice(0, 10);

  const maxStage = Math.max(...stageDist.map((s) => s.value), 1);
  const maxCat = Math.max(...catDist.map((s) => s.value), 1);
  const maxCountry = Math.max(...countries.map((c) => c[1]), 1);
  const pocPlus = active.filter((p) => p.pipelineStage >= 5).length;

  return (
    <div className="px-8 space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "正式伙伴", value: active.length, tone: "text-indigo-600" },
          { label: "POC 及以后", value: pocPlus, tone: "text-purple-600" },
          { label: "进行中商机", value: activeOppCount, tone: "text-sky-600" },
          { label: "未完成待办", value: openTodos, tone: "text-zinc-900" },
          { label: "逾期待办", value: overdueTodos, tone: overdueTodos ? "text-red-600" : "text-zinc-900" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-4">
            <div className={`text-2xl font-bold tabular-nums ${s.tone}`}>{s.value}</div>
            <div className="text-xs text-zinc-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {prospects.length > 0 && (
        <p className="text-xs text-zinc-400">
          候选资源池 {prospects.length} 家 ·{" "}
          <Link href="/pool" className="text-indigo-600 hover:underline">
            前往伙伴库
          </Link>
          （不作为经营看板主统计）
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card title="正式伙伴经营漏斗">
          <div className="space-y-2.5">
            {funnel.map((f, i) => (
              <Bar
                key={f.label}
                label={f.label}
                value={f.value}
                max={funnel[0].value || 1}
                tone={["bg-indigo-400", "bg-indigo-500", "bg-indigo-600", "bg-purple-600", "bg-purple-700"][i]}
              />
            ))}
          </div>
        </Card>

        <Card title="正式伙伴 Pipeline 阶段分布">
          <div className="space-y-2">
            {stageDist.map((s) => (
              <Bar key={s.label} label={s.label} value={s.value} max={maxStage} />
            ))}
          </div>
        </Card>

        <Card title="Tier 与类别（正式伙伴）">
          <div className="flex gap-3 mb-5">
            {tierDist.map(({ t, n }) => (
              <Link key={t} href={`/partners?tier=${t}`} className="flex-1 rounded-lg border border-zinc-100 p-3 text-center hover:border-indigo-300">
                <Badge tone={tierTone(t)}>Tier {t}</Badge>
                <div className="text-xl font-bold mt-1.5 tabular-nums">{n}</div>
              </Link>
            ))}
            <div className="flex-1 rounded-lg border border-zinc-100 p-3 text-center">
              <Badge tone="zinc">未分级</Badge>
              <div className="text-xl font-bold mt-1.5 tabular-nums">{noTier}</div>
            </div>
          </div>
          <div className="space-y-2">
            {catDist.map((c) => (
              <Bar key={c.label} label={c.label} value={c.value} max={maxCat} tone="bg-emerald-500" />
            ))}
          </div>
        </Card>

        <Card title="国家/地区（正式伙伴）">
          <div className="space-y-2">
            {countries.map(([c, n]) => (
              <Bar key={c} label={c} value={n} max={maxCountry} tone="bg-amber-500" />
            ))}
          </div>
        </Card>
      </div>

      {staleActive.length > 0 && (
        <Card title="停滞预警（正式伙伴 · 超 30 天无动态）">
          <div className="divide-y divide-zinc-50">
            {staleActive.map(({ p, stale }) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link href={`/partners/${p.id}`} className="text-sm font-medium text-zinc-800 hover:text-indigo-600 truncate">
                  {p.name}
                </Link>
                <span className="text-xs text-red-500 shrink-0">{stale} 天无动态</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="档案完整度待提升（正式伙伴 Top 10）">
        <div className="divide-y divide-zinc-50">
          {ranked.map(({ p, c, stale }) => (
            <div key={p.id} className="flex items-center gap-4 py-3">
              <Link href={`/partners/${p.id}`} className="w-48 shrink-0 text-sm font-medium text-zinc-800 hover:text-indigo-600 truncate">
                {p.name}
              </Link>
              {p.tier && <Badge tone={tierTone(p.tier)}>Tier {p.tier}</Badge>}
              <div className="w-36 shrink-0">
                <ScoreBar score={c.score} />
              </div>
              <div className="flex-1 text-xs text-zinc-400 truncate">
                缺：{c.missing.slice(0, 5).join("、")}{c.missing.length > 5 ? "…" : ""}
              </div>
              {stale > 30 && <span className="text-xs text-red-500 shrink-0">{stale}天无动态</span>}
            </div>
          ))}
          {ranked.length === 0 && <p className="py-6 text-sm text-zinc-400 text-center">暂无正式伙伴</p>}
        </div>
      </Card>
    </div>
  );
}
