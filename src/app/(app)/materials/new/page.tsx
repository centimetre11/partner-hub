import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { MATERIAL_CATEGORY_LABELS } from "@/lib/constants";
import { upsertMaterialAction } from "@/lib/content-actions";
import { RichEditor } from "@/components/rich-editor";
import { FileUploadField } from "@/components/file-upload";

export default async function NewMaterialPage() {
  await requireUser();
  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="pb-16">
      <PageHeader title="Add material" />
      <form action={upsertMaterialAction} className="px-8 max-w-4xl space-y-4">
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <input name="title" required placeholder="Title *" className={input} />
          <input name="description" placeholder="Short description" className={input} />
          <select name="category" className={input}>
            {Object.entries(MATERIAL_CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <FileUploadField />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shared" defaultChecked className="rounded" />
            Team shared
          </label>
          <RichEditor name="body" />
        </div>
        <button className="rounded-lg bg-indigo-600 text-white px-6 py-2.5 text-sm">Save</button>
      </form>
    </div>
  );
}
