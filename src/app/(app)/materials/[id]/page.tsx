import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { MATERIAL_CATEGORY_LABELS } from "@/lib/constants";
import { upsertMaterialAction } from "@/lib/content-actions";
import { RichEditor } from "@/components/rich-editor";
import { FileUploadField } from "@/components/file-upload";
import { AssetCard } from "@/components/asset-link";

export default async function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const m = await db.material.findUnique({ where: { id }, include: { asset: true } });
  if (!m) notFound();
  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="pb-16">
      <PageHeader title="编辑物料" />
      <form action={upsertMaterialAction} className="px-8 max-w-4xl space-y-4">
        <input type="hidden" name="id" value={m.id} />
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <input name="title" required defaultValue={m.title} className={input} />
          <input name="description" defaultValue={m.description ?? ""} className={input} />
          <select name="category" defaultValue={m.category} className={input}>
            {Object.entries(MATERIAL_CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          {m.asset && (
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">当前附件（重新上传或贴链接可替换）：</p>
              <AssetCard asset={m.asset} />
            </div>
          )}
          <FileUploadField name="assetId" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shared" defaultChecked={m.shared} className="rounded" />
            团队共享
          </label>
          <RichEditor name="body" defaultValue={m.body ?? ""} />
        </div>
        <button className="rounded-lg bg-indigo-600 text-white px-6 py-2.5 text-sm">保存</button>
      </form>
    </div>
  );
}
