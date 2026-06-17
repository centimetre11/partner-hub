import Link from "next/link";
import { requireUser } from "@/lib/session";
import { PageHeader, Badge, fmtDateTime } from "@/components/ui";
import {
  TAXONOMY_DIMENSION_META,
  ensureTaxonomySeed,
  getTaxonomyOptions,
  type TaxonomyDimension,
} from "@/lib/taxonomy";
import {
  createTaxonomyOptionAction,
  deleteTaxonomyOptionAction,
} from "@/lib/taxonomy-actions";
import { db } from "@/lib/db";

const DIMS: TaxonomyDimension[] = ["ARCHETYPE", "INDUSTRY", "VALUE_PATTERN", "CATEGORY"];

export default async function TaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<{ dim?: string }>;
}) {
  await requireUser();
  await ensureTaxonomySeed();
  const sp = await searchParams;
  const activeDim = (DIMS.includes(sp.dim as TaxonomyDimension) ? sp.dim : "ARCHETYPE") as TaxonomyDimension;

  const options = await db.taxonomyOption.findMany({
    where: { dimension: activeDim },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: { createdBy: { select: { name: true } } },
  });

  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm";

  return (
    <div className="pb-16">
      <PageHeader
        title="维度库"
        desc="团队共用的分类词典：伙伴类型、行业、价值模式、竞品基因。伙伴实例从这里选值；不够用在此新增。"
      />

      <div className="px-8 max-w-3xl">
        <div className="flex flex-wrap gap-2 mb-6">
          {DIMS.map((dim) => (
            <Link
              key={dim}
              href={`/taxonomy?dim=${dim}`}
              className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${
                dim === activeDim
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-zinc-600 border-zinc-200 hover:border-indigo-300"
              }`}
            >
              {TAXONOMY_DIMENSION_META[dim].label}
            </Link>
          ))}
        </div>

        <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 mb-6 text-sm text-indigo-900">
          <p className="font-medium mb-1">和伙伴实例怎么配合？</p>
          <ul className="text-xs text-indigo-800/90 space-y-1 list-disc pl-4">
            <li><strong>维度库</strong>定义「有哪些选项」——改这里，所有伙伴的下拉/多选立刻多出可选项</li>
            <li><strong>伙伴实例</strong>只存选项编码（如 BANKING、BI_MIGRATOR），展示时查维度库拿中文名</li>
            <li><strong>打法库</strong>存 playbook/pitch 时，会快照当时的维度标签，方便按行业/类型检索参考</li>
            <li>内置选项不可删；自定义选项不用了可在此删除</li>
          </ul>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold mb-3">添加 · {TAXONOMY_DIMENSION_META[activeDim].label}</h2>
          <form action={createTaxonomyOptionAction} className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <input type="hidden" name="dimension" value={activeDim} />
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-zinc-500">显示名称 *</span>
              <input name="label" required placeholder="如：云渠道联合" className={input} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-500">编码（可选，留空自动生成）</span>
              <input name="code" placeholder="CLOUD_CHANNEL" className={input} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-500">说明（可选）</span>
              <input name="description" placeholder="何时选用此类型" className={input} />
            </label>
            <div className="md:col-span-2 flex justify-end">
              <button className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700">
                添加到维度库
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-700">
            当前选项（{options.length}）
          </h2>
          {options.map((o) => (
            <div
              key={o.id}
              className="bg-white rounded-lg border border-zinc-200/80 px-4 py-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-zinc-900">{o.label}</span>
                  <code className="text-xs text-zinc-400 bg-zinc-50 px-1.5 py-0.5 rounded">{o.code}</code>
                  {o.isBuiltin ? (
                    <Badge tone="zinc">内置</Badge>
                  ) : (
                    <Badge tone="green">自定义</Badge>
                  )}
                </div>
                {o.description && <p className="text-xs text-zinc-500 mt-1">{o.description}</p>}
                {!o.isBuiltin && (
                  <p className="text-xs text-zinc-400 mt-1">
                    {o.createdBy?.name ?? "—"} · {fmtDateTime(o.createdAt)}
                  </p>
                )}
              </div>
              {!o.isBuiltin && (
                <form action={deleteTaxonomyOptionAction.bind(null, o.id)}>
                  <button className="text-xs text-zinc-400 hover:text-red-600 shrink-0">删除</button>
                </form>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-zinc-400 mt-8">
          回到<Link href="/partners" className="text-indigo-600 hover:underline">伙伴详情</Link>
          编辑画像，下拉旁有「维度库 +」可跳转至此。
        </p>
      </div>
    </div>
  );
}
