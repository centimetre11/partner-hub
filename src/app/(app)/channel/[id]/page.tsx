import type { ReactNode } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, fmtDate, fmtDateTime } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { getServerI18n } from "@/lib/server-i18n";
import { getChannelClueId } from "@/lib/channel";

function rankTone(rank?: string | null): "red" | "amber" | "blue" | "zinc" {
  const r = rank?.trim().toUpperCase();
  if (r === "A" || r === "S") return "red";
  if (r === "B") return "amber";
  if (r === "C") return "blue";
  return "zinc";
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

export default async function ChannelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const l = m.channel;
  const { id } = await params;

  const row = await db.crmChannel.findUnique({ where: { id } });
  if (!row) {
    return (
      <div className="pb-16 px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7">
        <BackButton fallbackHref="/channel" />
        <h1 className="mt-4 text-lg font-semibold text-slate-900">{l.notFoundTitle}</h1>
        <p className="mt-2 text-sm text-slate-600">{l.notFoundDesc}</p>
        <Link href="/channel" className="mt-4 inline-block text-sm text-sky-700 hover:underline">
          {l.notFoundBack}
        </Link>
      </div>
    );
  }

  const clueId = getChannelClueId(row.id);

  return (
    <div className="pb-16">
      <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-4 flex items-start gap-3">
        <BackButton fallbackHref="/channel" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-semibold text-slate-900 tracking-tight">
              {row.name ?? l.unnamed}
            </h1>
            {row.rank && <Badge tone={rankTone(row.rank)}>{row.rank}</Badge>}
            {row.typeDetail && <Badge tone="zinc">{row.typeDetail}</Badge>}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {[row.countryCn, row.city, row.province].filter(Boolean).join(" · ") || "—"}
            {row.staRecdate ? ` · ${l.fieldStaRecdate} ${fmtDate(row.staRecdate, bcp47)}` : ""}
          </p>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 grid gap-4 lg:grid-cols-2">
        <Card title={l.sectionBasic}>
          <dl>
            <DetailRow label={l.fieldClueId} value={clueId} />
            <DetailRow label={l.fieldCompanyId} value={row.companyId} />
            <DetailRow label={l.fieldType} value={row.typeDetail} />
            <DetailRow label={l.fieldStatus} value={row.status} />
            <DetailRow label={l.fieldRank} value={row.rank} />
            <DetailRow label={l.fieldPhone} value={row.phone} />
            <DetailRow label={l.fieldSalesman} value={row.salesman} />
            <DetailRow label={l.fieldStaSalesOld} value={row.staSalesOld} />
            <DetailRow label={l.fieldOverseaAgent} value={row.overseaAgent} />
          </dl>
        </Card>

        <Card title={l.sectionContact}>
          <dl>
            <DetailRow label={l.fieldContName} value={row.contName} />
            <DetailRow label={l.fieldContEmail} value={row.contEmail} />
            <DetailRow label={l.fieldContDuty} value={row.contDuty} />
            <DetailRow
              label={l.fieldContRecdate}
              value={row.contRecdate ? fmtDate(row.contRecdate, bcp47) : null}
            />
          </dl>
        </Card>

        <Card title={l.sectionRegion}>
          <dl>
            <DetailRow label={l.fieldCountry} value={row.countryCn} />
            <DetailRow label={l.fieldCity} value={row.city} />
            <DetailRow label={l.fieldProvince} value={row.province} />
            <DetailRow label={l.fieldRegion} value={row.region} />
            <DetailRow label={l.fieldZone} value={row.zone} />
          </dl>
        </Card>

        <Card title={l.sectionSource}>
          <dl>
            <DetailRow label={l.fieldSource} value={row.source} />
            <DetailRow label={l.fieldSourceDetail} value={row.sourceDetail} />
          </dl>
        </Card>

        <Card title={l.sectionDates}>
          <dl>
            <DetailRow
              label={l.fieldStaRecdate}
              value={row.staRecdate ? fmtDateTime(row.staRecdate, bcp47) : null}
            />
            <DetailRow
              label={l.fieldSyncedAt}
              value={row.syncedAt ? fmtDateTime(row.syncedAt, bcp47) : null}
            />
          </dl>
        </Card>
      </div>
    </div>
  );
}
