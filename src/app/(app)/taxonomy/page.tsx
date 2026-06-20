import Link from "next/link";
import { requireUser } from "@/lib/session";
import { PageHeader, Badge, fmtDateTime } from "@/components/ui";
import {
  ensureTaxonomySeed,
  getTaxonomyOptions,
  type TaxonomyDimension,
} from "@/lib/taxonomy";
import {
  createTaxonomyOptionAction,
  deleteTaxonomyOptionAction,
} from "@/lib/taxonomy-actions";
import { db } from "@/lib/db";
import { getServerI18n } from "@/lib/server-i18n";

const DIMS: TaxonomyDimension[] = ["ARCHETYPE", "INDUSTRY", "VALUE_PATTERN", "CATEGORY"];

export default async function TaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<{ dim?: string }>;
}) {
  await requireUser();
  const { labels, messages: m, bcp47 } = await getServerI18n();
  await ensureTaxonomySeed();
  const sp = await searchParams;
  const activeDim = (DIMS.includes(sp.dim as TaxonomyDimension) ? sp.dim : "ARCHETYPE") as TaxonomyDimension;

  const options = await db.taxonomyOption.findMany({
    where: { dimension: activeDim },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: { createdBy: { select: { name: true } } },
  });

  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm";
  const howBullets = [
    m.taxonomy.howItWorksBullet1,
    m.taxonomy.howItWorksBullet2,
    m.taxonomy.howItWorksBullet3,
    m.taxonomy.howItWorksBullet4,
  ];

  return (
    <div className="pb-16">
      <PageHeader title={m.taxonomy.title} desc={m.taxonomy.descFull} />

      <div className="px-8 max-w-3xl">
        <div className="flex flex-wrap gap-2 mb-6">
          {DIMS.map((dim) => (
            <Link
              key={dim}
              href={`/taxonomy?dim=${dim}`}
              className={`rounded-full px-4 py-1.5 text-sm border ${
                dim === activeDim
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {labels.taxonomyMeta[dim].label}
            </Link>
          ))}
        </div>

        <div className="bg-slate-50/60 border border-slate-200 rounded-lg p-4 mb-6 text-sm text-slate-900">
          <p className="font-medium mb-1">{m.taxonomy.howItWorks}</p>
          <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
            {howBullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold mb-3">{m.taxonomy.addLabel.replace("{dim}", labels.taxonomyMeta[activeDim].label)}</h2>
          <form action={createTaxonomyOptionAction} className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <input type="hidden" name="dimension" value={activeDim} />
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-slate-500">{m.taxonomy.displayName}</span>
              <input name="label" required placeholder={m.taxonomy.namePlaceholder} className={input} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-500">{m.taxonomy.codeOptional}</span>
              <input name="code" placeholder={m.taxonomy.codePlaceholder} className={input} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-500">{m.taxonomy.descriptionOptional}</span>
              <input name="description" placeholder={m.taxonomy.descPlaceholder} className={input} />
            </label>
            <div className="md:col-span-2 flex justify-end">
              <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800">
                {m.taxonomy.addToLibrary}
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">
            {m.taxonomy.currentOptions.replace("{count}", String(options.length))}
          </h2>
          {options.map((o) => (
            <div
              key={o.id}
              className="bg-white rounded-lg border border-slate-200/80 px-4 py-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-900">{o.label}</span>
                  <code className="text-xs text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{o.code}</code>
                  {o.isBuiltin ? (
                    <Badge tone="zinc">{m.taxonomy.builtin}</Badge>
                  ) : (
                    <Badge tone="green">{m.taxonomy.custom}</Badge>
                  )}
                </div>
                {o.description && <p className="text-xs text-slate-500 mt-1">{o.description}</p>}
                {!o.isBuiltin && (
                  <p className="text-xs text-slate-400 mt-1">
                    {o.createdBy?.name ?? "—"} · {fmtDateTime(o.createdAt, bcp47)}
                  </p>
                )}
              </div>
              {!o.isBuiltin && (
                <form action={deleteTaxonomyOptionAction.bind(null, o.id)}>
                  <button className="text-xs text-slate-400 hover:text-red-600 shrink-0">{m.common.delete}</button>
                </form>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-400 mt-8">{m.taxonomy.returnToPartnerDetails}</p>
      </div>
    </div>
  );
}
