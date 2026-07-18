"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  fetchMossInsightAction,
  searchMossCompaniesAction,
  testMossConnectionAction,
} from "@/lib/moss-actions";
import type { MossCompanyHit } from "@/lib/moss";
import { useMessages } from "@/lib/i18n/context";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

type Props = {
  configured: boolean;
  isAdmin: boolean;
};

export function MossPanel({ configured, isAdmin }: Props) {
  const m = useMessages();
  const L = m.moss;

  const [keyword, setKeyword] = useState("");
  const [hits, setHits] = useState<MossCompanyHit[]>([]);
  const [rawText, setRawText] = useState<string | null>(null);
  const [selected, setSelected] = useState<MossCompanyHit | null>(null);
  const [insightText, setInsightText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [connMsg, setConnMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!configured) {
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-5 text-sm text-amber-900">
        <p>{isAdmin ? L.notConfiguredAdmin : L.notConfigured}</p>
        {isAdmin && (
          <p className="mt-2 text-xs text-amber-800/80">
            {L.envHint}{" "}
            <code className="rounded bg-white/80 px-1.5 py-0.5 text-[11px]">MOSS_MCP_TOKEN</code>
          </p>
        )}
      </div>
    );
  }

  function testConn() {
    startTransition(async () => {
      setError(null);
      setConnMsg(null);
      const res = await testMossConnectionAction();
      if (res.error) setError(res.error);
      else setConnMsg(res.message ?? L.connected);
    });
  }

  function search() {
    startTransition(async () => {
      setError(null);
      setHint(null);
      setSelected(null);
      setInsightText(null);
      setRawText(null);
      const res = await searchMossCompaniesAction({ keyword });
      if (res.error) {
        setError(res.error);
        setHits([]);
        return;
      }
      setHits(res.hits ?? []);
      setRawText(res.text || null);
      if (res.hint) setHint(res.hint);
    });
  }

  function openInsight(hit: MossCompanyHit) {
    startTransition(async () => {
      setError(null);
      setSelected(hit);
      setInsightText(null);
      if (!hit.creditCode) {
        setError(L.needCreditCode);
        setInsightText(null);
        return;
      }
      const res = await fetchMossInsightAction({
        creditCode: hit.creditCode,
        companyName: hit.name,
      });
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      if ("summary" in res && res.summary) {
        setInsightText(res.summary);
        return;
      }
      const sections = "sections" in res ? res.sections ?? [] : [];
      const errors = "errors" in res ? res.errors ?? [] : [];
      const parts = [
        ...sections.map(
          (s) => `### ${s.tool}\n${s.text || JSON.stringify(s.data, null, 2) || "（无内容）"}`,
        ),
        ...errors.map((e) => `### ${e.tool}\n⚠ ${e.error}`),
      ];
      setInsightText(parts.join("\n\n") || L.noInsight);
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[16rem] flex-1 space-y-1">
            <span className="text-xs text-slate-500">{L.query}</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") search();
              }}
              placeholder={L.queryPlaceholder}
              className={input}
            />
          </label>
          <button
            type="button"
            disabled={pending || !keyword.trim()}
            onClick={search}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {pending ? L.searching : L.search}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={testConn}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:border-slate-300"
          >
            {L.testConnection}
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">{L.capabilities}</p>
      </div>

      {connMsg && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800">
          {connMsg}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50/70 px-3 py-2 text-xs text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      )}
      {hint && !error && (
        <div className="rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
          {hint}
        </div>
      )}

      {selected ? (
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{selected.name}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {[selected.creditCode, selected.legalPerson, selected.status].filter(Boolean).join(" · ") ||
                  L.insightTitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setInsightText(null);
              }}
              className="text-xs text-sky-600 hover:underline"
            >
              {L.backToResults}
            </button>
          </div>
          {pending && !insightText ? (
            <p className="text-sm text-slate-400">{L.loadingInsight}</p>
          ) : (
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
              {insightText || L.noInsight}
            </pre>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {hits.map((hit, idx) => (
            <button
              key={`${hit.companyId || hit.creditCode || hit.name}-${idx}`}
              type="button"
              onClick={() => openInsight(hit)}
              className="w-full rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-left shadow-sm transition hover:border-slate-300"
            >
              <div className="text-sm font-medium text-slate-900">{hit.name}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                {hit.creditCode && <span>{hit.creditCode}</span>}
                {hit.legalPerson && <span>{hit.legalPerson}</span>}
                {hit.status && <span>{hit.status}</span>}
                {hit.registeredCapital && <span>{hit.registeredCapital}</span>}
                {hit.establishDate && <span>{hit.establishDate}</span>}
              </div>
              {hit.address && <div className="mt-1 text-xs text-slate-400 line-clamp-1">{hit.address}</div>}
              <div className="mt-2 text-xs text-sky-600">{L.viewInsight} →</div>
            </button>
          ))}
          {!pending && !hits.length && rawText && (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              {rawText}
            </pre>
          )}
          {!pending && !hits.length && !rawText && keyword && !error && (
            <p className="py-8 text-center text-sm text-slate-400">{L.noResults}</p>
          )}
        </div>
      )}

      <p className="text-xs text-slate-400">
        {L.skillHint}{" "}
        <Link href="/skills" className="text-sky-600 hover:underline">
          {m.nav.aiHub}
        </Link>
      </p>
    </div>
  );
}
