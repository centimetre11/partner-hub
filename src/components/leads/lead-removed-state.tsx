import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { getServerI18n } from "@/lib/server-i18n";

export async function LeadRemovedState({ leadId }: { leadId: string }) {
  const { messages: m } = await getServerI18n();
  const l = m.leads;

  return (
    <div className="pb-16">
      <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-4 flex items-start gap-3">
        <BackButton fallbackHref="/leads" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-semibold text-slate-900 tracking-tight">
            {l.leadNotFoundTitle}
          </h1>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 max-w-xl">
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-5 sm:p-6">
          <p className="text-sm text-amber-950 leading-relaxed">{l.leadNotFoundDesc}</p>
          <p className="mt-3 text-xs text-amber-800/80 font-mono break-all">
            {l.fieldClueId}: {leadId}
          </p>
          <Link
            href="/leads?removed=1"
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
          >
            {l.leadNotFoundBack}
          </Link>
        </div>
      </div>
    </div>
  );
}
