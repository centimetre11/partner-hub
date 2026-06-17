import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, fmtDateTime } from "@/components/ui";
import {
  CATEGORY_LABELS,
  INDUSTRY_LABELS,
} from "@/lib/constants";
import {
  PARTNER_ARCHETYPE_LABELS,
  VALUE_PATTERN_LABELS,
} from "@/lib/partner-framework";
import { deleteGtmLibraryAction } from "@/lib/gtm-library-actions";

export default async function PlaybookLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";

  const all = await db.gtmLibrary.findMany({
    where: q
      ? {
          OR: [
            { title: { contains: q } },
            { playbook: { contains: q } },
            { pitch: { contains: q } },
            { notes: { contains: q } },
            { sourcePartnerName: { contains: q } },
          ],
        }
      : undefined,
    orderBy: [{ groupId: "asc" }, { version: "desc" }],
    include: { createdBy: { select: { name: true } } },
  });

  const groups = new Map<string, typeof all>();
  for (const row of all) {
    if (!groups.has(row.groupId)) groups.set(row.groupId, []);
    groups.get(row.groupId)!.push(row);
  }
  const grouped = [...groups.entries()].sort(
    (a, b) => (b[1][0]?.updatedAt.getTime() ?? 0) - (a[1][0]?.updatedAt.getTime() ?? 0),
  );

  return (
    <div className="pb-16">
      <PageHeader
        title="打法库"
        desc="团队共享的 playbook 与 pitch；从各伙伴沉淀，供其他伙伴参考选用"
      />
      <div className="px-8 max-w-4xl">
        <form className="mb-4 flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="搜索标题、内容、来源伙伴…"
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700">搜索</button>
        </form>

        {grouped.length === 0 ? (
          <div className="text-center text-sm text-zinc-400 py-16 bg-white rounded-xl border">
            库中暂无条目。在伙伴详情「定位打法」里写好 playbook/pitch 后，点「存入库」即可沉淀。
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([groupId, versions]) => {
              const latest = versions[0];
              return (
                <div key={groupId} className="bg-white rounded-xl border border-zinc-200/80 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-100">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-semibold text-zinc-900">{latest.title}</h2>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <Badge tone="indigo">最新 v{latest.version}</Badge>
                          {versions.length > 1 && (
                            <Badge tone="zinc">{versions.length} 个版本</Badge>
                          )}
                          {latest.industry && (
                            <Badge tone="blue">{INDUSTRY_LABELS[latest.industry] ?? latest.industry}</Badge>
                          )}
                          {latest.valuePattern && (
                            <Badge tone="purple">{VALUE_PATTERN_LABELS[latest.valuePattern] ?? latest.valuePattern}</Badge>
                          )}
                          {latest.partnerArchetype && (
                            <Badge tone="indigo">{PARTNER_ARCHETYPE_LABELS[latest.partnerArchetype] ?? latest.partnerArchetype}</Badge>
                          )}
                          <Badge tone="zinc">{CATEGORY_LABELS[latest.category ?? "OTHER"] ?? latest.category}</Badge>
                        </div>
                        <p className="text-xs text-zinc-400 mt-2">
                          {latest.sourcePartnerName && <>来源：{latest.sourcePartnerName} · </>}
                          {latest.createdBy?.name ?? "—"} · {fmtDateTime(latest.updatedAt)}
                          {latest.notes && <> · {latest.notes}</>}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <h3 className="text-xs font-medium text-zinc-500 mb-1">playbook</h3>
                      <p className="text-zinc-700 whitespace-pre-wrap leading-relaxed">
                        {latest.playbook || <span className="text-zinc-300">—</span>}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-xs font-medium text-zinc-500 mb-1">pitch</h3>
                      <p className="text-zinc-700 whitespace-pre-wrap leading-relaxed">
                        {latest.pitch || <span className="text-zinc-300">—</span>}
                      </p>
                    </div>
                  </div>
                  {versions.length > 1 && (
                    <details className="px-5 pb-4">
                      <summary className="text-xs text-indigo-600 cursor-pointer hover:underline">
                        查看历史版本 ({versions.length - 1})
                      </summary>
                      <ul className="mt-3 space-y-3 border-t border-zinc-50 pt-3">
                        {versions.slice(1).map((v) => (
                          <li key={v.id} className="rounded-lg bg-zinc-50 p-3">
                            <div className="flex justify-between gap-2 items-start">
                              <span className="text-xs font-medium text-zinc-600">v{v.version} · {fmtDateTime(v.updatedAt)}</span>
                              <form action={deleteGtmLibraryAction.bind(null, v.id)}>
                                <button className="text-xs text-zinc-400 hover:text-red-600">删除</button>
                              </form>
                            </div>
                            {v.playbook && (
                              <p className="text-xs text-zinc-600 mt-2 line-clamp-3 whitespace-pre-wrap">{v.playbook}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="px-5 py-3 bg-zinc-50/80 border-t border-zinc-100 flex justify-end">
                    <form action={deleteGtmLibraryAction.bind(null, latest.id)}>
                      <button className="text-xs text-zinc-400 hover:text-red-600">删除最新版本</button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-zinc-400 mt-6">
          在<Link href="/partners" className="text-indigo-600 hover:underline">伙伴详情 → 定位打法</Link>
          中编辑内容，可「从库参考」或「存入库」（支持替换 / 新版本）。
        </p>
      </div>
    </div>
  );
}
