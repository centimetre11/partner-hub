"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "@/lib/i18n/context";
import { buildCrmCustomerViewUrl } from "@/lib/crm";
import type { CrmCustomerOption } from "@/components/crm-customer-picker";
import {
  createCustomerFromCrmAction,
  createPartnerFromCrmAction,
  findEntitiesByCrmCustomerAction,
  getCrmCustomerDetailAction,
  type CrmCustomerDetail,
  type CrmDupMatch,
} from "@/lib/crm-create";
import { AiIntakePanel } from "@/components/ai-intake-panel";

type Entity = "partner" | "customer";
type Dups = { partners: CrmDupMatch[]; customers: CrmDupMatch[] };

function metaLine(c: Pick<CrmCustomerOption, "city" | "status" | "salesman" | "presales">) {
  return [c.city, c.status, c.salesman, c.presales].filter(Boolean).join(" · ");
}

export function CreateFromCrmButton({
  entity,
  parentId,
}: {
  entity: Entity;
  /** When creating a partner under a Distributor. */
  parentId?: string;
}) {
  const router = useRouter();
  const { crm } = useMessages();
  const t = crm.createFromCrm;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CrmCustomerOption[]>([]);
  const [searching, setSearching] = useState(false);

  const [selected, setSelected] = useState<CrmCustomerOption | null>(null);
  const [detail, setDetail] = useState<CrmCustomerDetail | null>(null);
  const [dups, setDups] = useState<Dups | null>(null);
  const [loadingDetail, startDetail] = useTransition();

  const [creating, startCreate] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const title = entity === "partner" ? t.titlePartner : t.titleCustomer;
  const detailPath = (id: string) => (entity === "partner" ? `/partners/${id}` : `/customers/${id}`);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/crm/customers?q=${encodeURIComponent(query.trim())}&limit=15`);
        const data = (await res.json()) as { customers?: CrmCustomerOption[] };
        setResults(data.customers ?? []);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  function reset() {
    setQuery("");
    setResults([]);
    setSelected(null);
    setDetail(null);
    setDups(null);
    setError(null);
    setAiOpen(false);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function pick(c: CrmCustomerOption) {
    setSelected(c);
    setError(null);
    setResults([]);
    setQuery("");
    startDetail(async () => {
      const [d, dup] = await Promise.all([
        getCrmCustomerDetailAction(c.id),
        findEntitiesByCrmCustomerAction(c.id, c.name),
      ]);
      setDetail(d);
      setDups(dup);
    });
  }

  function directCreate() {
    if (!selected) return;
    setError(null);
    startCreate(async () => {
      const res =
        entity === "partner"
          ? await createPartnerFromCrmAction(selected.id, parentId ? { parentId } : undefined)
          : await createCustomerFromCrmAction(selected.id);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      close();
      router.push(detailPath(res.id));
    });
  }

  const dupList: (CrmDupMatch & { kind: Entity })[] = dups
    ? [
        ...dups.partners.map((d) => ({ ...d, kind: "partner" as const })),
        ...dups.customers.map((d) => ({ ...d, kind: "customer" as const })),
      ]
    : [];

  const input =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-sky-200 bg-sky-50/60 text-sky-700 px-4 py-2 text-sm font-medium hover:bg-sky-50"
      >
        {t.button}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={close}
        >
          <div
            className="bg-white rounded-lg w-full border border-slate-200 max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">{title}</h3>
              <button
                type="button"
                onClick={close}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            {!selected ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">{t.searchStep}</p>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={crm.searchPlaceholder}
                  className={input}
                />
                {searching && <div className="text-xs text-slate-400">{crm.searching}</div>}
                {results.length > 0 && (
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-50">
                    {results.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => pick(c)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50"
                      >
                        <div className="font-medium text-slate-800">{c.name}</div>
                        <div className="text-slate-500 mt-0.5">{metaLine(c)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-900">
                  <div className="text-[11px] text-emerald-700/80">{t.selected}</div>
                  <div className="font-medium mt-0.5">{selected.name}</div>
                  <div className="text-emerald-700/70 mt-1 space-y-0.5">
                    {selected.city && <div>{t.fieldCity}：{selected.city}</div>}
                    {selected.status && <div>{t.fieldStatus}：{selected.status}</div>}
                    {selected.salesman && <div>{t.fieldSalesman}：{selected.salesman}</div>}
                    {selected.presales && <div>{t.fieldPresales}：{selected.presales}</div>}
                    {detail?.contact?.name && (
                      <div>
                        {t.fieldContact}：{detail.contact.name}
                        {detail.contact.duty ? `（${detail.contact.duty}）` : ""}
                      </div>
                    )}
                  </div>
                  <a
                    href={buildCrmCustomerViewUrl(selected.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 text-sky-700 hover:underline"
                  >
                    {selected.id} ↗
                  </a>
                </div>

                {loadingDetail ? (
                  <div className="text-xs text-slate-400">{t.checking}</div>
                ) : (
                  <>
                    {dupList.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-xs text-amber-900">
                        <div className="font-medium">{t.dupTitle}</div>
                        <p className="text-amber-800/80 mt-1">{t.dupHint}</p>
                        <div className="mt-2 space-y-1.5">
                          {dupList.map((d) => (
                            <div
                              key={`${d.kind}-${d.id}`}
                              className="flex items-center justify-between gap-2 rounded-md bg-white/70 px-2 py-1.5"
                            >
                              <div className="min-w-0">
                                <span className="font-medium text-slate-800">{d.name}</span>
                                <span className="ml-1.5 text-[10px] text-slate-500">
                                  {d.kind === "partner" ? "伙伴" : "客户"} ·{" "}
                                  {d.matchBy === "crmId" ? t.dupByCrmId : t.dupByName}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  close();
                                  router.push(
                                    d.kind === "partner" ? `/partners/${d.id}` : `/customers/${d.id}`,
                                  );
                                }}
                                className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:border-slate-300"
                              >
                                {t.openExisting}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-slate-600">{t.chooseTitle}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={creating}
                          onClick={directCreate}
                          className="rounded-lg bg-slate-900 text-white px-3 py-2.5 text-sm text-left hover:bg-slate-800 disabled:opacity-50"
                        >
                          <div className="font-medium">{creating ? t.creating : t.directCreate}</div>
                          <div className="text-[11px] text-slate-300 mt-0.5">{t.directCreateHint}</div>
                        </button>
                        <button
                          type="button"
                          disabled={creating || !detail}
                          onClick={() => setAiOpen(true)}
                          className="rounded-lg border border-purple-200 bg-purple-50/60 text-purple-800 px-3 py-2.5 text-sm text-left hover:bg-purple-50 disabled:opacity-50"
                        >
                          <div className="font-medium">✦ {t.aiCreate}</div>
                          <div className="text-[11px] text-purple-600/80 mt-0.5">{t.aiCreateHint}</div>
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelected(null);
                        setDetail(null);
                        setDups(null);
                        setError(null);
                      }}
                      className="text-xs text-slate-500 hover:text-slate-700"
                    >
                      ← {t.back}
                    </button>
                  </>
                )}

                {error && (
                  <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {aiOpen && detail && (
        <AiIntakePanel
          scope={entity === "partner" ? "new_partner" : "new_customer"}
          intent={entity === "partner" ? "active" : undefined}
          parentId={entity === "partner" ? parentId : undefined}
          seedMessage={detail.seedText}
          autoStart
          onClose={() => setAiOpen(false)}
          onDone={(id) => {
            close();
            if (id) router.push(detailPath(id));
            else router.refresh();
          }}
        />
      )}
    </>
  );
}
