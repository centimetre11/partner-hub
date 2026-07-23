"use client";

import { useMemo, useState } from "react";

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
export type PartnerCustomerLink = { partnerId: string; customerId: string };

type Labels = {
  ownedSection: string;
  ownedProjects: string;
  ownedCustomers: string;
  ownedPartners: string;
  ownedEmpty: string;
  noProjectsUnder: string;
  partnerCustomers: string;
};

type Tab = "projects" | "customers" | "partners";

function isMyPartner(p: PartnerOpt, userId: string) {
  return (
    p.presalesUserId === userId || p.salesUserId === userId || p.ownerId === userId
  );
}

function isMyCustomer(c: CustomerOpt, userId: string) {
  return c.presalesUserId === userId || c.ownerId === userId;
}

export function OwnedPortfolioPicker({
  userId,
  customers,
  projects,
  partners,
  partnerLinks,
  selectedProjectIds,
  onToggleProject,
  labels,
}: {
  userId: string;
  customers: CustomerOpt[];
  projects: ProjectOpt[];
  partners: PartnerOpt[];
  partnerLinks: PartnerCustomerLink[];
  selectedProjectIds: Set<string>;
  onToggleProject: (projectId: string) => void;
  labels: Labels;
}) {
  const [tab, setTab] = useState<Tab>("projects");
  const [openPartnerIds, setOpenPartnerIds] = useState<Set<string>>(() => new Set());
  const [openCustomerIds, setOpenCustomerIds] = useState<Set<string>>(() => new Set());

  const customerName = useMemo(
    () => new Map(customers.map((c) => [c.id, c.name])),
    [customers],
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

  const myCustomers = useMemo(
    () => customers.filter((c) => isMyCustomer(c, userId)),
    [customers, userId],
  );
  const myCustomerIds = useMemo(
    () => new Set(myCustomers.map((c) => c.id)),
    [myCustomers],
  );
  const myProjects = useMemo(() => {
    const list = projects.filter(
      (p) => p.ownerId === userId || myCustomerIds.has(p.customerId),
    );
    // de-dupe by id, prefer updated order by name
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

  const myPartners = useMemo(
    () => partners.filter((p) => isMyPartner(p, userId)),
    [partners, userId],
  );

  const customerIdsByPartner = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const link of partnerLinks) {
      const list = map.get(link.partnerId) ?? [];
      list.push(link.customerId);
      map.set(link.partnerId, list);
    }
    // also projects with partnerId
    for (const p of projects) {
      if (!p.partnerId) continue;
      const list = map.get(p.partnerId) ?? [];
      if (!list.includes(p.customerId)) list.push(p.customerId);
      map.set(p.partnerId, list);
    }
    return map;
  }, [partnerLinks, projects]);

  const empty =
    !myProjects.length && !myCustomers.length && !myPartners.length;

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

  function projectCheck(p: ProjectOpt) {
    const checked = selectedProjectIds.has(p.id);
    const cName = customerName.get(p.customerId) ?? "—";
    return (
      <label
        key={p.id}
        className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-sm cursor-pointer ${
          checked ? "border-sky-300 bg-sky-50/60" : "border-slate-100 bg-white hover:border-slate-200"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggleProject(p.id)}
          className="mt-0.5 rounded border-slate-300"
        />
        <span className="min-w-0 leading-snug">
          <span className="text-slate-800">{cName}</span>
          <span className="text-slate-400"> / </span>
          <span className="text-slate-700">{p.name}</span>
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
            {tabBtn("customers", labels.ownedCustomers, myCustomers.length)}
            {tabBtn("partners", labels.ownedPartners, myPartners.length)}
          </div>

          {tab === "projects" ? (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {myProjects.length ? myProjects.map(projectCheck) : (
                <p className="text-[11px] text-slate-400">{labels.noProjectsUnder}</p>
              )}
            </div>
          ) : null}

          {tab === "customers" ? (
            <div className="max-h-52 overflow-y-auto space-y-1.5">
              {myCustomers.map((c) => {
                const open = openCustomerIds.has(c.id);
                const cps = projectsByCustomer.get(c.id) ?? [];
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
                        {cps.length} · {open ? "▴" : "▾"}
                      </span>
                    </button>
                    {open ? (
                      <div className="px-2 pb-2 space-y-1">
                        {cps.length ? (
                          cps.map(projectCheck)
                        ) : (
                          <p className="text-[11px] text-slate-400 px-1">
                            {labels.noProjectsUnder}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {tab === "partners" ? (
            <div className="max-h-52 overflow-y-auto space-y-1.5">
              {myPartners.map((partner) => {
                const open = openPartnerIds.has(partner.id);
                const custIds = customerIdsByPartner.get(partner.id) ?? [];
                const linkedProjects = custIds.flatMap(
                  (cid) => projectsByCustomer.get(cid) ?? [],
                );
                // also projects directly tagged with this partner
                const direct = projects.filter((p) => p.partnerId === partner.id);
                const allProj = [...linkedProjects, ...direct].filter(
                  (p, i, arr) => arr.findIndex((x) => x.id === p.id) === i,
                );
                return (
                  <div key={partner.id} className="rounded-md border border-slate-100">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-slate-50"
                      onClick={() =>
                        setOpenPartnerIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(partner.id)) next.delete(partner.id);
                          else next.add(partner.id);
                          return next;
                        })
                      }
                    >
                      <span className="font-medium text-slate-800 truncate">
                        {partner.name}
                      </span>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {allProj.length} · {open ? "▴" : "▾"}
                      </span>
                    </button>
                    {open ? (
                      <div className="px-2 pb-2 space-y-1">
                        <p className="text-[10px] text-slate-400 px-1">
                          {labels.partnerCustomers}
                        </p>
                        {allProj.length ? (
                          allProj.map(projectCheck)
                        ) : (
                          <p className="text-[11px] text-slate-400 px-1">
                            {labels.noProjectsUnder}
                          </p>
                        )}
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
