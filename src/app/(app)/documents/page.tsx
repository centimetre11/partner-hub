import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, fmtDateTime } from "@/components/ui";
import { DOCUMENT_TYPE_LABELS } from "@/lib/constants";
import { deleteDocumentAction } from "@/lib/content-actions";

export default async function DocumentsPage() {
  await requireUser();
  const docs = await db.document.findMany({
    orderBy: { updatedAt: "desc" },
    include: { partner: true, createdBy: true },
    take: 100,
  });

  return (
    <div className="pb-16">
      <PageHeader
        title="报告中心"
        desc="可长期保存、可编辑的业务文档：Agent 简报、联合方案报告、会议纪要等"
        actions={
          <Link href="/documents/new" className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">
            + 新建报告
          </Link>
        }
      />
      <div className="px-8 max-w-4xl space-y-3">
        {docs.length === 0 && (
          <div className="text-sm text-zinc-400 bg-white rounded-xl border p-8 text-center">
            还没有报告。可从收件箱「存为报告」或在这里新建。
          </div>
        )}
        {docs.map((d) => (
          <div key={d.id} className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/documents/${d.id}`} className="font-semibold text-zinc-900 hover:text-indigo-600">
                  {d.title}
                </Link>
                <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-zinc-400">
                  <Badge tone="blue">{DOCUMENT_TYPE_LABELS[d.type] ?? d.type}</Badge>
                  <Badge tone={d.status === "FINAL" ? "green" : "amber"}>{d.status === "FINAL" ? "已定稿" : "草稿"}</Badge>
                  {d.partner && (
                    <Link href={`/partners/${d.partnerId}`} className="text-indigo-500 hover:underline">
                      {d.partner.name}
                    </Link>
                  )}
                  <span>{d.createdBy?.name ?? "—"} · 更新 {fmtDateTime(d.updatedAt)}</span>
                </div>
                <p className="text-sm text-zinc-500 mt-2 line-clamp-2">{d.content.slice(0, 160)}</p>
              </div>
              <form action={deleteDocumentAction.bind(null, d.id)}>
                <button className="text-xs text-zinc-400 hover:text-red-600 shrink-0">删除</button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
