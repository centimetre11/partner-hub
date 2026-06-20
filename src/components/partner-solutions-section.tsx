import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import {
  deleteSolutionAction,
  linkSolutionAssetAction,
  unlinkSolutionAssetAction,
  upsertSolutionAction,
} from "@/lib/content-actions";
import { SolutionAssetUpload } from "@/components/solution-asset-upload";
import { AssetCard } from "@/components/asset-link";
import type { Messages } from "@/lib/i18n/messages/en";

type SolutionRow = {
  id: string;
  name: string;
  targetCustomer: string | null;
  painPoint: string | null;
  fanruanOffer: string | null;
  partnerOffer: string | null;
  pricingModel: string | null;
  status: string;
  notes: string | null;
  assets: {
    assetId: string;
    label: string | null;
    asset: { id: string; kind: string | null; filename: string; url: string | null; thumbnailUrl: string | null };
  }[];
  documents: { id: string; title: string; type: string }[];
};

export function PartnerSolutionsSection({
  partnerId,
  solutions,
  copy,
  solutionStatusLabels,
  documentTypeLabels,
}: {
  partnerId: string;
  solutions: SolutionRow[];
  copy: Messages["partnerDetail"]["solutionsSection"];
  solutionStatusLabels: Record<string, string>;
  documentTypeLabels: Record<string, string>;
}) {
  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  return (
    <Card title={copy.title.replace("{count}", String(solutions.length))}>
      <div className="space-y-4">
        {solutions.map((sol) => (
          <details key={sol.id} className="group rounded-lg border border-slate-100 hover:border-slate-200">
            <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-900">{sol.name}</span>
                  <Badge tone="indigo">{solutionStatusLabels[sol.status] ?? sol.status}</Badge>
                  {sol.documents.length > 0 && (
                    <Badge tone="zinc">{copy.reports.replace("{count}", String(sol.documents.length))}</Badge>
                  )}
                </div>
                {sol.targetCustomer && (
                  <div className="text-xs text-slate-400 mt-0.5">
                    {copy.targetCustomerLine.replace("{name}", sol.targetCustomer)}
                  </div>
                )}
              </div>
              <span className="text-slate-300 group-open:rotate-90">›</span>
            </summary>
            <div className="px-4 pb-4 pt-1 border-t border-slate-50 space-y-4">
              <form action={upsertSolutionAction.bind(null, partnerId)} className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <input type="hidden" name="id" value={sol.id} />
                <input name="name" required defaultValue={sol.name} className={input} />
                <input name="targetCustomer" defaultValue={sol.targetCustomer ?? ""} placeholder={copy.targetCustomer} className={input} />
                <select name="status" defaultValue={sol.status} className={input}>
                  {Object.entries(solutionStatusLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <input name="painPoint" defaultValue={sol.painPoint ?? ""} placeholder={copy.painPoint} className={input} />
                <input name="fanruanOffer" defaultValue={sol.fanruanOffer ?? ""} placeholder={copy.fanruanOffer} className={input} />
                <input name="partnerOffer" defaultValue={sol.partnerOffer ?? ""} placeholder={copy.partnerOffer} className={input} />
                <input name="pricingModel" defaultValue={sol.pricingModel ?? ""} placeholder={copy.pricingModel} className={input} />
                <textarea name="notes" defaultValue={sol.notes ?? ""} placeholder={copy.notes} rows={2} className={`${input} md:col-span-3`} />
                <div className="col-span-2 md:col-span-3 flex justify-end gap-2">
                  <button formAction={deleteSolutionAction.bind(null, partnerId, sol.id)} className="text-xs text-slate-400 hover:text-red-600 px-2">
                    {copy.delete}
                  </button>
                  <button className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs hover:bg-slate-700">{copy.save}</button>
                </div>
              </form>

              <div>
                <div className="text-xs text-slate-500 mb-2">{copy.attachments}</div>
                <ul className="space-y-2 mb-2">
                  {sol.assets.map((a) => (
                    <li key={a.assetId} className="flex items-center gap-2">
                      <AssetCard asset={a.asset} label={a.label} />
                      <form action={unlinkSolutionAssetAction.bind(null, partnerId, sol.id, a.assetId)}>
                        <button className="text-xs text-slate-400 hover:text-red-600">{copy.remove}</button>
                      </form>
                    </li>
                  ))}
                  {sol.assets.length === 0 && <li className="text-xs text-slate-400">{copy.noAttachments}</li>}
                </ul>
                <SolutionAssetUpload partnerId={partnerId} solutionId={sol.id} action={linkSolutionAssetAction} />
              </div>

              {sol.documents.length > 0 && (
                <div>
                  <div className="text-xs text-slate-500 mb-2">{copy.linkedReports}</div>
                  <ul className="space-y-1">
                    {sol.documents.map((d) => (
                      <li key={d.id}>
                        <Link href={`/documents/${d.id}`} className="text-sm text-sky-600 hover:underline">
                          {d.title}
                        </Link>
                        <span className="text-xs text-slate-400 ml-2">{documentTypeLabels[d.type] ?? d.type}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Link
                href={`/documents/new?partnerId=${partnerId}&solutionId=${sol.id}&type=JOINT_SOLUTION`}
                className="text-sm text-sky-600 hover:underline"
              >
                {copy.newReport}
              </Link>
            </div>
          </details>
        ))}
        {solutions.length === 0 && <EmptyState text={copy.empty} />}

        <details className="rounded-lg border border-dashed border-slate-200">
          <summary className="px-4 py-2.5 text-sm text-sky-600 cursor-pointer list-none">{copy.addSolution}</summary>
          <form action={upsertSolutionAction.bind(null, partnerId)} className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            <input name="name" required placeholder={copy.solutionName} className={input} />
            <input name="targetCustomer" placeholder={copy.targetCustomer} className={input} />
            <input name="painPoint" placeholder={copy.painPoint} className={input} />
            <button className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs hover:bg-slate-800 md:col-span-3 justify-self-end">
              {copy.add}
            </button>
          </form>
        </details>
      </div>
    </Card>
  );
}
