import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { SOLUTION_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from "@/lib/constants";
import {
  deleteSolutionAction,
  linkSolutionAssetAction,
  unlinkSolutionAssetAction,
  upsertSolutionAction,
} from "@/lib/content-actions";
import { SolutionAssetUpload } from "@/components/solution-asset-upload";
import { AssetCard } from "@/components/asset-link";
import { AiAddButton } from "@/components/ai-add-button";

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
}: {
  partnerId: string;
  solutions: SolutionRow[];
}) {
  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <Card
      title={`Execution · joint solutions (${solutions.length})`}
      actions={<AiAddButton scope="solution" partnerId={partnerId} label="✦ AI add solution" variant="soft" />}
    >
      <div className="space-y-4">
        {solutions.map((sol) => (
          <details key={sol.id} className="group rounded-lg border border-zinc-100 hover:border-zinc-200">
            <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-zinc-900">{sol.name}</span>
                  <Badge tone="indigo">{SOLUTION_STATUS_LABELS[sol.status] ?? sol.status}</Badge>
                  {sol.documents.length > 0 && (
                    <Badge tone="zinc">{sol.documents.length} reports</Badge>
                  )}
                </div>
                {sol.targetCustomer && (
                  <div className="text-xs text-zinc-400 mt-0.5">Target customer: {sol.targetCustomer}</div>
                )}
              </div>
              <span className="text-zinc-300 group-open:rotate-90 transition-transform">›</span>
            </summary>
            <div className="px-4 pb-4 pt-1 border-t border-zinc-50 space-y-4">
              <form action={upsertSolutionAction.bind(null, partnerId)} className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <input type="hidden" name="id" value={sol.id} />
                <input name="name" required defaultValue={sol.name} className={input} />
                <input name="targetCustomer" defaultValue={sol.targetCustomer ?? ""} placeholder="Target customer" className={input} />
                <select name="status" defaultValue={sol.status} className={input}>
                  {Object.entries(SOLUTION_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <input name="painPoint" defaultValue={sol.painPoint ?? ""} placeholder="Customer pain point" className={input} />
                <input name="fanruanOffer" defaultValue={sol.fanruanOffer ?? ""} placeholder="FanRuan offers" className={input} />
                <input name="partnerOffer" defaultValue={sol.partnerOffer ?? ""} placeholder="Partner offers" className={input} />
                <input name="pricingModel" defaultValue={sol.pricingModel ?? ""} placeholder="Pricing model" className={input} />
                <textarea name="notes" defaultValue={sol.notes ?? ""} placeholder="Notes" rows={2} className={`${input} md:col-span-3`} />
                <div className="col-span-2 md:col-span-3 flex justify-end gap-2">
                  <button formAction={deleteSolutionAction.bind(null, partnerId, sol.id)} className="text-xs text-zinc-400 hover:text-red-600 px-2">
                    Delete
                  </button>
                  <button className="rounded-md bg-zinc-900 text-white px-3 py-1.5 text-xs hover:bg-zinc-700">Save</button>
                </div>
              </form>

              <div>
                <div className="text-xs text-zinc-500 mb-2">Attachments (decks, architecture diagrams, cloud links, etc.)</div>
                <ul className="space-y-2 mb-2">
                  {sol.assets.map((a) => (
                    <li key={a.assetId} className="flex items-center gap-2">
                      <AssetCard asset={a.asset} label={a.label} />
                      <form action={unlinkSolutionAssetAction.bind(null, partnerId, sol.id, a.assetId)}>
                        <button className="text-xs text-zinc-400 hover:text-red-600">Remove</button>
                      </form>
                    </li>
                  ))}
                  {sol.assets.length === 0 && <li className="text-xs text-zinc-400">No attachments</li>}
                </ul>
                <SolutionAssetUpload partnerId={partnerId} solutionId={sol.id} action={linkSolutionAssetAction} />
              </div>

              {sol.documents.length > 0 && (
                <div>
                  <div className="text-xs text-zinc-500 mb-2">Linked reports</div>
                  <ul className="space-y-1">
                    {sol.documents.map((d) => (
                      <li key={d.id}>
                        <Link href={`/documents/${d.id}`} className="text-sm text-indigo-600 hover:underline">
                          {d.title}
                        </Link>
                        <span className="text-xs text-zinc-400 ml-2">{DOCUMENT_TYPE_LABELS[d.type] ?? d.type}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Link
                href={`/documents/new?partnerId=${partnerId}&solutionId=${sol.id}&type=JOINT_SOLUTION`}
                className="text-sm text-indigo-600 hover:underline"
              >
                + New joint solution report
              </Link>
            </div>
          </details>
        ))}
        {solutions.length === 0 && (
          <EmptyState text="No joint solutions yet. Co-created packages, architecture diagrams, and pricing logic can live here." />
        )}

        <details className="rounded-lg border border-dashed border-zinc-200">
          <summary className="px-4 py-2.5 text-sm text-indigo-600 cursor-pointer list-none">+ Add joint solution</summary>
          <form action={upsertSolutionAction.bind(null, partnerId)} className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            <input name="name" required placeholder="Solution name *" className={input} />
            <input name="targetCustomer" placeholder="Target customer" className={input} />
            <input name="painPoint" placeholder="Customer pain point" className={input} />
            <button className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-xs hover:bg-indigo-700 md:col-span-3 justify-self-end">
              Add
            </button>
          </form>
        </details>
      </div>
    </Card>
  );
}
