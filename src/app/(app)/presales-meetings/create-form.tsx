"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createPresalesMeetingAction,
  recommendPresalesAgendaAction,
} from "@/lib/presales-meeting/actions";
import type { RecommendedAgendaItem } from "@/lib/presales-meeting/types";
import {
  subjectKeyFor,
  type AgendaSubjectInput,
  type AgendaSubjectKind,
} from "@/lib/presales-meeting/subject";
import { useMessages } from "@/lib/i18n/context";
import { formatMsg } from "@/lib/i18n/messages";
import {
  OwnedPortfolioPicker,
  type CustomerOpt,
  type OpportunityOpt,
  type PartnerCustomerLink,
  type PartnerOpt,
  type ProjectOpt,
} from "./owned-picker";

type UserOpt = { id: string; name: string; role: string };

type ManualRow = {
  key: string;
  customerId: string;
  /** "" = 仅客户；project:<id> | opportunity:<id> */
  linkKey: string;
};

type PersonBlock = {
  userId: string;
  /** recommended subjectKeys selected */
  selectedRecKeys: Set<string>;
  /** owned quick-pick subjectKeys: project:|opportunity:|partner:|customer: */
  ownedPicks: Set<string>;
  manual: ManualRow[];
};

function emptyBlock(userId: string): PersonBlock {
  return {
    userId,
    selectedRecKeys: new Set(),
    ownedPicks: new Set(),
    manual: [],
  };
}

function newManualRow(): ManualRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    customerId: "",
    linkKey: "",
  };
}

function defaultPresalesSelection(users: UserOpt[]): {
  selected: string[];
  blocks: Record<string, PersonBlock>;
} {
  const selected = users.filter((u) => u.role === "PRESALES").map((u) => u.id);
  const blocks: Record<string, PersonBlock> = {};
  for (const userId of selected) {
    blocks[userId] = emptyBlock(userId);
  }
  return { selected, blocks };
}

