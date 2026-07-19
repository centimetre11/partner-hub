"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { useMessages } from "@/lib/i18n/context";
import type { MossCompanyHit } from "@/lib/moss";
import type { MossDossier, MossRiskLevel } from "@/lib/moss-dossier";
import {
  addMossTimelineAction,
  fetchMossDossierAction,
  resolveMossEntityAction,
  saveMossToCustomerAction,
  testMossConnectionAction,
} from "@/lib/moss-actions";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

function riskTone(level: MossRiskLevel): "green" | "amber" | "red" {
  if (level === "alert") return "red";
  if (level === "watch") return "amber";
  return "green";
}

function sectionStatusLabel(
  status: string,
  L: ReturnType<typeof useMessages>["moss"]["dossier"],
): string {
  if (status === "empty") return L.sectionEmpty;
  if (status === "error") return L.sectionError;
  if (status === "unavailable") return L.sectionUnavailable;
  return L.sectionOk;
}

type Props = {
  entityName: string;
  creditCode?: string | null;
  customerId?: string;
  initialDossier?: MossDossier | null;
  mossSyncedAt?: string | null;
  configured?: boolean;
  showSearch?: boolean;
  showTestConnection?: boolean;
  compact?: boolean;
};

export function MossDossierPanel({
  entityName,
  creditCode: initialCreditCode,
  customerId,
  initialDossier,
  mossSyncedAt,
  configured = true,
  showSearch = true,
  showTestConnection = false,
  compact = false,
}: Props) {
  const m = useMessages();
  const L = m.moss;
  const D = L.dossier;

  const [keyword, setKeyword] = useState(entityName);
  const [creditCode, setCreditCode] = useState(initialCreditCode ?? "");
  const [companyName, setCompanyName] = useState(entityName);
  const [hits, setHits] = useState<MossCompanyHit[]>([]);
  const [dossier, setDossier] = useState<MossDossier | null>(initialDossier ?? null);
  const [syncedAt, setSyncedAt] = useState(mossSyncedAt ?? null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const loadDossier = useCallback(
    (code: string, name: string) => {
      startTransition(async () => {
        setError(null);
        setMessage(null);
        const res = await fetchMossDossierAction({ creditCode: code, companyName: name });
        if (res.error) {
          setError(res.error);
          return;
        }
        setDossier(res.dossier ?? null);
        setCreditCode(code);
        setCompanyName(name);
        setSyncedAt(new Date().toISOString());
      });
    },
    [],
  );

  useEffect(() => {
    setKeyword(entityName);
    setCompanyName(entityName);
    if (initialCreditCode) setCreditCode(initialCreditCode);
    if (initialDossier) setDossier(initialDossier);
    if (mossSyncedAt) setSyncedAt(mossSyncedAt);
  }, [entityName, initialCreditCode, initialDossier, mossSyncedAt]);

  useEffect(() => {
    if (!configured || dossier || pending || hits.length > 0) return;
    if (creditCode) loadDossier(creditCode, companyName || entityName);
  }, [configured, creditCode, companyName, entityName, dossier, pending, hits.length, loadDossier]);

  if (!configured) {
    return (
      <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-4 text-sm text-amber-900">
        {L.notConfigured}
      </div>
    );
  }

  function searchEntity() {
    startTransition(async () => {
      setError(null);
      setHint(null);
      setHits([]);
      const res = await resolveMossEntityAction({ name: keyword });
      if (res.error) {
        setError(res.error);
        return;
      }
      setHits(res.hits ?? []);
      if (res.hint) setHint(res.hint);
      if (res.hits?.length === 1 && res.hits[0].creditCode) {
        selectHit(res.hits[0]);
      }
    });
  }

  function selectHit(hit: MossCompanyHit) {
    if (!hit.creditCode) {
      setError(L.needCreditCode);
      return;
    }
    setHits([]);
    loadDossier(hit.creditCode, hit.name);
  }

  function saveToCustomer() {
    if (!customerId || !dossier || !creditCode) return;
    startTransition(async () => {
      setError(null);
      const res = await saveMossToCustomerAction({
        customerId,
        creditCode,
        companyName,
        dossier,
      });
      if (res.error) setError(res.error);
      else setMessage(D.savedToCustomer);
    });
  }

  function writeTimeline() {
    if (!customerId || !dossier) return;
    startTransition(async () => {
      setError(null);
      const res = await addMossTimelineAction({ customerId, dossier });
      if (res.error) setError(res.error);
      else setMessage(D.wroteTimeline);
    });
  }

  function testConn() {
    startTransition(async () => {
      setError(null);
      const res = await testMossConnectionAction();
      if (res.error) setError(res.error);
      else setMessage(res.message ?? L.connected);
    });
  }

  return (
    <div className="space-y-4">
      {showSearch && !dossier ? (
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-[14rem] flex-1 space-y-1">
              <span className="text-xs text-slate-500">{L.query}</span>
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") searchEntity();
                }}
                placeholder={L.queryPlaceholder}
                className={input}
              />
            </label>
            <button
              type="button"
              disabled={pending || !keyword.trim()}
              onClick={searchEntity}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-40"
            >
              {pending ? L.searching : D.resolveEntity}
            </button>
            {showTestConnection ? (
              <button
                type="button"
                disabled={pending}
                onClick={testConn}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"
              >
                {L.testConnection}
              </button>
            ) : null}
          </div>
          <p className="text-xs text-slate-500">{L.capabilities}</p>
        </div>
      ) : null}

      {creditCode && dossier ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">{companyName}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {D.creditCodeLabel}: {creditCode}
              {syncedAt ? ` · ${D.syncedAt} ${new Date(syncedAt).toLocaleString()}` : ""}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={riskTone(dossier.riskLevel)}>{D.riskLevel[dossier.riskLevel]}</Badge>
            <button
              type="button"
              disabled={pending}
              onClick={() => loadDossier(creditCode, companyName)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300"
            >
              {D.refresh}
            </button>
            {showSearch ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setDossier(null);
                  setHits([]);
                  setCreditCode("");
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600"
              >
                {D.changeEntity}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {hint ? (
        <div className="rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">{hint}</div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-red-100 bg-red-50/70 px-3 py-2 text-xs text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800">
          {message}
        </div>
      ) : null}

      {hits.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-600">{D.pickEntity}</div>
          {hits.map((hit, idx) => (
            <button
              key={`${hit.creditCode || hit.name}-${idx}`}
              type="button"
              onClick={() => selectHit(hit)}
              className="w-full rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-left shadow-sm hover:border-sky-200"
            >
              <div className="text-sm font-medium text-slate-900">{hit.name}</div>
              <div className="mt-1 text-xs text-slate-500">{hit.creditCode || L.needCreditCode}</div>
              {hit.address ? <div className="mt-1 text-xs text-slate-400 line-clamp-1">{hit.address}</div> : null}
            </button>
          ))}
        </div>
      ) : null}

      {pending && !dossier ? <p className="text-sm text-slate-400">{D.loading}</p> : null}

      {dossier ? (
        <div className={`grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"}`}>
          <DossierCard title={D.profileTitle}>
            {dossier.profile.status !== "ok" ? (
              <p className="text-xs text-slate-500">
                {sectionStatusLabel(dossier.profile.status, D)}
                {dossier.profile.error ? `：${dossier.profile.error}` : ""}
              </p>
            ) : (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {[
                  [D.legalPerson, dossier.profile.legalPerson],
                  [D.regStatus, dossier.profile.regStatus],
                  [D.address, dossier.profile.address],
                  [D.industry, dossier.profile.industry],
                  [D.scale, dossier.profile.scale],
                  [D.establishDate, dossier.profile.establishDate],
                ]
                  .filter(([, v]) => v)
                  .map(([label, value]) => (
                    <div key={String(label)}>
                      <dt className="text-slate-400">{label}</dt>
                      <dd className="text-slate-800 mt-0.5">{value}</dd>
                    </div>
                  ))}
              </dl>
            )}
            {dossier.profile.keywords?.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {dossier.profile.keywords.map((k) => (
                  <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                    {k}
                  </span>
                ))}
              </div>
            ) : null}
            {dossier.profile.highlights?.map((h) => (
              <p key={h} className="mt-2 text-xs text-slate-600 leading-relaxed">
                {h}
              </p>
            ))}
          </DossierCard>

          <DossierCard title={D.riskTitle}>
            <div className="space-y-2">
              {dossier.risks.map((r) => (
                <div key={r.tool} className="flex items-start justify-between gap-2 text-xs">
                  <span className="text-slate-700">{r.label}</span>
                  <span className="text-right text-slate-500 shrink-0 max-w-[55%]">
                    {r.status === "ok" && r.count > 0 ? (
                      <span className="text-red-600 font-medium">
                        {r.count} {D.hits}
                        {r.summary ? ` · ${r.summary}` : ""}
                      </span>
                    ) : r.status === "empty" ? (
                      <span className="text-emerald-600">{D.noHits}</span>
                    ) : (
                      <span className="text-slate-400">{r.error || sectionStatusLabel(r.status, D)}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {dossier.riskTriggers.length ? (
              <ul className="mt-3 list-disc pl-4 text-xs text-red-700 space-y-1">
                {dossier.riskTriggers.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-slate-500">{D.riskEmptyHint}</p>
            )}
          </DossierCard>

          <DossierCard title={D.opinionTitle} className={compact ? "" : "lg:col-span-2"}>
            {dossier.opinion.status === "ok" && dossier.opinion.items.length ? (
              <ul className="space-y-2">
                {dossier.opinion.items.map((item, idx) => (
                  <li key={`${item.title}-${idx}`} className="text-xs border-b border-slate-50 pb-2 last:border-0">
                    <div className="text-slate-800">{item.title || "—"}</div>
                    <div className="text-slate-400 mt-0.5">
                      {[item.sentiment, item.date, item.source].filter(Boolean).join(" · ")}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">
                {dossier.opinion.error || sectionStatusLabel(dossier.opinion.status, D)}
              </p>
            )}
          </DossierCard>
        </div>
      ) : null}

      {dossier && customerId ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={pending}
            onClick={saveToCustomer}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {D.saveToCustomer}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={writeTimeline}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:border-slate-300 disabled:opacity-40"
          >
            {D.writeTimeline}
          </button>
        </div>
      ) : null}

      {creditCode && !dossier && !pending && !hits.length && showSearch ? (
        <button
          type="button"
          onClick={() => loadDossier(creditCode, companyName)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
        >
          {D.loadExisting}
        </button>
      ) : null}
    </div>
  );
}

function DossierCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm ${className}`}>
      <div className="text-xs font-semibold text-slate-700 mb-3">{title}</div>
      {children}
    </div>
  );
}

export function MossRiskBadge({
  level,
  onClick,
  label,
}: {
  level: MossRiskLevel | null | undefined;
  onClick?: () => void;
  label: string;
}) {
  if (!level) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500 hover:border-sky-200"
      >
        Moss
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] hover:border-sky-200"
    >
      <Badge tone={riskTone(level)}>{label}</Badge>
    </button>
  );
}
