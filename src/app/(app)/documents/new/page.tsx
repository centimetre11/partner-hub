import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { DOCUMENT_TYPE_LABELS } from "@/lib/constants";
import { upsertDocumentAction } from "@/lib/content-actions";
import { RichEditor } from "@/components/rich-editor";

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ partnerId?: string; solutionId?: string; type?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const partners = await db.partner.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="pb-16">
      <PageHeader title="新建报告" desc="Markdown 文档，可绑定伙伴或联合方案" />
      <form action={upsertDocumentAction} className="px-8 max-w-4xl space-y-4">
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <input name="title" required placeholder="报告标题 *" className={input} />
          <div className="grid grid-cols-2 gap-3">
            <select name="type" defaultValue={sp.type ?? "CUSTOM"} className={input}>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select name="status" className={input}>
              <option value="DRAFT">草稿</option>
              <option value="FINAL">定稿</option>
            </select>
          </div>
          <select name="partnerId" defaultValue={sp.partnerId ?? ""} className={input}>
            <option value="">不绑定伙伴</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {sp.solutionId && <input type="hidden" name="solutionId" value={sp.solutionId} />}
          <RichEditor />
        </div>
        <button className="rounded-lg bg-indigo-600 text-white px-6 py-2.5 text-sm font-medium hover:bg-indigo-700">创建</button>
      </form>
    </div>
  );
}