export function CreatePresalesMeetingForm({
  users,
  customers,
  projects,
  partners,
  opportunities,
  partnerLinks,
  onOpenChange,
}: {
  users: UserOpt[];
  customers: CustomerOpt[];
  projects: ProjectOpt[];
  partners: PartnerOpt[];
  opportunities: OpportunityOpt[];
  partnerLinks: PartnerCustomerLink[];
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useMessages().presalesMeeting;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [recommended, setRecommended] = useState<RecommendedAgendaItem[]>([]);
  const [recommendedAt, setRecommendedAt] = useState(false);
  const [blocks, setBlocks] = useState<Record<string, PersonBlock>>({});
  const [showAllAdd, setShowAllAdd] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const userName = useMemo(
    () => new Map(users.map((u) => [u.id, u.name])),
    [users],
  );

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  const projectsByCustomer = useMemo(() => {
    const map = new Map<string, ProjectOpt[]>();
    for (const p of projects) {
      const list = map.get(p.customerId) ?? [];
      list.push(p);
      map.set(p.customerId, list);
    }
    return map;
  }, [projects]);

  const oppsByCustomer = useMemo(() => {
    const map = new Map<string, OpportunityOpt[]>();
    for (const o of opportunities) {
      if (!o.customerId || ["WON", "LOST"].includes(o.status)) continue;
      const list = map.get(o.customerId) ?? [];
      list.push(o);
      map.set(o.customerId, list);
    }
    return map;
  }, [opportunities]);

  const recommendedByUser = useMemo(() => {
    const map = new Map<string, RecommendedAgendaItem[]>();
    for (const item of recommended) {
      const list = map.get(item.userId) ?? [];
      list.push(item);
      map.set(item.userId, list);
    }
    return map;
  }, [recommended]);

  function setCreating(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
    if (next) {
      const defaults = defaultPresalesSelection(users);
      setError(null);
      setRecommended([]);
      setRecommendedAt(false);
      setTitle("");
      setSelectedPeople(defaults.selected);
      setBlocks(defaults.blocks);
      setShowAllAdd({});
    } else {
      setError(null);
      setRecommended([]);
      setRecommendedAt(false);
      setBlocks({});
      setSelectedPeople([]);
      setTitle("");
      setShowAllAdd({});
    }
  }

  function togglePerson(id: string) {
    setSelectedPeople((prev) => {
      const on = prev.includes(id);
      const next = on ? prev.filter((x) => x !== id) : [...prev, id];
      setBlocks((blocksPrev) => {
        const copy = { ...blocksPrev };
        if (on) {
          delete copy[id];
        } else if (!copy[id]) {
          copy[id] = emptyBlock(id);
        }
        return copy;
      });
      return next;
    });
    setRecommendedAt(false);
    setRecommended([]);
  }

  function runRecommend() {
    void (async () => {
      if (!selectedPeople.length) {
        setError(t.needPeople);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const res = await recommendPresalesAgendaAction(selectedPeople);
        if (res.error) {
          setError(res.error);
          return;
        }
        const items = res.items ?? [];
        setRecommended(items);
        setRecommendedAt(true);
        setBlocks((prev) => {
          const next: Record<string, PersonBlock> = {};
          for (const userId of selectedPeople) {
            const existing = prev[userId];
            const forUser = items.filter((it) => it.userId === userId);
            next[userId] = {
              userId,
              selectedRecKeys: new Set(forUser.map((it) => it.subjectKey)),
              ownedPicks: existing?.ownedPicks ?? new Set(),
              manual: existing?.manual ?? [],
            };
          }
          return next;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    })();
  }

  function toggleRecommended(userId: string, subjectKey: string) {
    setBlocks((prev) => {
      const block = prev[userId] ?? emptyBlock(userId);
      const selected = new Set(block.selectedRecKeys);
      if (selected.has(subjectKey)) selected.delete(subjectKey);
      else selected.add(subjectKey);
      return { ...prev, [userId]: { ...block, selectedRecKeys: selected } };
    });
  }

  function toggleOwnedPick(userId: string, kind: AgendaSubjectKind, id: string) {
    const key = subjectKeyFor(kind, id);
    setBlocks((prev) => {
      const block = prev[userId] ?? emptyBlock(userId);
      const ownedPicks = new Set(block.ownedPicks);
      if (ownedPicks.has(key)) ownedPicks.delete(key);
      else ownedPicks.add(key);
      return { ...prev, [userId]: { ...block, ownedPicks } };
    });
  }

  function updateManual(userId: string, key: string, patch: Partial<ManualRow>) {
    setBlocks((prev) => {
      const block = prev[userId];
      if (!block) return prev;
      return {
        ...prev,
        [userId]: {
          ...block,
          manual: block.manual.map((r) => (r.key === key ? { ...r, ...patch } : r)),
        },
      };
    });
  }

  function collectItems(): AgendaSubjectInput[] {
    const out: AgendaSubjectInput[] = [];
    const seen = new Set<string>();
    const push = (item: AgendaSubjectInput) => {
      const id =
        item.kind === "PROJECT"
          ? item.projectId
          : item.kind === "OPPORTUNITY"
            ? item.opportunityId
            : item.kind === "CUSTOMER"
              ? item.customerId
              : item.partnerId;
      if (!id) return;
      const key = `${item.userId}|${subjectKeyFor(item.kind, id)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    };

    for (const userId of selectedPeople) {
      const block = blocks[userId];
      if (!block) continue;
      for (const rec of recommendedByUser.get(userId) ?? []) {
        if (!block.selectedRecKeys.has(rec.subjectKey)) continue;
        if (rec.kind === "PROJECT" && rec.projectId) {
          push({
            userId,
            kind: "PROJECT",
            customerId: rec.customerId,
            projectId: rec.projectId,
          });
        } else if (rec.kind === "OPPORTUNITY" && rec.opportunityId) {
          push({
            userId,
            kind: "OPPORTUNITY",
            customerId: rec.customerId,
            opportunityId: rec.opportunityId,
          });
        } else if (rec.kind === "CUSTOMER" && rec.customerId) {
          push({ userId, kind: "CUSTOMER", customerId: rec.customerId });
        }
      }
      for (const subjectKey of block.ownedPicks) {
        const [prefix, id] = subjectKey.split(":");
        if (!id) continue;
        if (prefix === "project") {
          const p = projectById.get(id);
          if (!p) continue;
          push({
            userId,
            kind: "PROJECT",
            customerId: p.customerId,
            projectId: p.id,
          });
        } else if (prefix === "opportunity") {
          push({ userId, kind: "OPPORTUNITY", opportunityId: id });
        } else if (prefix === "partner") {
          push({ userId, kind: "PARTNER", partnerId: id });
        } else if (prefix === "customer") {
          push({ userId, kind: "CUSTOMER", customerId: id });
        }
      }
      for (const row of block.manual) {
        if (!row.customerId) continue;
        if (!row.linkKey) {
          push({ userId, kind: "CUSTOMER", customerId: row.customerId });
          continue;
        }
        const [prefix, id] = row.linkKey.split(":");
        if (!id) continue;
        if (prefix === "project") {
          push({
            userId,
            kind: "PROJECT",
            customerId: row.customerId,
            projectId: id,
          });
        } else if (prefix === "opportunity") {
          push({
            userId,
            kind: "OPPORTUNITY",
            customerId: row.customerId,
            opportunityId: id,
          });
        }
      }
    }
    return out;
  }

  function confirmAndPull() {
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const items = collectItems();
        if (!items.length) {
          setError(t.needItem);
          return;
        }
        const res = await createPresalesMeetingAction({
          title: title.trim() || undefined,
          attendeeUserIds: selectedPeople,
          items,
        });
        if (res.error) {
          setError(res.error);
          return;
        }
        if (res.id) {
          setCreating(false);
          router.push(`/presales-meetings/${res.id}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    })();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800"
      >
        {t.create}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-5 shadow-sm max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{t.createTitle}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">{t.createFlowHint}</p>
        </div>
        <button
          type="button"
          className="text-xs text-slate-500 hover:text-slate-800"
          onClick={() => setCreating(false)}
        >
          {t.cancel}
        </button>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-slate-500">{t.meetingTitle}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.meetingTitlePh}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </label>

      <section className="space-y-2">
        <div className="text-xs font-medium text-slate-700">{t.pickPeople}</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-52 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50 p-2">
          {users.map((u) => {
            const checked = selectedPeople.includes(u.id);
            return (
              <label
                key={u.id}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer ${
                  checked ? "bg-sky-50 text-sky-900 ring-1 ring-sky-200" : "hover:bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePerson(u.id)}
                  className="rounded border-slate-300"
                />
                <span className="truncate">{u.name}</span>
              </label>
            );
          })}
        </div>
        <button
          type="button"
          disabled={busy || !selectedPeople.length}
          onClick={runRecommend}
          className="rounded-lg bg-sky-700 text-white px-3 py-1.5 text-sm hover:bg-sky-800 disabled:opacity-40"
        >
          {busy && !recommendedAt ? t.recommending : t.recommendAction}
        </button>
        <p className="text-[11px] text-slate-400">{t.recommendHint}</p>
      </section>

      {selectedPeople.length > 0 ? (
        <section className="space-y-4">
          <div className="text-xs font-medium text-slate-700">{t.agendaByPerson}</div>
          {selectedPeople.map((userId) => {
            const name = userName.get(userId) ?? userId;
            const block = blocks[userId] ?? emptyBlock(userId);
            const recs = recommendedByUser.get(userId) ?? [];
            const allOpen = !!showAllAdd[userId];
            return (
              <div
                key={userId}
                className="rounded-xl border border-slate-200 bg-slate-50/40 p-3 space-y-3"
              >
                <div className="text-sm font-semibold text-slate-900">{name}</div>

                {recs.length ? (
                  <ul className="space-y-1.5">
                    {recs.map((rec) => {
                      const checked = block.selectedRecKeys.has(rec.subjectKey);
                      return (
                        <li key={`${rec.userId}-${rec.subjectKey}`}>
                          <label
                            className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-sm cursor-pointer ${
                              checked
                                ? "border-sky-300 bg-white"
                                : "border-slate-100 bg-white/60 opacity-70"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRecommended(userId, rec.subjectKey)}
                              className="mt-0.5 rounded border-slate-300"
                            />
                            <span className="min-w-0">
                              <span className="font-medium text-slate-800">{rec.title}</span>
                              <span className="block text-[11px] text-slate-400">
                                {formatMsg(t.recommendReasons, {
                                  reasons: rec.reasons.join(" · "),
                                })}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                ) : recommendedAt ? (
                  <p className="text-[11px] text-slate-400">{t.noRecommend}</p>
                ) : null}

                <OwnedPortfolioPicker
                  userId={userId}
                  customers={customers}
                  projects={projects}
                  partners={partners}
                  opportunities={opportunities}
                  partnerLinks={partnerLinks}
                  selectedKeys={block.ownedPicks}
                  onToggle={(kind, id) => toggleOwnedPick(userId, kind, id)}
                  labels={{
                    ownedSection: t.ownedSection,
                    ownedProjects: t.ownedProjects,
                    ownedOpportunities: t.ownedOpportunities,
                    ownedCustomers: t.ownedCustomers,
                    ownedPartners: t.ownedPartners,
                    ownedEmpty: t.ownedEmpty,
                    noProjectsUnder: t.noProjectsUnder,
                    noOpportunitiesUnder: t.noOpportunitiesUnder,
                    partnerCustomers: t.partnerCustomers,
                    partnerAlways: t.partnerAlways,
                    customerOnly: t.customerOnly,
                  }}
                />

                <div className="space-y-2">
                  <button
                    type="button"
                    className="text-[11px] text-sky-700 hover:underline"
                    onClick={() => {
                      const nextOpen = !allOpen;
                      setShowAllAdd((prev) => ({
                        ...prev,
                        [userId]: nextOpen,
                      }));
                      if (nextOpen) {
                        setBlocks((prev) => {
                          const cur = prev[userId] ?? emptyBlock(userId);
                          if (cur.manual.length > 0) return prev;
                          return {
                            ...prev,
                            [userId]: {
                              ...cur,
                              manual: [newManualRow()],
                            },
                          };
                        });
                      }
                    }}
                  >
                    {allOpen ? t.hideAddFromAll : t.addFromAll}
                  </button>

                  {allOpen ? (
                    <div className="space-y-2">
                      <span className="text-[11px] font-medium text-slate-600">
                        {t.manualAdd}
                      </span>
                      {block.manual.map((row) => {
                        const custProjects = row.customerId
                          ? (projectsByCustomer.get(row.customerId) ?? [])
                          : [];
                        const custOpps = row.customerId
                          ? (oppsByCustomer.get(row.customerId) ?? [])
                          : [];
                        return (
                          <div
                            key={row.key}
                            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] rounded-lg border border-slate-100 bg-white p-2.5"
                          >
                            <label className="block space-y-1">
                              <span className="text-[11px] text-slate-500">{t.customer}</span>
                              <select
                                value={row.customerId}
                                onChange={(e) =>
                                  updateManual(userId, row.key, {
                                    customerId: e.target.value,
                                    linkKey: "",
                                  })
                                }
                                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                              >
                                <option value="">{t.selectCustomer}</option>
                                {customers.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block space-y-1">
                              <span className="text-[11px] text-slate-500">{t.optionalLink}</span>
                              <select
                                value={row.linkKey}
                                disabled={!row.customerId}
                                onChange={(e) =>
                                  updateManual(userId, row.key, {
                                    linkKey: e.target.value,
                                  })
                                }
                                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm disabled:opacity-40"
                              >
                                <option value="">{t.customerOnly}</option>
                                {custOpps.length ? (
                                  <optgroup label={t.ownedOpportunities}>
                                    {custOpps.map((o) => (
                                      <option key={o.id} value={`opportunity:${o.id}`}>
                                        {o.name}
                                      </option>
                                    ))}
                                  </optgroup>
                                ) : null}
                                {custProjects.length ? (
                                  <optgroup label={t.ownedProjects}>
                                    {custProjects.map((p) => (
                                      <option key={p.id} value={`project:${p.id}`}>
                                        {p.name}
                                      </option>
                                    ))}
                                  </optgroup>
                                ) : null}
                              </select>
                            </label>
                            <button
                              type="button"
                              className="self-end text-[11px] text-slate-400 hover:text-red-600 pb-2"
                              onClick={() =>
                                setBlocks((prev) => {
                                  const cur = prev[userId];
                                  if (!cur) return prev;
                                  const next = cur.manual.filter((r) => r.key !== row.key);
                                  return {
                                    ...prev,
                                    [userId]: {
                                      ...cur,
                                      // 至少保留一行，避免删光后又要点「添加」
                                      manual: next.length ? next : [newManualRow()],
                                    },
                                  };
                                })
                              }
                            >
                              {t.removeItem}
                            </button>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        className="text-[11px] text-sky-700 hover:underline"
                        onClick={() =>
                          setBlocks((prev) => {
                            const cur = prev[userId] ?? emptyBlock(userId);
                            return {
                              ...prev,
                              [userId]: {
                                ...cur,
                                manual: [...cur.manual, newManualRow()],
                              },
                            };
                          })
                        }
                      >
                        {t.addItem}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
        <button
          type="button"
          disabled={busy || !selectedPeople.length}
          onClick={confirmAndPull}
          className="rounded-lg bg-violet-700 text-white px-4 py-2 text-sm font-medium hover:bg-violet-800 disabled:opacity-40"
        >
          {busy ? t.confirming : t.confirmPull}
        </button>
        <span className="text-[11px] text-slate-400">{t.confirmPullHint}</span>
      </div>
    </div>
  );
}
