import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, fmtDateTime } from "@/components/ui";
import { MATERIAL_CATEGORY_LABELS } from "@/lib/constants";
import { deleteMaterialAction } from "@/lib/content-actions";

export default async function MaterialsPage() {
  await requireUser();
  const items = await db.material.findMany({
    orderBy: { updatedAt: "desc" },
    include: { asset: true, createdBy: true },
  });

  return (
    <div className="pb-16">
      <PageHeader
        title="物料中心"
        desc="团队共享的销售/运营资料：等级制度、产品对比、推介材料等"
        actions={
          <Link href="/materials/new" className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">
            + 添加物料
          </Link>
        }
      />
      <div className="px-8 max-w-4xl space-y-3">
        {items.map((m) => (
          <div key={m.id} className="bg-white rounded-xl border p-5">
            <div className="flex justify-between gap-3">
              <div>
                <Link href={`/materials/${m.id}`} className="font-semibold text-zinc-900 hover:text-indigo-600">{m.title}</Link>
                <div className="text-xs text-zinc-400 mt-1 flex gap-2 flex-wrap">
                  <Badge tone="zinc">{MATERIAL_CATEGORY_LABELS[m.category] ?? m.category}</Badge>
                  {m.asset && (
                    <a href={`/api/assets/${m.assetId}`} className="text-indigo-500 hover:underline" target="_blank">
                      📎 {m.asset.filename}
                    </a>
                  )}
                  <span>{m.createdBy?.name} · {fmtDateTime(m.updatedAt)}</span>
                </div>
                {m.description && <p className="text-sm text-zinc-500 mt-2">{m.description}</p>}
              </div>
              <form action={deleteMaterialAction.bind(null, m.id)}>
                <button className="text-xs text-zinc-400 hover:text-red-600">删除</button>
              </form>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="text-center text-sm text-zinc-400 py-12">暂无物料</div>}
      </div>
    </div>
  );
}
