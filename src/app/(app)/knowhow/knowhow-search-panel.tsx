"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { searchKnowhowAction, getKnowhowDocumentAction } from "@/lib/knowhow-actions";
import type { KnowhowSearchHit } from "@/lib/knowhow";

const input =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

type Props = {
  configured: boolean;
  isAdmin: boolean;
  labels: {
    query: string;
    queryPlaceholder: string;
    search: string;
    filters: string;
    businessDomain: string;
    project: string;
    contract: string;
    tags: string;
    tagsPlaceholder: string;
    quality: string;
    qualityPlaceholder: string;
    nodePath: string;
    nodePathPlaceholder: string;
    industry: string;
    industryPlaceholder: string;
    topK: string;
    notConfigured: string;
    notConfiguredAdmin: string;
    noResults: string;
    score: string;
    viewDetail: string;
    backToResults: string;
    searching: string;
  };
};

export function KnowhowSearchPanel({ configured, isAdmin, labels }: Props) {
  const [query, setQuery] = useState("");
  const [businessDomain, setBusinessDomain] = useState<"project" | "contract">("project");
  const [tags, setTags] = useState("");
  const [quality, setQuality] = useState("");
  const [nodePath, setNodePath] = useState("");
  const [industry, setIndustry] = useState("");
  const [topK, setTopK] = useState(20);
  const [showFilters, setShowFilters] = useState(false);
  const [hits, setHits] = useState<KnowhowSearchHit[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ title: string; content: string; metadata: Record<string, unknown> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function search() {
    startTransition(async () => {
      setError(null);
      setSelectedId(null);
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

  function openDetail(documentId: string) {
    startTransition(async () => {
      setError(null);
      setSelectedId(documentId);
      const res = await getKnowhowDocumentAction(documentId);
      if (res.error) {
        setError(res.error);
        setDetail(null);
        return;
      }
      if (res.doc) {
        setDetail({
          title: res.doc.title,
          content: res.doc.content,
          metadata: res.doc.metadata,
        });
      }
    });
  }

  if (!configured) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
        {isAdmin ? (
          <>
            {labels.notConfiguredAdmin}{" "}
            <Link href="/settings" className="underline font-medium">
              团队设置
            </Link>
          </>
        ) : (
          labels.notConfigured
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
        <label className="block space-y-1">
          <span className="text-xs text-zinc-500">{labels.query}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && query.trim() && search()}
            placeholder={labels.queryPlaceholder}
            className={input}
          />
        </label>

        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="text-xs text-indigo-600 hover:underline"
        >
          {showFilters ? "收起筛选" : labels.filters}
        </button>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">{labels.businessDomain}</span>
              <select
                value={businessDomain}
                onChange={(e) => setBusinessDomain(e.target.value as "project" | "contract")}
                className={input}
              >
                <option value="project">{labels.project}</option>
                <option value="contract">{labels.contract}</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">{labels.topK}</span>
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
              <span className="text-xs text-zinc-500">{labels.tags}</span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={labels.tagsPlaceholder} className={input} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">{labels.quality}</span>
              <input value={quality} onChange={(e) => setQuality(e.target.value)} placeholder={labels.qualityPlaceholder} className={input} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">{labels.nodePath}</span>
              <input value={nodePath} onChange={(e) => setNodePath(e.target.value)} placeholder={labels.nodePathPlaceholder} className={input} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">{labels.industry}</span>
              <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder={labels.industryPlaceholder} className={input} />
            </label>
          </div>
        )}

        <button
          type="button"
          disabled={pending || !query.trim()}
          onClick={search}
          className="rounded-lg bg-indigo-600 text-white px-5 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-40"
        >
          {pending ? labels.searching : labels.search}
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 text-red-700 text-sm px-4 py-3 whitespace-pre-wrap">{error}</div>}

      {selectedId && detail && (
        <div className="rounded-xl border border-indigo-200 bg-white p-5 space-y-3">
          <button type="button" onClick={() => { setSelectedId(null); setDetail(null); }} className="text-xs text-indigo-600 hover:underline">
            ← {labels.backToResults}
          </button>
          <h2 className="text-lg font-semibold text-zinc-900">{detail.title}</h2>
          {Object.keys(detail.metadata).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(detail.metadata).slice(0, 8).map(([key, value]) => (
                <span key={key} className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600">
                  {key}: {Array.isArray(value) ? value.join("、") : String(value)}
                </span>
              ))}
            </div>
          )}
          <div className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">{detail.content || "（暂无正文）"}</div>
        </div>
      )}

      {!selectedId && hits.length > 0 && (
        <div className="space-y-3">
          {hits.map((hit) => (
            <div key={hit.documentId} className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-zinc-900">{hit.title}</div>
                  {hit.score != null && (
                    <div className="text-xs text-zinc-400 mt-0.5">
                      {labels.score}: {hit.score.toFixed(3)}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => openDetail(hit.documentId)}
                  className="shrink-0 text-xs rounded-md border border-indigo-200 px-2.5 py-1 text-indigo-600 hover:bg-indigo-50"
                >
                  {labels.viewDetail}
                </button>
              </div>
              {hit.content && (
                <p className="text-sm text-zinc-600 mt-2 line-clamp-4 whitespace-pre-wrap">{hit.content}</p>
              )}
              {Object.keys(hit.metadata).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {Object.entries(hit.metadata).slice(0, 6).map(([key, value]) => (
                    <span key={key} className="rounded-full bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-500">
                      {key}: {Array.isArray(value) ? value.join("、") : String(value)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!selectedId && !pending && hits.length === 0 && query.trim() && !error && (
        <div className="text-center text-sm text-zinc-400 py-10">{labels.noResults}</div>
      )}
    </div>
  );
}
