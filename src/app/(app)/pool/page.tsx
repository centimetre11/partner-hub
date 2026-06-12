import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, ScoreBar, tierTone, EmptyState } from "@/components/ui";
import { AI_VERIFIED_LABELS, CATEGORY_LABELS, POOL_FLAG_LABELS } from "@/lib/constants";
import { computeCompleteness } from "@/lib/completeness";
import { promotePartnerAction, setPoolFlagAction } from "@/lib/actions";
import { AddPartnerForm } from "./add-partner-form";

export default async function PoolPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; country?: string; tier?: string; flag?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;

  const partners = await db.partner.findMany({
    where: {
      status: "PROSPECT",
      ...(sp.q ? { name: { contains: sp.q } } : {}),
      ...(sp.category ? { category: sp.category } : {}),
      ...(sp.tier ? { tier: sp.tier } : {}),
      ...(sp.flag ? { poolFlag: sp.flag } : {}),
      ...(sp.country ? { country: { contains: sp.country } } : {}),
    },
    include: { contacts: true, opportunities: true, events: true, trainings: true },
    orderBy: [{ tier: "asc" }, { name: "asc" }],
  });

  const countries = await db.partner.findMany({
    where: { status: "PROSPECT" },
    select: { country: true },
    distinct: ["country"],
  });

  const flagTone = (f: string) =>
    f === "ADVANCING" ? "green" : f === "WATCHING" ? "amber" : f === "DROPPED" ? "zinc" : "blue";

  return (
    <div className="pb-16">
      <PageHeader
        title="候选池"
        desc={`${partners.length} 家候选伙伴 · 来自材料研究清单，确认后转为正式伙伴管理`}
        actions={<AddPartnerForm />}
      />

      <div className="px-8">
        {/* 筛选 */}
        <form className="flex flex-wrap gap-2 mb-4" method="get">
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="搜索公司名…"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select name="category" defaultValue={sp.category ?? ""} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">全部类别</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select name="tier" defaultValue={sp.tier ?? ""} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">全部 Tier</option>
            <option value="A">Tier A 立即打</option>
            <option value="B">Tier B 重点打</option>
            <option value="C">Tier C 后续跟进</option>
          </select>
          <select name="flag" defaultValue={sp.flag ?? ""} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">全部状态</option>
            {Object.entries(POOL_FLAG_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select name="country" defaultValue={sp.country ?? ""} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">全部国家</option>
            {countries.filter((c) => c.country).map((c) => (
              <option key={c.country!} value={c.country!}>{c.country}</option>
            ))}
          </select>
          <button className="rounded-lg bg-zinc-900 text-white px-4 py-1.5 text-sm hover:bg-zinc-700">筛选</button>
          {(sp.q || sp.category || sp.tier || sp.flag || sp.country) && (
            <Link href="/pool" className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-800">
              清空
            </Link>
          )}
        </form>

        {/* 列表 */}
        <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500">
                <th className="px-4 py-3 font-medium">公司</th>
                <th className="px-3 py-3 font-medium">类别</th>
                <th className="px-3 py-3 font-medium">地区</th>
                <th className="px-3 py-3 font-medium">Tier</th>
                <th className="px-3 py-3 font-medium">验证</th>
                <th className="px-3 py-3 font-medium">信息完整度</th>
                <th className="px-3 py-3 font-medium">池状态</th>
                <th className="px-3 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => {
                const c = computeCompleteness(p);
                return (
                  <tr key={p.id} className="border-b border-zinc-50 hover:bg-zinc-50/60">
                    <td className="px-4 py-3">
                      <Link href={`/partners/${p.id}`} className="font-medium text-zinc-900 hover:text-indigo-600">
                        {p.name}
                      </Link>
                      {p.knownClients && (
                        <div className="text-xs text-zinc-400 mt-0.5 max-w-[260px] truncate">{p.knownClients}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{CATEGORY_LABELS[p.category] ?? p.category}</td>
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
                      <Badge tone={flagTone(p.poolFlag)}>{POOL_FLAG_LABELS[p.poolFlag]}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <form action={promotePartnerAction.bind(null, p.id)}>
                          <button className="rounded-md bg-indigo-600 text-white px-2.5 py-1 text-xs hover:bg-indigo-700" title="转为正式伙伴">
                            转正
                          </button>
                        </form>
                        {p.poolFlag !== "WATCHING" && (
                          <form action={setPoolFlagAction.bind(null, p.id, "WATCHING")}>
                            <button className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50">观察</button>
                          </form>
                        )}
                        {p.poolFlag !== "DROPPED" ? (
                          <form action={setPoolFlagAction.bind(null, p.id, "DROPPED")}>
                            <button className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-400 hover:text-red-600 hover:border-red-200">放弃</button>
                          </form>
                        ) : (
                          <form action={setPoolFlagAction.bind(null, p.id, "NEW")}>
                            <button className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50">恢复</button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {partners.length === 0 && <EmptyState text="没有符合条件的候选伙伴" />}
        </div>
      </div>
    </div>
  );
}
