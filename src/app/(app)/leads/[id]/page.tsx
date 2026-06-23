import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, fmtDate, fmtDateTime } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { getServerI18n } from "@/lib/server-i18n";
import { isNurturingLead } from "@/lib/leads";

function rankTone(rank?: string | null): "red" | "amber" | "blue" | "zinc" {
  const r = rank?.trim().toUpperCase();
  if (r === "A" || r === "S") return "red";
  if (r === "B") return "amber";
  if (r === "C") return "blue";
  return "zinc";
}

function formatMultiline(raw?: string | null) {
  if (!raw?.trim()) return null;
  return raw.replace(/<BR\s*\/?>/gi, "\n").replace(/\\n/g, "\n").trim();
}

function DetailRow({ label, value }: { label: string; value?: ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-4 py-2.5 border-b border-slate-50 last:border-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800 whitespace-pre-wrap break-words">{value}</dd>
    </div>
  );
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const l = m.leads;
  const { id } = await params;

  const lead = await db.crmLead.findUnique({ where: { id } });
  if (!lead) notFound();

  const nurturing = isNurturingLead(lead);
  const tagsText = formatMultiline(lead.tags);
  const detailText = formatMultiline(lead.detail);
  const traceText = formatMultiline(lead.traceDetail);
  const sourceDetailText = formatMultiline(lead.sourceDetail);

  return (
    <div className="pb-16">
      <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-4 flex items-start gap-3">
        <BackButton fallbackHref="/leads" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-semibold text-slate-900 tracking-tight">
              {lead.name ?? l.unnamed}
            </h1>
            {lead.rank && <Badge tone={rankTone(lead.rank)}>{lead.rank}</Badge>}
            <Badge tone={nurturing ? "purple" : "blue"}>
              {nurturing ? l.tabNurture : l.tabNew}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {[lead.countryCn, lead.city, lead.province].filter(Boolean).join(" · ") || "—"}
            {lead.jzDate ? ` · ${l.fieldKpiDeadline} ${fmtDate(lead.jzDate, bcp47)}` : ""}
          </p>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 grid gap-4 lg:grid-cols-2">
        <Card title={l.sectionBasic}>
          <dl>
            <DetailRow label={l.colCompany} value={lead.name} />
            <DetailRow label={l.fieldClueId} value={lead.id} />
            <DetailRow label={l.fieldCompanyId} value={lead.companyId} />
            <DetailRow label={l.fieldPhone} value={lead.phone} />
            <DetailRow label={l.colStatus} value={lead.status} />
            <DetailRow label={l.colSalesman} value={lead.salesman} />
            <DetailRow label={l.colSdr} value={lead.sdrState} />
            <DetailRow label={l.fieldType} value={lead.typeDetail} />
            <DetailRow label={l.fieldOverseaAgent} value={lead.overseaAgent} />
          </dl>
        </Card>

        <Card title={l.sectionRegion}>
          <dl>
            <DetailRow label={l.fieldCountry} value={lead.countryCn} />
            <DetailRow label={l.fieldCity} value={lead.city} />
            <DetailRow label={l.colProvince} value={lead.province} />
            <DetailRow label={l.fieldRegion} value={lead.region} />
            <DetailRow label={l.fieldZone} value={lead.zone} />
          </dl>
        </Card>

        <Card title={l.sectionSource}>
          <dl>
            <DetailRow label={l.colSource} value={lead.source} />
            <DetailRow label={l.fieldSourceDetail} value={sourceDetailText} />
            <DetailRow label={l.fieldTags} value={tagsText} />
          </dl>
        </Card>

        <Card title={l.sectionDates}>
          <dl>
            <DetailRow
              label={l.fieldKpiStart}
              value={lead.recdate ? fmtDateTime(lead.recdate, bcp47) : null}
            />
            <DetailRow
              label={l.fieldKpiDeadline}
              value={lead.jzDate ? fmtDate(lead.jzDate, bcp47) : null}
            />
            <DetailRow
              label={l.fieldContRecdate}
              value={lead.contRecdate ? fmtDate(lead.contRecdate, bcp47) : null}
            />
            <DetailRow label={l.fieldSyncedAt} value={fmtDateTime(lead.syncedAt, bcp47)} />
          </dl>
        </Card>

        {(detailText || traceText) && (
          <div className="lg:col-span-2">
            <Card title={l.sectionDetail}>
              <dl>
                <DetailRow label={l.fieldTraceDetail} value={traceText} />
                <DetailRow label={l.fieldDetail} value={detailText} />
              </dl>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
