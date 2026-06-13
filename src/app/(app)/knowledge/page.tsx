import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, fmtDateTime } from "@/components/ui";
import { KNOWLEDGE_CATEGORY_LABELS } from "@/lib/constants";
import { deleteKnowledgeAction } from "@/lib/content-actions";

export default async function KnowledgePage() {
  await requireUser();
  const articles = await db.knowledgeArticle.findMany({
    orderBy: { updatedAt: "desc" },
    include: { createdBy: true },
  });

  return (
    <div className="pb-16">
      <PageHeader
        title="知识库"
        desc="AI 中心的一部分：沉淀帆软背景、中东策略、产品能力，Agent 运行时可检索引用"
        actions={
          <>
            <Link href="/ai" className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:border-indigo-300 hover:text-indigo-600">
              AI 中心
            </Link>
            <Link href="/knowledge/new" className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">
              + 新建文章
            </Link>
          </>
        }
      />
      <div className="px-8 max-w-4xl space-y-3">
        {articles.map((a) => (
          <div key={a.id} className="bg-white rounded-xl border p-5 flex justify-between gap-3">
            <div>
              <Link href={`/knowledge/${a.id}`} className="font-semibold text-zinc-900 hover:text-indigo-600">{a.title}</Link>
              <div className="text-xs text-zinc-400 mt-1 flex gap-2">
                <Badge tone="purple">{KNOWLEDGE_CATEGORY_LABELS[a.category] ?? a.category}</Badge>
                <span>{a.createdBy?.name} · {fmtDateTime(a.updatedAt)}</span>
              </div>
            </div>
            <form action={deleteKnowledgeAction.bind(null, a.id)}>
              <button className="text-xs text-zinc-400 hover:text-red-600">删除</button>
            </form>
          </div>
        ))}
        {articles.length === 0 && <div className="text-center text-sm text-zinc-400 py-12">知识库为空，先添加几篇基础文章</div>}
      </div>
    </div>
  );
}
