"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { searchKnowhowAction, getKnowhowDocumentAction } from "@/lib/knowhow-actions";
import { resolveKnowhowSearchEntryUrl } from "@/lib/knowhow-url";
import type { KnowhowSearchHit } from "@/lib/knowhow";
import { useMessages } from "@/lib/i18n/context";
import { KnowhowMarkdown } from "./knowhow-markdown";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

type Props = {
  configured: boolean;
  isAdmin: boolean;
};

export function KnowhowSearchPanel({ configured, isAdmin }: Props) {
  const m = useMessages();
  const L = m.knowhow;

  const [query, setQuery] = useState("");
  const [businessDomain, setBusinessDomain] = useState<"project" | "contract">("project");
  const [tags, setTags] = useState("");
  const [quality, setQuality] = useState("");
  const [nodePath, setNodePath] = useState("");
  const [industry, setIndustry] = useState("");
  const [topK, setTopK] = useState(20);
  const [showFilters, setShowFilters] = useState(false);
  const [hits, setHits] = useState<KnowhowSearchHit[]>([]);
  const [selectedHit, setSelectedHit] = useState<KnowhowSearchHit | null>(null);
  const [detail, setDetail] = useState<{
    title: string;
    content: string;
    sourceUrl: string;
    metadata: Record<string, unknown>;
    fromSearchFallback?: boolean;
    apiError?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function searchEntryUrlFor(hit: KnowhowSearchHit) {
    return resolveKnowhowSearchEntryUrl(hit);
  }

  function search() {
    startTransition(async () => {
      setError(null);
      setSelectedHit(null);
      setDetail(null);
      const res = await searchKnowhowAction({
        query,
        businessDomain,
        tags,
        quality,
        nodePath,
        industry,
        topK,
      });
      if (res.error) {
        setError(res.error);
        setHits([]);
        return;
      }
      setHits(res.hits ?? []);
      if (!res.hits?.length && res.hint) setError(res.hint);
    });
  }

  function openDetail(hit: KnowhowSearchHit) {
    startTransition(async () => {
      setError(null);
      setSelectedHit(hit);
      const res = await getKnowhowDocumentAction(hit);
      const url = searchEntryUrlFor(hit);
      if (res.error) {
        setError(res.error);
        setDetail({
          title: hit.title,
          content: hit.content,
          sourceUrl: url,
          metadata: hit.metadata,
          fromSearchFallback: true,
          apiError: res.error,
        });
        return;
      }
      if (res.doc) {
        setDetail({
          title: res.doc.title,
          content: res.doc.content,
          sourceUrl: resolveKnowhowSearchEntryUrl({
            ...hit,
            sourceUrl: res.doc.sourceUrl || hit.sourceUrl,
          }),
          metadata: res.doc.metadata,
          fromSearchFallback: res.fromSearchFallback,
          apiError: res.apiError,
        });
      }
    });
  }

  if (!configured) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
        {isAdmin ? (
          <>
            {L.notConfiguredAdmin}{" "}
            <Link href="/settings" className="underline font-medium">
              {m.nav.teamSettings}
            </Link>
          </>
        ) : (
          L.notConfigured
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">{L.query}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && query.trim() && search()}
            placeholder={L.queryPlaceholder}
            className={input}
          />
        </label>

        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="text-xs text-sky-600 hover:underline"
        >
          {showFilters ? L.collapseFilters : L.filters}
        </button>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <label className="block space-y-1">
              <span className="text-xs text-slate-500">{L.businessDomain}</span>
              <select
                value={businessDomain}
                onChange={(e) => setBusinessDomain(e.target.value as "project" | "contract")}
                className={input}
              >
                <option value="project">{L.project}</option>
                <option value="contract">{L.contract}</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500">{L.topK}</span>
              <input
                type="number"
                min={1}
                max={100}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value) || 20)}
                className={input}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500">{L.tags}</span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={L.tagsPlaceholder} className={input} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500">{L.quality}</span>
              <input value={quality} onChange={(e) => setQuality(e.target.value)} placeholder={L.qualityPlaceholder} className={input} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500">{L.nodePath}</span>
              <input value={nodePath} onChange={(e) => setNodePath(e.target.value)} placeholder={L.nodePathPlaceholder} className={input} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500">{L.industry}</span>
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder={L.industryPlaceholder} className={input} />
            </label>
          </div>
        )}

        <button
          type="button"
          disabled={pending || !query.trim()}
          onClick={search}
          className="rounded-lg bg-slate-900 text-white px-5 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-40"
        >
          {pending ? L.searching : L.search}
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 text-red-700 text-sm px-4 py-3 whitespace-pre-wrap">{error}</div>}

      {selectedHit && detail && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedHit(null);
                setDetail(null);
              }}
              className="text-xs text-sky-600 hover:underline"
            >
              ← {L.backToResults}
            </button>
            {detail.sourceUrl && (
              <a
                href={detail.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs rounded-md border border-slate-200 px-2.5 py-1 text-sky-600 hover:bg-slate-50"
              >
                {L.openSearchEntry} ↗
              </a>
            )}
          </div>
          <h2 className="text-lg font-semibold text-slate-900">{detail.title}</h2>
          {(detail.fromSearchFallback || detail.apiError) && (
            <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
              {L.detailFallback}
              {detail.apiError && <div className="mt-1 text-amber-700">{detail.apiError}</div>}
            </div>
          )}
          {Object.keys(detail.metadata).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(detail.metadata).slice(0, 12).map(([key, value]) => (
                <span key={key} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                  {key}: {Array.isArray(value) ? value.join("、") : String(value)}
                </span>
              ))}
            </div>
          )}
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50 p-4">
            {detail.content ? (
              <KnowhowMarkdown content={detail.content} />
            ) : (
              <p className="text-sm text-slate-500">{L.noContent}</p>
            )}
          </div>
        </div>
      )}

      {!selectedHit && hits.length > 0 && (
        <div className="space-y-3">
          {hits.map((hit) => {
            const searchEntryUrl = searchEntryUrlFor(hit);
            return (
              <div key={hit.documentId} className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{hit.title}</div>
                    {hit.score != null && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        {L.score}: {hit.score.toFixed(3)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {searchEntryUrl && (
                      <a
                        href={searchEntryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs rounded-md border border-slate-200 px-2.5 py-1 text-slate-600 hover:border-slate-300 hover:text-sky-600"
                      >
                        {L.openSearchEntry}
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => openDetail(hit)}
                      className="text-xs rounded-md border border-slate-200 px-2.5 py-1 text-sky-600 hover:bg-slate-50"
                    >
                      {L.viewDetail}
                    </button>
                  </div>
                </div>
                {hit.content && (
                  <div className="mt-2 max-h-32 overflow-hidden">
                    <KnowhowMarkdown content={hit.content} className="text-slate-600 [&_*]:my-1" />
                  </div>
                )}
                {Object.keys(hit.metadata).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {Object.entries(hit.metadata).slice(0, 6).map(([key, value]) => (
                      <span key={key} className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
                        {key}: {Array.isArray(value) ? value.join("、") : String(value)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!selectedHit && !pending && hits.length === 0 && query.trim() && !error && (
        <div className="text-center text-sm text-slate-400 py-10">{L.noResults}</div>
      )}
    </div>
  );
}
