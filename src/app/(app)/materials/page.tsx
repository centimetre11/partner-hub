import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, fmtDateTime } from "@/components/ui";
import { deleteMaterialAction } from "@/lib/content-actions";
import { AssetCard } from "@/components/asset-link";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";

export default async function MaterialsPage() {
  await requireUser();
  const { labels, messages: m, bcp47 } = await getServerI18n();
  const L = labelConstants(labels);
  const items = await db.material.findMany({
    orderBy: { updatedAt: "desc" },
    include: { asset: true, createdBy: true },
  });

  return (
    <div className="pb-16">
      <PageHeader
        title={m.materials.title}
        desc={m.materials.desc}
        actions={
          <Link href="/materials/new" className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">
            {m.materials.newMaterial}
          </Link>
        }
      />
      <div className="px-8 max-w-4xl space-y-3">
        {items.map((item) => (
          <div key={item.id} className="bg-white rounded-xl border p-5">
            <div className="flex justify-between gap-3">
              <div>
                <Link href={`/materials/${item.id}`} className="font-semibold text-zinc-900 hover:text-indigo-600">{item.title}</Link>
                <div className="text-xs text-zinc-400 mt-1 flex gap-2 flex-wrap">
                  <Badge tone="zinc">{L.MATERIAL_CATEGORY_LABELS[item.category] ?? item.category}</Badge>
                  <span>{item.createdBy?.name} · {fmtDateTime(item.updatedAt, bcp47)}</span>
                </div>
                {item.description && <p className="text-sm text-zinc-500 mt-2">{item.description}</p>}
                {item.asset && <div className="mt-2"><AssetCard asset={item.asset} /></div>}
              </div>
              <form action={deleteMaterialAction.bind(null, item.id)}>
                <button className="text-xs text-zinc-400 hover:text-red-600">{m.common.delete}</button>
              </form>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="text-center text-sm text-zinc-400 py-12">{m.materials.empty}</div>}
      </div>
    </div>
  );
}
