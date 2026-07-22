import { notFound } from "next/navigation";
import { LocaleSwitcherSegmented } from "@/components/locale-switcher";
import { LocaleProvider } from "@/lib/i18n/context";
import { getLocale } from "@/lib/i18n/locale-server";
import { localeToBcp47 } from "@/lib/i18n/locale";
import { formatMsg, getMessages } from "@/lib/i18n/messages";
import type { LeadPrepBrief } from "@/lib/lead-review/brief";
import {
  getLeadReviewMeetingForPreview,
  parseLeadConfirmedSnapshot,
} from "@/lib/lead-review/preview-token";
import { isLeadReviewVerdict, type LeadReviewVerdict } from "@/lib/lead-review/types";

function parseBrief(raw: string | null): LeadPrepBrief | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LeadPrepBrief;
  } catch {
    return null;
  }
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800 whitespace-pre-wrap break-words">{value}</dd>
    </div>
  );
}

export default async function LeadReviewPreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const meeting = await getLeadReviewMeetingForPreview(token);
  if (!meeting) notFound();

  const locale = await getLocale();
  const m = getMessages(locale).leadReviewShare;
  const dateLocale = localeToBcp47(locale);
  const isFinal = meeting.status === "DONE";

  const verdictLabel: Record<LeadReviewVerdict, string> = {
    QUALITY: m.verdictQuality,
    DIGESTION: m.verdictDigestion,
    NORMAL: m.verdictNormal,
    WATCH: m.verdictWatch,
  };

  const scheduled = meeting.scheduledAt
    ? meeting.scheduledAt.toLocaleString(dateLocale, { hour12: false })
    : null;
  const prepAt = meeting.prepGeneratedAt
    ? meeting.prepGeneratedAt.toLocaleString(dateLocale, { hour12: false })
    : null;
  const endedAt = meeting.endedAt
    ? meeting.endedAt.toLocaleString(dateLocale, { hour12: false })
    : null;

  return (
    <LocaleProvider locale={locale}>
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-sky-700">
              {isFinal ? m.eyebrowFinal : m.eyebrowPrep}
            </p>
            <LocaleSwitcherSegmented locale={locale} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{meeting.title}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            <span>{formatMsg(m.itemsCount, { n: meeting.items.length })}</span>
            <span>{formatMsg(m.createdBy, { name: meeting.createdBy.name })}</span>
            {scheduled ? <span>{formatMsg(m.scheduled, { time: scheduled })}</span> : null}
            {prepAt && !isFinal ? (
              <span>{formatMsg(m.prepUpdated, { time: prepAt })}</span>
            ) : null}
            {endedAt && isFinal ? <span>{formatMsg(m.ended, { time: endedAt })}</span> : null}
          </div>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">
            {isFinal ? m.descFinal : m.descPrep}
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {meeting.items.map((item, idx) => {
          const brief = parseBrief(item.prepBrief);
          const snap = parseLeadConfirmedSnapshot(item.confirmedSnapshot);
          const verdict =
            (snap?.verdict && isLeadReviewVerdict(snap.verdict) && snap.verdict) ||
            (item.verdict && isLeadReviewVerdict(item.verdict) && item.verdict) ||
            null;
          const notes = (snap?.coreNotes || item.coreNotes || "").trim();
          const todos = snap?.todos ?? [];
          const name = brief?.name || item.displayName || "—";

          return (
            <article
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80">
                <div className="flex items-baseline gap-3">
                  <span className="text-sm font-mono text-slate-400">{idx + 1}</span>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{name}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.source === "CHANNEL" ? m.sourceChannel : m.sourceNurture}
                      {verdict ? ` · ${verdictLabel[verdict]}` : ""}
                    </p>
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 space-y-4">
                {isFinal ? (
                  <>
                    {verdict ? (
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-1">{m.verdict}</div>
                        <p className="text-sm font-medium text-slate-800">{verdictLabel[verdict]}</p>
                      </div>
                    ) : null}
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">{m.notes}</div>
                      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                        {notes || m.noNotes}
                      </p>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">{m.todos}</div>
                      {todos.length ? (
                        <ul className="space-y-2">
                          {todos.map((t, i) => (
                            <li
                              key={`${t.title}-${i}`}
                              className="rounded-lg border border-slate-100 px-3 py-2 text-sm"
                            >
                              <div className="font-medium text-slate-800">{t.title}</div>
                              {t.detail ? (
                                <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">
                                  {t.detail}
                                </p>
                              ) : null}
                              {t.dueDate ? (
                                <p className="text-[11px] text-slate-400 mt-1">
                                  {formatMsg(m.due, { date: t.dueDate.slice(0, 10) })}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-slate-400">{m.noTodos}</p>
                      )}
                    </div>
                  </>
                ) : brief ? (
                  <>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                      <Fact label={m.factsType} value={brief.typeDetail} />
                      <Fact
                        label={m.factsRankStatus}
                        value={[brief.rank, brief.status].filter(Boolean).join(" · ")}
                      />
                      <Fact label={m.factsSales} value={brief.salesman} />
                      <Fact label={m.factsPrevSales} value={brief.staSalesOld} />
                      <Fact label={brief.dateLabel} value={brief.dateValue} />
                      <Fact label={m.factsRegion} value={brief.region} />
                      <Fact label={m.factsProvince} value={brief.province} />
                      <Fact label={m.factsSource} value={brief.sourceLabel} />
                      <Fact label={m.factsContact} value={brief.contName} />
                      <Fact label={m.factsTitle} value={brief.contDuty} />
                      <Fact label={m.factsPhone} value={brief.phone} />
                      <Fact label={m.factsEmail} value={brief.contEmail} />
                    </dl>
                    {brief.traceDetail || brief.detail ? (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-slate-500">{m.bizRecords}</div>
                        {brief.traceDetail ? (
                          <p className="text-sm text-slate-700 whitespace-pre-wrap break-words rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 max-h-48 overflow-y-auto">
                            {brief.traceDetail}
                          </p>
                        ) : null}
                        {brief.detail ? (
                          <p className="text-sm text-slate-700 whitespace-pre-wrap break-words rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 max-h-48 overflow-y-auto">
                            {brief.detail}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {brief.topics?.length ? (
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-1">{m.topics}</div>
                        <ul className="list-disc pl-5 space-y-0.5 text-sm text-slate-700">
                          {brief.topics.map((topic) => (
                            <li key={topic}>{topic}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-slate-400">{m.noBrief}</p>
                )}
              </div>
            </article>
          );
        })}
      </main>

      <footer className="max-w-3xl mx-auto px-4 sm:px-6 pb-10 text-center text-xs text-slate-400">
        {isFinal ? m.footerFinal : m.footerPrep}
      </footer>
    </div>
    </LocaleProvider>
  );
}
