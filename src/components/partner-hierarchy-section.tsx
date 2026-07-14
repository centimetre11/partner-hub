import { formatProcessTagsDisplay } from "@/lib/opportunity-process-tags";
import { isOpenOpportunityStatus, opportunityStatusLabel, opportunityStatusTone } from "@/lib/opportunity-status";
import type { Locale } from "@/lib/i18n/locale";
import Link from "next/link";
import { Badge, Card, EmptyState, fmtDate, StageBadge } from "@/components/ui";
import type { Messages } from "@/lib/i18n/messages/en";
import { stageName, type ServerI18n } from "@/lib/server-i18n";
import { SubPartnerActions } from "@/components/sub-partner-actions";
import type { TaxonomyOptionRow } from "@/lib/taxonomy";

type ChildPartner = {
  id: string;
  name: string;
  tier: string | null;
  pipelineStage: number;
  status: string;
  salesUser: { name: string } | null;
  owner: { name: string } | null;
};

type RollupOpp = {
  id: string;
  name: string;
  amount: string | null;
  stage: string;
  status: string;
  updatedAt: Date;
  partner: { id: string; name: string } | null;
};

type RollupProject = {
  id: string;
  name: string;
  amount: string | null;
  phase: string;
  status: string;
  updatedAt: Date;
  partner: { id: string; name: string } | null;
};

export function PartnerHierarchySection({
  partnerId,
  partnerName,
  children,
  opportunities,
  projects,
  attachCandidates,
  m,
  labels,
  bcp47,
  locale = "zh",
  taxonomy,
}: {
  partnerId: string;
  partnerName: string;
  children: ChildPartner[];
  opportunities: RollupOpp[];
  projects: RollupProject[];
  attachCandidates: { id: string; name: string; status: string }[];
  m: Messages;
  labels: ServerI18n["labels"];
  bcp47: string;
  locale?: Locale;
  taxonomy: { CATEGORY: TaxonomyOptionRow[]; INDUSTRY: TaxonomyOptionRow[] };
}) {
  const pd = m.partnerDetail;
  const activeOpps = opportunities.filter((o) => isOpenOpportunityStatus(o.status)).length;
  const wonOpps = opportunities.filter((o) => o.status === "WON").length;
  const activeProjects = projects.filter((p) => p.status === "ACTIVE").length;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">{pd.hierarchyTitle}</h3>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{pd.hierarchyIntro}</p>
      </div>

      <Card
        title={pd.subPartners.replace("{count}", String(children.length))}
        actions={
          <SubPartnerActions
            distributorId={partnerId}
            distributorName={partnerName}
            attachCandidates={attachCandidates}
            taxonomy={taxonomy}
          />
        }
      >
        {children.length === 0 ? (
          <EmptyState text={pd.noSubPartners} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2 font-medium">{pd.colName}</th>
                  <th className="pb-2 font-medium">{m.common.tier}</th>
                  <th className="pb-2 font-medium">{pd.colStage}</th>
                  <th className="pb-2 font-medium">{m.partners.salesOwner}</th>
                </tr>
              </thead>
              <tbody>
                {children.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5">
                      <Link href={`/partners/${c.id}`} className="text-sky-700 hover:underline font-medium">
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2.5 text-slate-600">{c.tier ?? "—"}</td>
                    <td className="py-2.5">
                      <StageBadge stage={c.pipelineStage} name={stageName(labels, c.pipelineStage)} />
                    </td>
                    <td className="py-2.5 text-slate-600">
                      {c.salesUser?.name ?? c.owner?.name ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={pd.hierarchyRollup}>
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
            <div className="text-[11px] text-slate-400">{pd.rollupActiveOpps}</div>
            <div className="text-lg font-semibold text-slate-800 mt-0.5">{activeOpps}</div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
            <div className="text-[11px] text-slate-400">{pd.rollupWonOpps}</div>
            <div className="text-lg font-semibold text-slate-800 mt-0.5">{wonOpps}</div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
            <div className="text-[11px] text-slate-400">{pd.rollupActiveProjects}</div>
            <div className="text-lg font-semibold text-slate-800 mt-0.5">{activeProjects}</div>
          </div>
        </div>

        <h4 className="text-xs font-medium text-slate-500 mb-2">{pd.rollupOpportunities}</h4>
        {opportunities.length === 0 ? (
          <p className="text-sm text-slate-400 mb-4">{pd.rollupEmptyOpps}</p>
        ) : (
          <ul className="space-y-2 mb-5">
            {opportunities.slice(0, 20).map((o) => (
              <li key={o.id} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="text-slate-800 font-medium truncate block">{o.name}</span>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {o.partner
                      ? pd.rollupViaPartner.replace("{name}", o.partner.name)
                      : "—"}
                    {" · "}
                    {formatProcessTagsDisplay(o.stage, locale)}
                    {o.amount ? ` · ${o.amount}` : ""}
                    {" · "}
                    {fmtDate(o.updatedAt, bcp47)}
                  </div>
                </div>
                <Badge tone={opportunityStatusTone(o.status)}>
                  {opportunityStatusLabel(o.status, locale)}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        <h4 className="text-xs font-medium text-slate-500 mb-2">{pd.rollupProjects}</h4>
        {projects.length === 0 ? (
          <p className="text-sm text-slate-400">{pd.rollupEmptyProjects}</p>
        ) : (
          <ul className="space-y-2">
            {projects.slice(0, 20).map((proj) => (
              <li key={proj.id} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="text-slate-800 font-medium truncate block">{proj.name}</span>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {proj.partner
                      ? pd.rollupViaPartner.replace("{name}", proj.partner.name)
                      : "—"}
                    {" · "}
                    {proj.phase}
                    {proj.amount ? ` · ${proj.amount}` : ""}
                    {" · "}
                    {fmtDate(proj.updatedAt, bcp47)}
                  </div>
                </div>
                <Badge tone={proj.status === "ACTIVE" ? "blue" : "zinc"}>{proj.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
