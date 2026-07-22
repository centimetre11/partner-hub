"use client";

import { useEffect, useState, useTransition } from "react";
import { useMessages } from "@/lib/i18n/context";
import {
  getCrmMcpImportStatusAction,
  pickCrmContractDraftAction,
  pickCrmOpportunityDraftAction,
  pickCrmProjectDraftAction,
  searchCrmContractsAction,
  searchCrmOpportunitiesAction,
  searchCrmProjectsAction,
  type CrmImportKind,
} from "@/lib/crm-mcp-actions";
import type {
  CrmContractDraft,
  CrmContractHit,
  CrmOpportunityDraft,
  CrmOpportunityHit,
  CrmProjectDraft,
  CrmProjectHit,
} from "@/lib/crm-mcp-map";

type Hit = CrmOpportunityHit | CrmContractHit | CrmProjectHit;

export type CrmImportResult =
  | { kind: "opportunity"; draft: CrmOpportunityDraft; localCustomerId: string | null }
  | { kind: "contract"; draft: CrmContractDraft; localCustomerId: string | null }
  | { kind: "project"; draft: CrmProjectDraft; localCustomerId: string | null };

export function CrmImportPicker({
  kind,
  crmCustomerId,
  customerNameHint,
  onPicked,
  className,
  compact,
}: {
  kind: CrmImportKind;
  /** 必须已绑定 CRM 客户；未绑定不渲染入口 */
  crmCustomerId?: string | null;
  customerNameHint?: string | null;
  onPicked: (result: CrmImportResult) => void;
  className?: string;
  compact?: boolean;
}) {
  const m = useMessages();
  const t = m.crm.importFromCrm;
  const boundId = crmCustomerId?.trim() || "";
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Hit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [picking, startPick] = useTransition();

  useEffect(() => {
    if (!boundId) return;
    void getCrmMcpImportStatusAction().then((s) => setConfigured(s.configured));
  }, [boundId]);

  // 未绑定 CRM：不提供入口
  if (!boundId) return null;

  function close() {
    setOpen(false);
    setQuery("");
    setItems([]);
    setError(null);
  }

  function runSearch(q: string) {
    setError(null);
    startSearch(async () => {
      const input = { crmCustomerId: boundId, query: q, limit: 20 };
      const res =
        kind === "opportunity"
          ? await searchCrmOpportunitiesAction(input)
          : kind === "contract"
            ? await searchCrmContractsAction(input)
            : await searchCrmProjectsAction(input);
      if (res.error) setError(res.error);
      setItems(res.items);
    });
  }

  function openDialog() {
    setOpen(true);
    setError(null);
    runSearch("");
  }

  function pick(item: Hit) {
    setError(null);
    startPick(async () => {
      try {
        if (kind === "opportunity") {
          const { draft, localCustomerId } = await pickCrmOpportunityDraftAction(
            item as CrmOpportunityHit,
          );
          onPicked({ kind, draft, localCustomerId });
        } else if (kind === "contract") {
          const { draft, localCustomerId } = await pickCrmContractDraftAction(item as CrmContractHit);
          onPicked({ kind, draft, localCustomerId });
        } else {
          const { draft, localCustomerId } = await pickCrmProjectDraftAction(item as CrmProjectHit);
          onPicked({ kind, draft, localCustomerId });
        }
        close();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  const title =
    kind === "opportunity" ? t.titleOpportunity : kind === "contract" ? t.titleContract : t.titleProject;
  const placeholder =
    kind === "opportunity"
      ? t.searchOpportunity
      : kind === "contract"
        ? t.searchContract
        : t.searchProject;

  const btnClass = compact
    ? "rounded-md border border-sky-200 bg-sky-50/60 text-sky-700 px-2.5 py-1 text-xs font-medium hover:bg-sky-50 disabled:opacity-50"
    : "rounded-lg border border-sky-200 bg-sky-50/60 text-sky-700 px-3 py-2 text-sm font-medium hover:bg-sky-50 disabled:opacity-50";

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={configured === false}
        title={configured === false ? t.notConfigured : undefined}
        className={`${btnClass} ${className ?? ""}`}
      >
        {t.button}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
          onClick={close}
        >
          <div
            className="bg-white rounded-lg w-full border border-slate-200 max-w-lg p-5 max-h-[85vh] overflow-y-auto shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-slate-900">{title}</h3>
              <button
                type="button"
                onClick={close}
                className="text-slate-400 hover:text-slate-600 text-sm px-2"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-3">
              {t.boundCustomerHint.replace("{id}", boundId)}
              {customerNameHint ? ` · ${customerNameHint}` : ""}
            </p>

            <div className="flex gap-2 mb-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runSearch(query);
                  }
                }}
                placeholder={placeholder}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <button
                type="button"
                onClick={() => runSearch(query)}
                disabled={searching}
                className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm disabled:opacity-50"
              >
                {searching ? t.searching : t.search}
              </button>
            </div>

            {error && <div className="text-xs text-rose-600 mb-2">{error}</div>}

            <ul className="space-y-1.5">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={picking}
                    onClick={() => pick(item)}
                    className="w-full text-left rounded-lg border border-slate-100 hover:border-sky-200 hover:bg-sky-50/40 px-3 py-2.5 disabled:opacity-50"
                  >
                    <div className="text-sm font-medium text-slate-900 truncate">{item.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {item.subtitle || item.id}
                    </div>
                  </button>
                </li>
              ))}
              {!searching && !error && items.length === 0 && (
                <li className="text-xs text-slate-400 py-4 text-center leading-relaxed px-2">
                  {kind === "contract" ? t.emptyContract : t.empty}
                </li>
              )}
            </ul>

            {picking && <div className="text-xs text-slate-500 mt-2">{t.applying}</div>}
          </div>
        </div>
      )}
    </>
  );
}
