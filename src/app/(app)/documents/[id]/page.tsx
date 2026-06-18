import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import {
  upsertDocumentAction,
  linkDocumentAssetAction,
  unlinkDocumentAssetAction,
} from "@/lib/content-actions";
import { RichEditor } from "@/components/rich-editor";
import { DocumentAssetUpload } from "@/components/document-asset-upload";
import { AssetCard } from "@/components/asset-link";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { labels, messages: m } = await getServerI18n();
  const L = labelConstants(labels);
  const { id } = await params;
  const doc = await db.document.findUnique({
    where: { id },
    include: { partner: true, assets: { include: { asset: true } } },
  });
  if (!doc) notFound();

  const partners = await db.partner.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="pb-16">
      <PageHeader
        title={m.documents.editTitle}
        desc={doc.partner ? m.documents.partnerLabel.replace("{name}", doc.partner.name) : undefined}
      />
      <form action={upsertDocumentAction} className="px-8 max-w-4xl space-y-4">
        <input type="hidden" name="id" value={doc.id} />
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <input name="title" required defaultValue={doc.title} className={input} />
          <div className="grid grid-cols-2 gap-3">
            <select name="type" defaultValue={doc.type} className={input}>
              {Object.entries(L.DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select name="status" defaultValue={doc.status} className={input}>
              <option value="DRAFT">{m.common.draft}</option>
              <option value="FINAL">{m.common.final}</option>
            </select>
          </div>
          <select name="partnerId" defaultValue={doc.partnerId ?? ""} className={input}>
            <option value="">{m.common.noPartner}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <RichEditor defaultValue={doc.content} />
        </div>
        <button className="rounded-lg bg-indigo-600 text-white px-6 py-2.5 text-sm font-medium hover:bg-indigo-700">{m.common.save}</button>
      </form>

      <div className="px-8 max-w-4xl mt-4">
        <div className="bg-white rounded-xl border p-5 space-y-3">
          <div className="text-sm font-medium text-zinc-700">{m.documents.attachmentsCloud}</div>
          <ul className="space-y-2">
            {doc.assets.map((a) => (
              <li key={a.assetId} className="flex items-center gap-2">
                <AssetCard asset={a.asset} label={a.label} />
                <form action={unlinkDocumentAssetAction.bind(null, doc.id, a.assetId)}>
                  <button className="text-xs text-zinc-400 hover:text-red-600">{m.common.remove}</button>
                </form>
              </li>
            ))}
            {doc.assets.length === 0 && <li className="text-xs text-zinc-400">{m.materials.noAttachments}</li>}
          </ul>
          <DocumentAssetUpload documentId={doc.id} action={linkDocumentAssetAction} />
        </div>
      </div>
    </div>
  );
}
