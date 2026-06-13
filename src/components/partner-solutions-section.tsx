import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { SOLUTION_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from "@/lib/constants";
import {
  deleteSolutionAction,
  linkSolutionAssetAction,
  upsertSolutionAction,
} from "@/lib/content-actions";
import { SolutionAssetUpload } from "@/components/solution-asset-upload";
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
  assets: { assetId: string; label: string | null; asset: { filename: string } }[];
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
      title={`⑥ 联合解决方案（${solutions.length}）`}
      actions={<AiAddButton scope="solution" partnerId={partnerId} label="✦ AI 加方案" variant="soft" />}
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
                    <Badge tone="zinc">{sol.documents.length} 份报告</Badge>
                  )}
                </div>
                {sol.targetCustomer && (
                  <div className="text-xs text-zinc-400 mt-0.5">目标客户：{sol.targetCustomer}</div>
                )}
              </div>
              <span className="text-zinc-300 group-open:rotate-90 transition-transform">›</span>
            </summary>
            <div className="px-4 pb-4 pt-1 border-t border-zinc-50 space-y-4">
              <form action={upsertSolutionAction.bind(null, partnerId)} className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <input type="hidden" name="id" value={sol.id} />
                <input name="name" required defaultValue={sol.name} className={input} />
                <input name="targetCustomer" defaultValue={sol.targetCustomer ?? ""} placeholder="目标客户" className={input} />
                <select name="status" defaultValue={sol.status} className={input}>
                  {Object.entries(SOLUTION_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <input name="painPoint" defaultValue={sol.painPoint ?? ""} placeholder="客户痛点" className={input} />
                <input name="fanruanOffer" defaultValue={sol.fanruanOffer ?? ""} placeholder="帆软提供" className={input} />
                <input name="partnerOffer" defaultValue={sol.partnerOffer ?? ""} placeholder="伙伴提供" className={input} />
                <input name="pricingModel" defaultValue={sol.pricingModel ?? ""} placeholder="定价模式" className={input} />
                <textarea name="notes" defaultValue={sol.notes ?? ""} placeholder="备注" rows={2} className={`${input} md:col-span-3`} />
                <div className="col-span-2 md:col-span-3 flex justify-end gap-2">
                  <button formAction={deleteSolutionAction.bind(null, partnerId, sol.id)} className="text-xs text-zinc-400 hover:text-red-600 px-2">
                    删除
                  </button>
                  <button className="rounded-md bg-zinc-900 text-white px-3 py-1.5 text-xs hover:bg-zinc-700">保存</button>
                </div>
              </form>

              <div>
                <div className="text-xs text-zinc-500 mb-2">附件（PPT、架构图等）</div>
                <ul className="space-y-1 mb-2">
                  {sol.assets.map((a) => (
                    <li key={a.assetId} className="text-sm">
                      <a href={`/api/assets/${a.assetId}`} className="text-indigo-600 hover:underline" target="_blank">
                        📎 {a.label ? `${a.label} · ` : ""}{a.asset.filename}
                      </a>
                    </li>
                  ))}
                  {sol.assets.length === 0 && <li className="text-xs text-zinc-400">暂无附件</li>}
                </ul>
                <SolutionAssetUpload partnerId={partnerId} solutionId={sol.id} action={linkSolutionAssetAction} />
              </div>

              {sol.documents.length > 0 && (
                <div>
                  <div className="text-xs text-zinc-500 mb-2">关联报告</div>
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
                + 新建联合方案报告
              </Link>
            </div>
          </details>
        ))}
        {solutions.length === 0 && (
          <EmptyState text="还没有联合解决方案。与伙伴共创的打包方案、架构图、报价逻辑可在此沉淀。" />
        )}

        <details className="rounded-lg border border-dashed border-zinc-200">
          <summary className="px-4 py-2.5 text-sm text-indigo-600 cursor-pointer list-none">+ 添加联合解决方案</summary>
          <form action={upsertSolutionAction.bind(null, partnerId)} className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            <input name="name" required placeholder="方案名称 *" className={input} />
            <input name="targetCustomer" placeholder="目标客户" className={input} />
            <input name="painPoint" placeholder="客户痛点" className={input} />
            <button className="rounded-md bg-indigo-600 text-white px-3 py-1.5 text-xs hover:bg-indigo-700 md:col-span-3 justify-self-end">
              添加
            </button>
          </form>
        </details>
      </div>
    </Card>
  );
}
