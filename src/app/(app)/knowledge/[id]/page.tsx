import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { KNOWLEDGE_CATEGORY_LABELS } from "@/lib/constants";
import { upsertKnowledgeAction } from "@/lib/content-actions";
import { RichEditor } from "@/components/rich-editor";

export default async function KnowledgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const a = await db.knowledgeArticle.findUnique({ where: { id } });
  if (!a) notFound();
  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="pb-16">
      <PageHeader title="编辑知识库文章" />
      <form action={upsertKnowledgeAction} className="px-8 max-w-4xl space-y-4">
        <input type="hidden" name="id" value={a.id} />
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <input name="title" required defaultValue={a.title} className={input} />
          <input name="slug" defaultValue={a.slug} className={input} />
          <select name="category" defaultValue={a.category} className={input}>
            {Object.entries(KNOWLEDGE_CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shared" defaultChecked={a.shared} className="rounded" />
            团队共享
          </label>
          <RichEditor defaultValue={a.content} />
        </div>
        <button className="rounded-lg bg-indigo-600 text-white px-6 py-2.5 text-sm">保存</button>
      </form>
    </div>
  );
}
