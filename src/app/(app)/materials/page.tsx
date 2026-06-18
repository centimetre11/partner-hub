import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { deleteMaterialAction } from "@/lib/content-actions";
import { MaterialCard } from "@/components/material-card";
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
          <MaterialCard
            key={item.id}
            id={item.id}
            title={item.title}
            description={item.description}
            category={item.category}
            categoryLabel={L.MATERIAL_CATEGORY_LABELS[item.category] ?? item.category}
            updatedAt={item.updatedAt}
            author={item.createdBy?.name}
            bcp47={bcp47}
            asset={item.asset}
            labels={{
              openLink: m.materials.openLink,
              edit: m.common.edit,
              delete: m.common.delete,
              providers: m.materials.providers,
            }}
            deleteAction={deleteMaterialAction.bind(null, item.id)}
          />
        ))}
        {items.length === 0 && <div className="text-center text-sm text-zinc-400 py-12">{m.materials.empty}</div>}
      </div>
    </div>
  );
}
