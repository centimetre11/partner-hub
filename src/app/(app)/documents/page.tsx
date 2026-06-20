import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, fmtDateTime } from "@/components/ui";
import { deleteDocumentAction } from "@/lib/content-actions";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";

export default async function DocumentsPage() {
  await requireUser();
  const { labels, messages: m, bcp47 } = await getServerI18n();
  const L = labelConstants(labels);
  const docs = await db.document.findMany({
    orderBy: { updatedAt: "desc" },
    include: { partner: true, createdBy: true },
    take: 100,
  });

  return (
    <div className="pb-16">
      <PageHeader
        title={m.documents.title}
        desc={m.documents.desc}
        actions={
          <Link href="/documents/new" className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800">
            {m.documents.newReport}
          </Link>
        }
      />
      <div className="px-8 max-w-4xl space-y-3">
        {docs.length === 0 && (
          <div className="text-sm text-slate-400 bg-white rounded-lg border p-8 text-center">
            {m.documents.empty}
          </div>
        )}
        {docs.map((d) => (
          <div key={d.id} className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/documents/${d.id}`} className="font-semibold text-slate-900 hover:text-sky-600">
                  {d.title}
                </Link>
                <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-slate-400">
                  <Badge tone="blue">{L.DOCUMENT_TYPE_LABELS[d.type] ?? d.type}</Badge>
                  <Badge tone={d.status === "FINAL" ? "green" : "amber"}>{d.status === "FINAL" ? m.common.final : m.common.draft}</Badge>
                  {d.partner && (
                    <Link href={`/partners/${d.partnerId}`} className="text-slate-500 hover:underline">
                      {d.partner.name}
                    </Link>
                  )}
                  <span>{d.createdBy?.name ?? "—"} · {m.common.updated} {fmtDateTime(d.updatedAt, bcp47)}</span>
                </div>
                <p className="text-sm text-slate-500 mt-2 line-clamp-2">{d.content.slice(0, 160)}</p>
              </div>
              <form action={deleteDocumentAction.bind(null, d.id)}>
                <button className="text-xs text-slate-400 hover:text-red-600 shrink-0">{m.common.delete}</button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
