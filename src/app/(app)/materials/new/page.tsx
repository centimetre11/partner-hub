import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { upsertMaterialAction } from "@/lib/content-actions";
import { MaterialForm } from "@/components/material-form";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";

export default async function NewMaterialPage() {
  await requireUser();
  const { labels, messages: m } = await getServerI18n();
  const L = labelConstants(labels);
  const categories = Object.entries(L.MATERIAL_CATEGORY_LABELS).map(([key, label]) => ({ key, label }));

  return (
    <div className="pb-16">
      <PageHeader title={m.materials.addTitle} desc={m.materials.addDesc} />
      <MaterialForm action={upsertMaterialAction} categories={categories} />
    </div>
  );
}
