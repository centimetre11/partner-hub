import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { upsertMaterialAction } from "@/lib/content-actions";
import { RichEditor } from "@/components/rich-editor";
import { FileUploadField } from "@/components/file-upload";
import { AssetCard } from "@/components/asset-link";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";

export default async function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { labels, messages: m } = await getServerI18n();
  const L = labelConstants(labels);
  const { id } = await params;
  const mat = await db.material.findUnique({ where: { id }, include: { asset: true } });
  if (!mat) notFound();
  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="pb-16">
      <PageHeader title={m.materials.editTitle} />
      <form action={upsertMaterialAction} className="px-8 max-w-4xl space-y-4">
        <input type="hidden" name="id" value={mat.id} />
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <input name="title" required defaultValue={mat.title} className={input} />
          <input name="description" defaultValue={mat.description ?? ""} placeholder={m.materials.descPlaceholder} className={input} />
          <select name="category" defaultValue={mat.category} className={input}>
            {Object.entries(L.MATERIAL_CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          {mat.asset && (
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">{m.materials.currentAttachment}</p>
              <AssetCard asset={mat.asset} />
            </div>
          )}
          <FileUploadField name="assetId" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shared" defaultChecked={mat.shared} className="rounded" />
            {m.common.teamShared}
          </label>
          <RichEditor name="body" defaultValue={mat.body ?? ""} />
        </div>
        <button className="rounded-lg bg-indigo-600 text-white px-6 py-2.5 text-sm">{m.common.save}</button>
      </form>
    </div>
  );
}
