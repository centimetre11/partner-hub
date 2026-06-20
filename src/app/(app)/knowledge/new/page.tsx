import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { upsertKnowledgeAction } from "@/lib/content-actions";
import { RichEditor } from "@/components/rich-editor";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";

export default async function NewKnowledgePage() {
  await requireUser();
  const { labels, messages: m } = await getServerI18n();
  const L = labelConstants(labels);
  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  return (
    <div className="pb-16">
      <PageHeader title={m.knowledge.newTitle} />
      <form action={upsertKnowledgeAction} className="px-8 max-w-4xl space-y-4">
        <div className="bg-white rounded-lg border p-5 space-y-3">
          <input name="title" required placeholder={m.knowledge.titlePlaceholder} className={input} />
          <input name="slug" placeholder={m.knowledge.slugPlaceholder} className={input} />
          <select name="category" className={input}>
            {Object.entries(L.KNOWLEDGE_CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="shared" defaultChecked className="rounded" />
            {m.knowledge.teamSharedSearchable}
          </label>
          <RichEditor />
        </div>
        <button className="rounded-lg bg-slate-900 text-white px-6 py-2.5 text-sm">{m.common.publish}</button>
      </form>
    </div>
  );
}
