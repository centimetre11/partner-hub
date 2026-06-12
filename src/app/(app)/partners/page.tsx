import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, ScoreBar, tierTone, EmptyState } from "@/components/ui";
import { CATEGORY_LABELS, stageName } from "@/lib/constants";
import { computeCompleteness, staleDays } from "@/lib/completeness";

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; owner?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;

  const partners = await db.partner.findMany({
    where: {
      status: "ACTIVE",
      ...(sp.q ? { name: { contains: sp.q } } : {}),
      ...(sp.stage ? { pipelineStage: parseInt(sp.stage, 10) } : {}),
      ...(sp.owner ? { ownerId: sp.owner } : {}),
    },
    include: { contacts: true, opportunities: true, events: { orderBy: { createdAt: "desc" } }, trainings: true, owner: true },
    orderBy: { pipelineStage: "desc" },
  });

  const users = await db.user.findMany();

  return (
    <div className="pb-16">
      <PageHeader
        title="正式伙伴"
        desc={`${partners.length} 家正在经营的伙伴 · 按八大模块管理，跟踪 Pipeline 十阶段`}
      />
      <div className="px-8">
        <form className="flex flex-wrap gap-2 mb-4" method="get">
          <input name="q" defaultValue={sp.q} placeholder="搜索公司名…" className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm w-44" />
          <select name="stage" defaultValue={sp.stage ?? ""} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">全部阶段</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((s) => (
              <option key={s} value={s}>{s}. {stageName(s)}</option>
            ))}
          </select>
          <select name="owner" defaultValue={sp.owner ?? ""} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">全部负责人</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <button className="rounded-lg bg-zinc-900 text-white px-4 py-1.5 text-sm hover:bg-zinc-700">筛选</button>
        </form>

        {partners.length === 0 ? (
          <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm">
            <EmptyState text="还没有正式伙伴。去候选池把确认合作的伙伴「转正」吧。" />
            <div className="text-center pb-8 -mt-4">
              <Link href="/pool" className="text-sm text-indigo-600 hover:underline">前往候选池 →</Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {partners.map((p) => {
              const c = computeCompleteness(p);
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
                        {p.tier && <Badge tone={tierTone(p.tier)}>Tier {p.tier}</Badge>}
                        <Badge tone="zinc">{CATEGORY_LABELS[p.category]}</Badge>
                        {stale > 30 && <Badge tone="red">停滞 {stale} 天</Badge>}
                      </div>
                      <div className="text-xs text-zinc-400 mt-1">
                        {p.city ?? p.country ?? "—"} · 负责人：{p.owner?.name ?? "未指定"}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-zinc-400">阶段 {p.pipelineStage}/10</div>
                      <div className="text-sm font-medium text-indigo-700">{stageName(p.pipelineStage)}</div>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${p.pipelineStage * 10}%` }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                    <span>
                      联系人 {p.contacts.length} · 商机 {p.opportunities.length} · 动态 {p.events.length}
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
