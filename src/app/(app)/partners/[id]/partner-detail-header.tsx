import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Badge, TierBadge } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { computeCompleteness, staleDays, type PartnerWithRelations } from "@/lib/completeness";
import { labelFromMap, loadTaxonomyLabelMaps, parseIndustries } from "@/lib/taxonomy";
import {
  archivePartnerAction,
  promotePartnerAction,
  restorePartnerAction,
  setPipelineStageAction,
} from "@/lib/actions";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";
import { buildCrmCustomerViewUrl } from "@/lib/crm";

export async function PartnerDetailHeader({ id }: { id: string }) {
  const [{ labels, messages: m }, labelMaps, p] = await Promise.all([
    getServerI18n(),
    loadTaxonomyLabelMaps(),
    db.partner.findUnique({
      where: { id },
      include: {
        contacts: { select: { role: true, contactInfo: true } },
        opportunities: { select: { id: true }, take: 1 },
        events: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
        trainings: { select: { id: true }, take: 1 },
        owner: { select: { name: true } },
        salesUser: { select: { name: true } },
        presalesUser: { select: { name: true } },
      },
    }),
  ]);
  if (!p) notFound();

  const L = labelConstants(labels);
  const completeness = computeCompleteness(p as unknown as PartnerWithRelations, labels);
  const stale = staleDays(p);
  const industryCodes = parseIndustries(p);

  return (
    <div className="px-8 pt-5 sm:pt-7 pb-4 sm:pb-5 border-b border-slate-200/60 bg-white">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <BackButton fallbackHref={p.status === "PROSPECT" ? "/pool" : "/partners"} className="mt-1" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 break-words">{p.name}</h1>
              <Badge tone={p.status === "ACTIVE" ? "green" : p.status === "ARCHIVED" ? "zinc" : "blue"}>
                {L.STATUS_LABELS[p.status]}
              </Badge>
              {p.status === "PROSPECT" && <Badge tone="amber">{L.POOL_FLAG_LABELS[p.poolFlag]}</Badge>}
              <TierBadge tier={p.tier} />
              {p.partnerArchetype && (
                <Badge tone="indigo">{labelFromMap(labelMaps.ARCHETYPE, p.partnerArchetype)}</Badge>
              )}
              {industryCodes.map((code) => (
                <Badge key={code} tone="blue">{labelFromMap(labelMaps.INDUSTRY, code)}</Badge>
              ))}
              {p.valuePattern && (
                <Badge tone="purple">{labelFromMap(labelMaps.VALUE_PATTERN, p.valuePattern)}</Badge>
              )}
              {stale > 30 && p.status === "ACTIVE" && (
                <Badge tone="red">{m.partners.stalled.replace("{days}", String(stale))}</Badge>
              )}
            </div>
            <div className="text-sm text-slate-500 mt-1.5">
              {[p.city, p.country].filter(Boolean).join(" · ") || m.common.unknownRegion}
              {p.website && (
                <>
                  {" · "}
                  <a href={`https://${p.website.replace(/^https?:\/\//, "")}`} target="_blank" className="text-sky-600 hover:underline">
                    {p.website}
                  </a>
                </>
              )}
              {" · "}{m.partners.salesOwner}: {p.salesUser?.name ?? p.owner?.name ?? m.common.unassigned}
              {" · "}{m.partners.presalesOwner}: {p.presalesUser?.name ?? m.common.unassigned}
              {" · "}{m.partnerDetail.profileCompletenessPct.replace("{score}", String(completeness.score))}
              {p.crmCustomerId && (
                <>
                  {" · "}
                  <a
                    href={buildCrmCustomerViewUrl(p.crmCustomerId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-600 hover:underline"
                  >
                    {m.integrations.openInCrm} ↗
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {p.status === "PROSPECT" && (
            <form action={promotePartnerAction.bind(null, p.id)}>
              <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800">
                {m.partnerDetail.promoteActive}
              </button>
            </form>
          )}
          {p.status !== "ARCHIVED" ? (
            <form action={archivePartnerAction.bind(null, p.id)}>
              <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-400 hover:text-red-600">
                {m.partnerDetail.archive}
              </button>
            </form>
          ) : (
            <form action={restorePartnerAction.bind(null, p.id)}>
              <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800">
                {m.common.restore}
                {p.prevStatus === "ACTIVE" ? m.partnerDetail.restoreAsActive : m.partnerDetail.restoreAsProspect}
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-1 overflow-x-auto pb-1">
        {labels.pipelineStages.map((s) => {
          const current = p.pipelineStage === s.stage;
          const passed = p.pipelineStage > s.stage;
          return (
            <form key={s.stage} action={setPipelineStageAction.bind(null, p.id, s.stage)} className="shrink-0">
              <button
                title={s.desc}
                className={`rounded-full px-3 py-1.5 text-xs whitespace-nowrap border ${
                  current
                    ? "bg-slate-900 text-white border-slate-900 font-medium"
                    : passed
                      ? "bg-slate-50 text-sky-600 border-slate-200"
                      : "bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-sky-600"
                }`}
              >
                {s.stage}. {s.name}
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
