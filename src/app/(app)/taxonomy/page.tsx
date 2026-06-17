import Link from "next/link";
import { requireUser } from "@/lib/session";
import { PageHeader, Badge, fmtDateTime } from "@/components/ui";
import {
  TAXONOMY_DIMENSION_META,
  ensureTaxonomySeed,
  getTaxonomyOptions,
  type TaxonomyDimension,
} from "@/lib/taxonomy";
import {
  createTaxonomyOptionAction,
  deleteTaxonomyOptionAction,
} from "@/lib/taxonomy-actions";
import { db } from "@/lib/db";

const DIMS: TaxonomyDimension[] = ["ARCHETYPE", "INDUSTRY", "VALUE_PATTERN", "CATEGORY"];

export default async function TaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<{ dim?: string }>;
}) {
  await requireUser();
  await ensureTaxonomySeed();
  const sp = await searchParams;
  const activeDim = (DIMS.includes(sp.dim as TaxonomyDimension) ? sp.dim : "ARCHETYPE") as TaxonomyDimension;

  const options = await db.taxonomyOption.findMany({
    where: { dimension: activeDim },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: { createdBy: { select: { name: true } } },
  });

  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm";

  return (
    <div className="pb-16">
      <PageHeader
        title="Taxonomy Library"
        desc="Shared team taxonomy: partner archetypes, industries, value patterns, and competitor DNA. Partners pick values from here; add new options when needed."
      />

      <div className="px-8 max-w-3xl">
        <div className="flex flex-wrap gap-2 mb-6">
          {DIMS.map((dim) => (
            <Link
              key={dim}
              href={`/taxonomy?dim=${dim}`}
              className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${
                dim === activeDim
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-zinc-600 border-zinc-200 hover:border-indigo-300"
              }`}
            >
              {TAXONOMY_DIMENSION_META[dim].label}
            </Link>
          ))}
        </div>

        <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 mb-6 text-sm text-indigo-900">
          <p className="font-medium mb-1">How does this work with partner records?</p>
          <ul className="text-xs text-indigo-800/90 space-y-1 list-disc pl-4">
            <li><strong>Taxonomy Library</strong> defines available options — changes here immediately add choices to all partner dropdowns and multi-selects</li>
            <li><strong>Partner records</strong> store option codes only (e.g. BANKING, BI_MIGRATOR); display labels are looked up from the taxonomy library</li>
            <li><strong>Playbook Library</strong> snapshots dimension labels when saving playbooks/pitches, so you can search by industry or archetype</li>
            <li>Built-in options cannot be deleted; unused custom options can be removed here</li>
          </ul>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold mb-3">Add · {TAXONOMY_DIMENSION_META[activeDim].label}</h2>
          <form action={createTaxonomyOptionAction} className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <input type="hidden" name="dimension" value={activeDim} />
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs text-zinc-500">Display name *</span>
              <input name="label" required placeholder="e.g. Cloud channel alliance" className={input} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-500">Code (optional, auto-generated if blank)</span>
              <input name="code" placeholder="CLOUD_CHANNEL" className={input} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-zinc-500">Description (optional)</span>
              <input name="description" placeholder="When to use this option" className={input} />
            </label>
            <div className="md:col-span-2 flex justify-end">
              <button className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700">
                Add to taxonomy library
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-700">
            Current options ({options.length})
          </h2>
          {options.map((o) => (
            <div
              key={o.id}
              className="bg-white rounded-lg border border-zinc-200/80 px-4 py-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-zinc-900">{o.label}</span>
                  <code className="text-xs text-zinc-400 bg-zinc-50 px-1.5 py-0.5 rounded">{o.code}</code>
                  {o.isBuiltin ? (
                    <Badge tone="zinc">Built-in</Badge>
                  ) : (
                    <Badge tone="green">Custom</Badge>
                  )}
                </div>
                {o.description && <p className="text-xs text-zinc-500 mt-1">{o.description}</p>}
                {!o.isBuiltin && (
                  <p className="text-xs text-zinc-400 mt-1">
                    {o.createdBy?.name ?? "—"} · {fmtDateTime(o.createdAt)}
                  </p>
                )}
              </div>
              {!o.isBuiltin && (
                <form action={deleteTaxonomyOptionAction.bind(null, o.id)}>
                  <button className="text-xs text-zinc-400 hover:text-red-600 shrink-0">Delete</button>
                </form>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-zinc-400 mt-8">
          Return to <Link href="/partners" className="text-indigo-600 hover:underline">partner details</Link>
          to edit profiles — each dropdown has a &quot;Taxonomy +&quot; link to jump here.
        </p>
      </div>
    </div>
  );
}
