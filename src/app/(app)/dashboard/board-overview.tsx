import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Card, ScoreBar, tierTone } from "@/components/ui";
import { CATEGORY_LABELS, PIPELINE_STAGES, POOL_FLAG_LABELS } from "@/lib/constants";
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
    include: { contacts: true, opportunities: true, events: true, trainings: true },
  });
  const openTodos = await db.todoItem.count({ where: { status: "OPEN" } });
  const overdueTodos = await db.todoItem.count({ where: { status: "OPEN", dueDate: { lt: new Date() } } });
  const doneTodos = await db.todoItem.count({ where: { status: "DONE" } });

  const prospects = all.filter((p) => p.status === "PROSPECT");
  const active = all.filter((p) => p.status === "ACTIVE");
  const archived = all.filter((p) => p.status === "ARCHIVED");

  // 漏斗
  const funnel = [
    { label: "候选池总数", value: prospects.length + active.length + archived.length },
    { label: "推进中候选", value: prospects.filter((p) => p.poolFlag === "ADVANCING").length },
    { label: "正式伙伴", value: active.length },
    { label: "POC及以后（阶段≥5）", value: active.filter((p) => p.pipelineStage >= 5).length },
    { label: "已签约（阶段≥7）", value: active.filter((p) => p.pipelineStage >= 7).length },
  ];

  // Pipeline 分布（正式伙伴）
  const stageDist = PIPELINE_STAGES.map((s) => ({
    label: `${s.stage}. ${s.name}`,
    value: active.filter((p) => p.pipelineStage === s.stage).length,
  }));

  // Tier / 类别 / 国家分布
  const tierDist = ["A", "B", "C"].map((t) => ({ t, n: all.filter((p) => p.tier === t && p.status !== "ARCHIVED").length }));
  const noTier = all.filter((p) => !p.tier && p.status !== "ARCHIVED").length;
  const catDist = Object.entries(CATEGORY_LABELS)
    .map(([k, v]) => ({ label: v, value: all.filter((p) => p.category === k && p.status !== "ARCHIVED").length }))
    .filter((x) => x.value > 0);
  const countryCount = new Map<string, number>();
  for (const p of all) {
    if (p.status === "ARCHIVED") continue;
    const key = (p.country ?? "未知").split("/")[0].trim();
    countryCount.set(key, (countryCount.get(key) ?? 0) + 1);
  }
  const countries = [...countryCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  // 完整度排行（正式优先，候选推进中其次）
  const ranked = [...active, ...prospects.filter((p) => p.poolFlag === "ADVANCING")]
    .map((p) => ({ p, c: computeCompleteness(p), stale: staleDays(p) }))
    .sort((a, b) => a.c.score - b.c.score)
    .slice(0, 10);

  const maxStage = Math.max(...stageDist.map((s) => s.value), 1);
  const maxCat = Math.max(...catDist.map((s) => s.value), 1);
  const maxCountry = Math.max(...countries.map((c) => c[1]), 1);

  return (
    <div className="px-8 space-y-5">
      {/* 顶部统计 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "候选池", value: prospects.length },
          { label: "正式伙伴", value: active.length },
          { label: "未完成待办", value: openTodos },
          { label: "逾期待办", value: overdueTodos },
          { label: "已完成待办", value: doneTodos },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-4">
            <div className="text-2xl font-bold tabular-nums text-zinc-900">{s.value}</div>
            <div className="text-xs text-zinc-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* 转化漏斗 */}
        <Card title="候选 → 签约转化漏斗">
          <div className="space-y-2.5">
            {funnel.map((f, i) => (
              <Bar key={f.label} label={f.label} value={f.value} max={funnel[0].value || 1} tone={["bg-sky-400", "bg-sky-500", "bg-indigo-500", "bg-indigo-600", "bg-purple-600"][i]} />
            ))}
          </div>
        </Card>

        {/* Pipeline 分布 */}
        <Card title="正式伙伴 Pipeline 阶段分布">
          <div className="space-y-2">
            {stageDist.map((s) => (
              <Bar key={s.label} label={s.label} value={s.value} max={maxStage} />
            ))}
          </div>
        </Card>

        {/* Tier + 类别 */}
        <Card title="Tier 与类别分布">
          <div className="flex gap-3 mb-5">
            {tierDist.map(({ t, n }) => (
              <Link key={t} href={`/pool?tier=${t}`} className="flex-1 rounded-lg border border-zinc-100 p-3 text-center hover:border-indigo-300">
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

        {/* 国家分布 */}
        <Card title="国家/地区分布">
          <div className="space-y-2">
            {countries.map(([c, n]) => (
              <Bar key={c} label={c} value={n} max={maxCountry} tone="bg-amber-500" />
            ))}
          </div>
        </Card>
      </div>

      {/* 完整度排行 */}
      <Card title="信息完整度待提升排行（最缺信息的 10 家）">
        <div className="divide-y divide-zinc-50">
          {ranked.map(({ p, c, stale }) => (
            <div key={p.id} className="flex items-center gap-4 py-3">
              <Link href={`/partners/${p.id}`} className="w-48 shrink-0 text-sm font-medium text-zinc-800 hover:text-indigo-600 truncate">
                {p.name}
              </Link>
              <Badge tone={p.status === "ACTIVE" ? "green" : "blue"}>{p.status === "ACTIVE" ? "正式" : POOL_FLAG_LABELS[p.poolFlag]}</Badge>
              <div className="w-36 shrink-0">
                <ScoreBar score={c.score} />
              </div>
              <div className="flex-1 text-xs text-zinc-400 truncate">缺：{c.missing.slice(0, 5).join("、")}{c.missing.length > 5 ? "…" : ""}</div>
              {stale > 30 && <span className="text-xs text-red-500 shrink-0">{stale}天无动态</span>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
