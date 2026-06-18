import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { upsertMaterialAction } from "@/lib/content-actions";
import { MaterialForm } from "@/components/material-form";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";

export default async function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { labels, messages: m } = await getServerI18n();
  const L = labelConstants(labels);
  const { id } = await params;
  const mat = await db.material.findUnique({ where: { id }, include: { asset: true } });
  if (!mat) notFound();
  const categories = Object.entries(L.MATERIAL_CATEGORY_LABELS).map(([key, label]) => ({ key, label }));

  const link = mat.asset?.url
    ? {
        assetId: mat.asset.id,
        title: mat.asset.filename,
        description: mat.description,
        url: mat.asset.url,
        thumbnailUrl: mat.asset.thumbnailUrl,
        provider: mat.asset.provider ?? "web",
      }
    : null;

  return (
    <div className="pb-16">
      <PageHeader title={m.materials.editTitle} />
      <MaterialForm
        action={upsertMaterialAction}
        categories={categories}
        defaults={{
          id: mat.id,
          title: mat.title,
          description: mat.description ?? "",
          category: mat.category,
          shared: mat.shared,
          link,
        }}
      />
    </div>
  );
}
