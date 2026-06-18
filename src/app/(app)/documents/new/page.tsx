import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { upsertDocumentAction } from "@/lib/content-actions";
import { RichEditor } from "@/components/rich-editor";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ partnerId?: string; solutionId?: string; type?: string }>;
}) {
  await requireUser();
  const { labels, messages: m } = await getServerI18n();
  const L = labelConstants(labels);
  const sp = await searchParams;
  const partners = await db.partner.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="pb-16">
      <PageHeader title={m.documents.newTitle} desc={m.documents.newDescLinked} />
      <form action={upsertDocumentAction} className="px-8 max-w-4xl space-y-4">
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <input name="title" required placeholder={m.documents.titlePlaceholder} className={input} />
          <div className="grid grid-cols-2 gap-3">
            <select name="type" defaultValue={sp.type ?? "CUSTOM"} className={input}>
              {Object.entries(L.DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select name="status" className={input}>
              <option value="DRAFT">{m.common.draft}</option>
              <option value="FINAL">{m.common.final}</option>
            </select>
          </div>
          <select name="partnerId" defaultValue={sp.partnerId ?? ""} className={input}>
            <option value="">{m.common.noPartner}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {sp.solutionId && <input type="hidden" name="solutionId" value={sp.solutionId} />}
          <RichEditor />
        </div>
        <button className="rounded-lg bg-indigo-600 text-white px-6 py-2.5 text-sm font-medium hover:bg-indigo-700">{m.common.create}</button>
      </form>
    </div>
  );
}
