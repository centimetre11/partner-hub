"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Badge, Card, fmtDateTime } from "@/components/ui";
import { useLocale, useMessages } from "@/lib/i18n/context";
import { localeToBcp47 } from "@/lib/i18n/locale";
import type { LeadResearchStructured } from "@/lib/lead-research";

type ResearchRow = {
  id: string;
  leadId: string;
  summary: string;
  status: string;
  error?: string | null;
  searchQuery?: string | null;
  searchBackend?: string | null;
  researchedAt: string;
  structured?: LeadResearchStructured | null;
};

const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white shadow-sm transition-all hover:bg-slate-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60";
const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";

function confidenceTone(c?: string): "green" | "amber" | "zinc" {
  if (c === "high") return "green";
  if (c === "medium") return "amber";
  return "zinc";
}

function confidenceLabel(c: string | undefined, labels: { high: string; medium: string; low: string }) {
  if (c === "high") return labels.high;
  if (c === "medium") return labels.medium;
  return labels.low;
}

export function LeadResearchPanel({ leadId }: { leadId: string }) {
  const m = useMessages();
  const r = m.leads.research;
  const locale = useLocale();
  const bcp47 = localeToBcp47(locale);

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [research, setResearch] = useState<ResearchRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadResearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/research`);
      const data = (await res.json().catch(() => null)) as { research?: ResearchRow | null; error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? r.loadFailed);
        return;
      }
      setResearch(data?.research ?? null);
    } catch {
      setError(r.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [leadId, r.loadFailed]);

  useEffect(() => {
    void loadResearch();
  }, [loadResearch]);

  const runResearch = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/research`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        needsWebSearch?: boolean;
        research?: ResearchRow;
      } | null;

      if (!res.ok || !data?.ok) {
        setError(data?.needsWebSearch ? r.noWebSearch : (data?.error ?? r.runFailed));
      } else if (data.research) {
        setResearch(data.research);
      }
    } catch {
      setError(r.runFailed);
    } finally {
      setRunning(false);
      try {
        const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/research`);
        const data = (await res.json().catch(() => null)) as { research?: ResearchRow | null } | null;
        if (res.ok && data?.research) {
          setResearch(data.research);
          setError(null);
        }
      } catch {
        /* keep existing error if sync fails */
      }
    }
  };

  const structured = research?.structured;
  const busy = loading || running;

  return (
    <Card title={r.title}>
      <div className="space-y-4">
        <p className="text-xs text-slate-500">{r.desc}</p>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => void runResearch()}>
            {running ? r.running : research ? r.rerun : r.run}
          </button>
          {research && (
            <button type="button" className={btnSecondary} disabled={busy} onClick={() => void loadResearch()}>
              {r.refresh}
            </button>
          )}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {loading && !research && !running && <p className="text-xs text-slate-400">{r.loading}</p>}

        {running && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            {r.runningHint}
          </p>
        )}

        {research?.status === "error" && (
          <p className="text-xs text-red-600">{research.error ?? r.runFailed}</p>
        )}

        {research?.status === "done" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span>
                {r.researchedAt}: {fmtDateTime(new Date(research.researchedAt), bcp47)}
              </span>
              {research.searchBackend && <span>· {research.searchBackend}</span>}
            </div>

            {research.summary && (
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3 text-sm text-slate-800 prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1">
                <ReactMarkdown>{research.summary}</ReactMarkdown>
              </div>
            )}

            {structured && (
              <div className="rounded-lg border border-slate-100 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-700">{r.companySection}</h3>
                  <Badge tone={confidenceTone(structured.company.confidence)}>
                    {confidenceLabel(structured.company.confidence, r.confidence)}
                  </Badge>
                </div>
                <dl className="text-xs space-y-1.5">
                  {structured.company.website && (
                    <div>
                      <dt className="text-slate-400">{r.website}</dt>
                      <dd className="text-slate-800 break-all">{structured.company.website}</dd>
                    </div>
                  )}
                  {structured.company.industry && (
                    <div>
                      <dt className="text-slate-400">{r.industry}</dt>
                      <dd className="text-slate-800">{structured.company.industry}</dd>
                    </div>
                  )}
                  {structured.company.description && (
                    <div>
                      <dt className="text-slate-400">{r.description}</dt>
                      <dd className="text-slate-800">{structured.company.description}</dd>
                    </div>
                  )}
                  {structured.company.background && (
                    <div>
                      <dt className="text-slate-400">{r.background}</dt>
                      <dd className="text-slate-800 whitespace-pre-wrap">{structured.company.background}</dd>
                    </div>
                  )}
                  {structured.company.products && (
                    <div>
                      <dt className="text-slate-400">{r.products}</dt>
                      <dd className="text-slate-800">{structured.company.products}</dd>
                    </div>
                  )}
                  {structured.company.scale && (
                    <div>
                      <dt className="text-slate-400">{r.scale}</dt>
                      <dd className="text-slate-800">{structured.company.scale}</dd>
                    </div>
                  )}
                </dl>
                {structured.company.sources?.length > 0 && (
                  <ul className="text-[11px] text-slate-500 space-y-1 pt-1 border-t border-slate-50">
                    {structured.company.sources.slice(0, 6).map((s, i) => (
                      <li key={i}>
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">
                            {s.title}
                          </a>
                        ) : (
                          s.title
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {research.searchQuery && (
              <p className="text-[11px] text-slate-400">
                {r.searchQuery}: {research.searchQuery}
              </p>
            )}
          </div>
        )}

        {!loading && !running && !research && !error && (
          <p className="text-xs text-slate-400">{r.empty}</p>
        )}
      </div>
    </Card>
  );
}
