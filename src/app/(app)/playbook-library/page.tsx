import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, fmtDateTime } from "@/components/ui";
import {
  labelFromMap,
  loadTaxonomyLabelMaps,
  parseIndustries,
} from "@/lib/taxonomy";
import { deleteGtmLibraryAction } from "@/lib/gtm-library-actions";
import { getServerI18n } from "@/lib/server-i18n";

export default async function PlaybookLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const labelMaps = await loadTaxonomyLabelMaps();

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
      <PageHeader title={m.playbookLibrary.title} desc={m.playbookLibrary.desc} />
      <div className="px-8 max-w-4xl">
        <form className="mb-4 flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder={m.playbookLibrary.searchPlaceholder}
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700">{m.common.search}</button>
        </form>

        {grouped.length === 0 ? (
          <div className="text-center text-sm text-zinc-400 py-16 bg-white rounded-xl border">
            {m.playbookLibrary.emptyExtended}
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
                          <Badge tone="indigo">{m.playbookLibrary.latestVersion.replace("{n}", String(latest.version))}</Badge>
                          {versions.length > 1 && (
                            <Badge tone="zinc">{m.playbookLibrary.versions.replace("{n}", String(versions.length))}</Badge>
                          )}
                          {(latest.industries ? parseIndustries({ industries: latest.industries }) : latest.industry ? [latest.industry] : []).map((code) => (
                            <Badge key={code} tone="blue">{labelFromMap(labelMaps.INDUSTRY, code)}</Badge>
                          ))}
                          {latest.valuePattern && (
                            <Badge tone="purple">{labelFromMap(labelMaps.VALUE_PATTERN, latest.valuePattern)}</Badge>
                          )}
                          {latest.partnerArchetype && (
                            <Badge tone="indigo">{labelFromMap(labelMaps.ARCHETYPE, latest.partnerArchetype)}</Badge>
                          )}
                          <Badge tone="zinc">{labelFromMap(labelMaps.CATEGORY, latest.category ?? "OTHER")}</Badge>
                        </div>
                        <p className="text-xs text-zinc-400 mt-2">
                          {latest.sourcePartnerName && <>{m.playbookLibrary.source} {latest.sourcePartnerName} · </>}
                          {latest.createdBy?.name ?? "—"} · {fmtDateTime(latest.updatedAt, bcp47)}
                          {latest.notes && <> · {latest.notes}</>}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <h3 className="text-xs font-medium text-zinc-500 mb-1">{m.playbookLibrary.playbookLabel}</h3>
                      <p className="text-zinc-700 whitespace-pre-wrap leading-relaxed">
                        {latest.playbook || <span className="text-zinc-300">—</span>}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-xs font-medium text-zinc-500 mb-1">{m.playbookLibrary.pitchLabel}</h3>
                      <p className="text-zinc-700 whitespace-pre-wrap leading-relaxed">
                        {latest.pitch || <span className="text-zinc-300">—</span>}
                      </p>
                    </div>
                  </div>
                  {versions.length > 1 && (
                    <details className="px-5 pb-4">
                      <summary className="text-xs text-indigo-600 cursor-pointer hover:underline">
                        {m.playbookLibrary.viewHistoryCount.replace("{count}", String(versions.length - 1))}
                      </summary>
                      <ul className="mt-3 space-y-3 border-t border-zinc-50 pt-3">
                        {versions.slice(1).map((v) => (
                          <li key={v.id} className="rounded-lg bg-zinc-50 p-3">
                            <div className="flex justify-between gap-2 items-start">
                              <span className="text-xs font-medium text-zinc-600">v{v.version} · {fmtDateTime(v.updatedAt, bcp47)}</span>
                              <form action={deleteGtmLibraryAction.bind(null, v.id)}>
                                <button className="text-xs text-zinc-400 hover:text-red-600">{m.common.delete}</button>
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
                      <button className="text-xs text-zinc-400 hover:text-red-600">{m.playbookLibrary.deleteLatest}</button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-zinc-400 mt-6">{m.playbookLibrary.footerHint}</p>
      </div>
    </div>
  );
}
