"use client";

import { useMemo, useState } from "react";
import { subjectKeyFor, type AgendaSubjectKind } from "@/lib/presales-meeting/subject";

export type CustomerOpt = {
  id: string;
  name: string;
  ownerId: string | null;
  presalesUserId: string | null;
};
export type ProjectOpt = {
  id: string;
  name: string;
  customerId: string;
  ownerId: string | null;
  partnerId: string | null;
};
export type PartnerOpt = {
  id: string;
  name: string;
  ownerId: string | null;
  salesUserId: string | null;
  presalesUserId: string | null;
};
export type OpportunityOpt = {
  id: string;
  name: string;
  customerId: string | null;
  partnerId: string | null;
  status: string;
};
export type PartnerCustomerLink = { partnerId: string; customerId: string };

type Labels = {
  ownedSection: string;
  ownedProjects: string;
  ownedOpportunities: string;
  ownedCustomers: string;
  ownedPartners: string;
  ownedEmpty: string;
  noProjectsUnder: string;
  noOpportunitiesUnder: string;
  partnerCustomers: string;
  partnerAlways: string;
};

type Tab = "projects" | "opportunities" | "customers" | "partners";

function isMyPartner(p: PartnerOpt, userId: string) {
  return (
    p.presalesUserId === userId || p.salesUserId === userId || p.ownerId === userId
  );
}

function isMyCustomer(c: CustomerOpt, userId: string) {
  return c.presalesUserId === userId || c.ownerId === userId;
}

function isOpenOpportunity(status: string) {
  return !["WON", "LOST"].includes(status);
}

