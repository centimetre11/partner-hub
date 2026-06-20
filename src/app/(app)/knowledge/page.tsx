import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, fmtDateTime } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { deleteKnowledgeAction } from "@/lib/content-actions";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";

export default async function KnowledgePage() {
  await requireUser();
  const { labels, messages: m, bcp47 } = await getServerI18n();
  const L = labelConstants(labels);
  const articles = await db.knowledgeArticle.findMany({
    orderBy: { updatedAt: "desc" },
    include: { createdBy: true },
  });

  return (
    <div className="pb-16">
      <PageHeader
        title={m.knowledge.title}
        desc={m.knowledge.desc}
        actions={
          <Link href="/knowledge/new" className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800">
            {m.knowledge.newArticle}
          </Link>
        }
      />
      <AiCenterNav />
      <div className="px-8 max-w-4xl space-y-3">
        {articles.map((a) => (
          <div key={a.id} className="bg-white rounded-lg border p-5 flex justify-between gap-3">
            <div>
              <Link href={`/knowledge/${a.id}`} className="font-semibold text-slate-900 hover:text-sky-600">{a.title}</Link>
              <div className="text-xs text-slate-400 mt-1 flex gap-2">
                <Badge tone="purple">{L.KNOWLEDGE_CATEGORY_LABELS[a.category] ?? a.category}</Badge>
                <span>{a.createdBy?.name} · {fmtDateTime(a.updatedAt, bcp47)}</span>
              </div>
            </div>
            <form action={deleteKnowledgeAction.bind(null, a.id)}>
              <button className="text-xs text-slate-400 hover:text-red-600">{m.common.delete}</button>
            </form>
          </div>
        ))}
        {articles.length === 0 && <div className="text-center text-sm text-slate-400 py-12">{m.knowledge.empty}</div>}
      </div>
    </div>
  );
}