export function OwnedPortfolioPicker({
  userId,
  customers,
  projects,
  partners,
  opportunities,
  partnerLinks,
  selectedKeys,
  onToggle,
  labels,
}: {
  userId: string;
  customers: CustomerOpt[];
  projects: ProjectOpt[];
  partners: PartnerOpt[];
  opportunities: OpportunityOpt[];
  partnerLinks: PartnerCustomerLink[];
  selectedKeys: Set<string>;
  onToggle: (kind: AgendaSubjectKind, id: string) => void;
  labels: Labels;
}) {
  const [tab, setTab] = useState<Tab>("projects");
  const [openPartnerIds, setOpenPartnerIds] = useState<Set<string>>(() => new Set());
  const [openCustomerIds, setOpenCustomerIds] = useState<Set<string>>(() => new Set());

  const customerName = useMemo(
    () => new Map(customers.map((c) => [c.id, c.name])),
    [customers],
  );
  const partnerName = useMemo(
    () => new Map(partners.map((p) => [p.id, p.name])),
    [partners],
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
      if (!o.customerId || !isOpenOpportunity(o.status)) continue;
      const list = map.get(o.customerId) ?? [];
      list.push(o);
      map.set(o.customerId, list);
    }
    return map;
  }, [opportunities]);
  const oppsByPartner = useMemo(() => {
    const map = new Map<string, OpportunityOpt[]>();
    for (const o of opportunities) {
      if (!o.partnerId || !isOpenOpportunity(o.status)) continue;
      const list = map.get(o.partnerId) ?? [];
      list.push(o);
      map.set(o.partnerId, list);
    }
    return map;
  }, [opportunities]);

  const myCustomers = useMemo(
    () => customers.filter((c) => isMyCustomer(c, userId)),
    [customers, userId],
  );
  const myCustomerIds = useMemo(
    () => new Set(myCustomers.map((c) => c.id)),
    [myCustomers],
  );
  const myPartners = useMemo(
    () => partners.filter((p) => isMyPartner(p, userId)),
    [partners, userId],
  );
  const myPartnerIds = useMemo(
    () => new Set(myPartners.map((p) => p.id)),
    [myPartners],
  );

  const myProjects = useMemo(() => {
    const list = projects.filter(
      (p) => p.ownerId === userId || myCustomerIds.has(p.customerId),
    );
    const seen = new Set<string>();
    return list
      .filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      })
      .sort((a, b) => {
        const ca = customerName.get(a.customerId) ?? "";
        const cb = customerName.get(b.customerId) ?? "";
        return ca.localeCompare(cb, "zh") || a.name.localeCompare(b.name, "zh");
      });
  }, [projects, userId, myCustomerIds, customerName]);

  const myOpportunities = useMemo(() => {
    const list = opportunities.filter(
      (o) =>
        isOpenOpportunity(o.status) &&
        ((o.customerId && myCustomerIds.has(o.customerId)) ||
          (o.partnerId && myPartnerIds.has(o.partnerId))),
    );
    const seen = new Set<string>();
    return list
      .filter((o) => {
        if (seen.has(o.id)) return false;
        seen.add(o.id);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "zh"));
  }, [opportunities, myCustomerIds, myPartnerIds]);

  const customerIdsByPartner = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const link of partnerLinks) {
      const list = map.get(link.partnerId) ?? [];
      list.push(link.customerId);
      map.set(link.partnerId, list);
    }
    for (const p of projects) {
      if (!p.partnerId) continue;
      const list = map.get(p.partnerId) ?? [];
      if (!list.includes(p.customerId)) list.push(p.customerId);
      map.set(p.partnerId, list);
    }
    return map;
  }, [partnerLinks, projects]);

  const empty =
    !myProjects.length &&
    !myOpportunities.length &&
    !myCustomers.length &&
    !myPartners.length;

  const tabBtn = (id: Tab, label: string, count: number) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
        tab === id
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
      <span className="ml-1 opacity-70">{count}</span>
    </button>
  );

  function checkRow(opts: {
    kind: AgendaSubjectKind;
    id: string;
    title: string;
    subtitle?: string;
  }) {
    const key = subjectKeyFor(opts.kind, opts.id);
    const checked = selectedKeys.has(key);
    return (
      <label
        key={key}
        className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-sm cursor-pointer ${
          checked ? "border-sky-300 bg-sky-50/60" : "border-slate-100 bg-white hover:border-slate-200"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(opts.kind, opts.id)}
          className="mt-0.5 rounded border-slate-300"
        />
        <span className="min-w-0 leading-snug">
          <span className="text-slate-800">{opts.title}</span>
          {opts.subtitle ? (
            <span className="block text-[11px] text-slate-400">{opts.subtitle}</span>
          ) : null}
        </span>
      </label>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="text-[11px] font-medium text-slate-600">{labels.ownedSection}</div>
      {empty ? (
        <p className="text-[11px] text-slate-400 px-0.5">{labels.ownedEmpty}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {tabBtn("projects", labels.ownedProjects, myProjects.length)}
            {tabBtn("opportunities", labels.ownedOpportunities, myOpportunities.length)}
            {tabBtn("customers", labels.ownedCustomers, myCustomers.length)}
            {tabBtn("partners", labels.ownedPartners, myPartners.length)}
          </div>

          {tab === "projects" ? (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {myProjects.length ? (
                myProjects.map((p) =>
                  checkRow({
                    kind: "PROJECT",
                    id: p.id,
                    title: `${customerName.get(p.customerId) ?? "—"} / ${p.name}`,
                    subtitle: "项目",
                  }),
                )
              ) : (
                <p className="text-[11px] text-slate-400">{labels.noProjectsUnder}</p>
              )}
            </div>
          ) : null}

          {tab === "opportunities" ? (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {myOpportunities.length ? (
                myOpportunities.map((o) =>
                  checkRow({
                    kind: "OPPORTUNITY",
                    id: o.id,
                    title: o.name,
                    subtitle: [
                      o.customerId ? customerName.get(o.customerId) : null,
                      o.partnerId ? partnerName.get(o.partnerId) : null,
                      "商机",
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  }),
                )
              ) : (
                <p className="text-[11px] text-slate-400">{labels.noOpportunitiesUnder}</p>
              )}
            </div>
          ) : null}

          {tab === "customers" ? (
            <div className="max-h-52 overflow-y-auto space-y-1.5">
              {myCustomers.map((c) => {
                const open = openCustomerIds.has(c.id);
                const cps = projectsByCustomer.get(c.id) ?? [];
                const ops = oppsByCustomer.get(c.id) ?? [];
                return (
                  <div key={c.id} className="rounded-md border border-slate-100">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-slate-50"
                      onClick={() =>
                        setOpenCustomerIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        })
                      }
                    >
                      <span className="font-medium text-slate-800 truncate">{c.name}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {cps.length + ops.length} · {open ? "▴" : "▾"}
                      </span>
                    </button>
                    {open ? (
                      <div className="px-2 pb-2 space-y-1">
                        {ops.map((o) =>
                          checkRow({
                            kind: "OPPORTUNITY",
                            id: o.id,
                            title: o.name,
                            subtitle: "商机",
                          }),
                        )}
                        {cps.map((p) =>
                          checkRow({
                            kind: "PROJECT",
                            id: p.id,
                            title: p.name,
                            subtitle: "项目",
                          }),
                        )}
                        {!ops.length && !cps.length ? (
                          <p className="text-[11px] text-slate-400 px-1">
                            {labels.noProjectsUnder}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {tab === "partners" ? (
            <div className="max-h-52 overflow-y-auto space-y-1.5">
              <p className="text-[10px] text-slate-400 px-0.5">{labels.partnerAlways}</p>
              {myPartners.map((partner) => {
                const open = openPartnerIds.has(partner.id);
                const partnerKey = subjectKeyFor("PARTNER", partner.id);
                const partnerChecked = selectedKeys.has(partnerKey);
                const custIds = customerIdsByPartner.get(partner.id) ?? [];
                const linkedProjects = custIds.flatMap(
                  (cid) => projectsByCustomer.get(cid) ?? [],
                );
                const direct = projects.filter((p) => p.partnerId === partner.id);
                const allProj = [...linkedProjects, ...direct].filter(
                  (p, i, arr) => arr.findIndex((x) => x.id === p.id) === i,
                );
                const allOpp = [
                  ...(oppsByPartner.get(partner.id) ?? []),
                  ...custIds.flatMap((cid) => oppsByCustomer.get(cid) ?? []),
                ].filter((o, i, arr) => arr.findIndex((x) => x.id === o.id) === i);

                return (
                  <div key={partner.id} className="rounded-md border border-slate-100">
                    <div className="flex items-center gap-2 px-2.5 py-1.5">
                      <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={partnerChecked}
                          onChange={() => onToggle("PARTNER", partner.id)}
                          className="rounded border-slate-300"
                        />
                        <span className="font-medium text-slate-800 truncate text-sm">
                          {partner.name}
                        </span>
                      </label>
                      <button
                        type="button"
                        className="text-[11px] text-slate-400 shrink-0 hover:text-slate-600"
                        onClick={() =>
                          setOpenPartnerIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(partner.id)) next.delete(partner.id);
                            else next.add(partner.id);
                            return next;
                          })
                        }
                      >
                        {allProj.length + allOpp.length} · {open ? "▴" : "▾"}
                      </button>
                    </div>
                    {open ? (
                      <div className="px-2 pb-2 space-y-1">
                        <p className="text-[10px] text-slate-400 px-1">
                          {labels.partnerCustomers}
                        </p>
                        {allOpp.map((o) =>
                          checkRow({
                            kind: "OPPORTUNITY",
                            id: o.id,
                            title: o.name,
                            subtitle: "商机",
                          }),
                        )}
                        {allProj.map((p) =>
                          checkRow({
                            kind: "PROJECT",
                            id: p.id,
                            title: `${customerName.get(p.customerId) ?? "—"} / ${p.name}`,
                            subtitle: "项目",
                          }),
                        )}
                        {!allOpp.length && !allProj.length ? (
                          <p className="text-[11px] text-slate-400 px-1">
                            {labels.noProjectsUnder}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
