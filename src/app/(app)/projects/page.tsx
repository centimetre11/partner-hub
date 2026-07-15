import { NavLink } from "@/components/nav-link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, EmptyState, fmtDate } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import { AddProjectForm } from "./add-project-form";
import { InstantSearchInput } from "@/components/instant-search-input";
import { nameContainsWhere } from "@/lib/name-search";

function statusTone(status: string): "green" | "indigo" | "zinc" {
  if (status === "ACTIVE") return "green";
  if (status === "DONE") return "indigo";
  return "zinc";
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    phase?: string;
    customer?: string;
    partner?: string;
    owner?: string;
  }>;
}) {
  await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const p = m.projects;
  const c = m.customers;
  const sp = await searchParams;
  const statusFilter = sp.status === undefined ? "ACTIVE" : sp.status;
  const nameFilter = nameContainsWhere(sp.q);

  const [projects, customers, partners, users] = await Promise.all([
    db.project.findMany({
      where: {
        ...(nameFilter ? { name: nameFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(sp.phase ? { phase: sp.phase } : {}),
        ...(sp.customer ? { customerId: sp.customer } : {}),
        ...(sp.partner ? { partnerId: sp.partner } : {}),
        ...(sp.owner ? { ownerId: sp.owner } : {}),
      },
      include: {
        customer: { select: { id: true, name: true } },
        partner: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        sourceOpportunity: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.partner.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const phaseLabel = (phase: string) =>
    (
      ({
        KICKOFF: c.phaseKICKOFF,
        IMPLEMENT: c.phaseIMPLEMENT,
        ACCEPTANCE: c.phaseACCEPTANCE,
        GOLIVE: c.phaseGOLIVE,
        MAINTENANCE: c.phaseMAINTENANCE,
      }) as Record<string, string>
    )[phase] ?? phase;

  const statusLabel = (s: string) =>
    (
      ({
        ACTIVE: c.projectStatusACTIVE,
        ON_HOLD: c.projectStatusON_HOLD,
        DONE: c.projectStatusDONE,
        CLOSED: c.projectStatusCLOSED,
      }) as Record<string, string>
    )[s] ?? s;

  return (
    <div className="pb-16">
      <PageHeader
        title={p.title}
        desc={p.desc.replace("{count}", String(projects.length))}
        actions={<AddProjectForm customers={customers} partners={partners} />}
      />
      <div className="px-8">
        <form className="flex flex-wrap gap-2 mb-4" method="get">
          <InstantSearchInput
            placeholder={p.searchPlaceholder}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm w-full sm:w-48"
          />
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{p.allStatuses}</option>
            <option value="ACTIVE">{c.projectStatusACTIVE}</option>
            <option value="ON_HOLD">{c.projectStatusON_HOLD}</option>
            <option value="DONE">{c.projectStatusDONE}</option>
            <option value="CLOSED">{c.projectStatusCLOSED}</option>
          </select>
          <select
            name="phase"
            defaultValue={sp.phase ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{p.allPhases}</option>
            <option value="KICKOFF">{c.phaseKICKOFF}</option>
            <option value="IMPLEMENT">{c.phaseIMPLEMENT}</option>
            <option value="ACCEPTANCE">{c.phaseACCEPTANCE}</option>
            <option value="GOLIVE">{c.phaseGOLIVE}</option>
            <option value="MAINTENANCE">{c.phaseMAINTENANCE}</option>
          </select>
          <select
            name="customer"
            defaultValue={sp.customer ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{p.allCustomers}</option>
            {customers.map((cust) => (
              <option key={cust.id} value={cust.id}>
                {cust.name}
              </option>
            ))}
          </select>
          <select
            name="partner"
            defaultValue={sp.partner ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{p.allPartners}</option>
            {partners.map((pp) => (
              <option key={pp.id} value={pp.id}>
                {pp.name}
              </option>
            ))}
          </select>
          <select
            name="owner"
            defaultValue={sp.owner ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{p.allOwners}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button className="rounded-lg bg-slate-900 text-white px-4 py-1.5 text-sm hover:bg-slate-700">
            {m.common.filter}
          </button>
        </form>

        {projects.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm">
            <EmptyState text={p.empty} />
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs text-slate-500">
                    <th className="px-4 py-2.5 font-medium">{p.colName}</th>
                    <th className="px-4 py-2.5 font-medium">{p.colCustomer}</th>
                    <th className="px-4 py-2.5 font-medium">{p.colPartner}</th>
                    <th className="px-4 py-2.5 font-medium">{p.colPhase}</th>
                    <th className="px-4 py-2.5 font-medium">{p.colStatus}</th>
                    <th className="px-4 py-2.5 font-medium">{p.colOwner}</th>
                    <th className="px-4 py-2.5 font-medium">{p.colDates}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {projects.map((proj) => (
                    <tr key={proj.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <NavLink
                          href={`/customers/${proj.customerId}?tab=projects`}
                          className="font-medium text-slate-900 hover:text-sky-700"
                        >
                          {proj.name}
                        </NavLink>
                        {proj.sourceOpportunity && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {c.belongsToOpportunity}: {proj.sourceOpportunity.name}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <NavLink
                          href={`/customers/${proj.customer.id}?tab=projects`}
                          className="text-sky-600 hover:underline"
                        >
                          {proj.customer.name}
                        </NavLink>
                      </td>
                      <td className="px-4 py-3">
                        {proj.partner ? (
                          <NavLink href={`/partners/${proj.partner.id}`} className="text-sky-600 hover:underline">
                            {proj.partner.name}
                          </NavLink>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="blue">{phaseLabel(proj.phase)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(proj.status)}>{statusLabel(proj.status)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{proj.owner?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {[proj.startDate ? fmtDate(proj.startDate, bcp47) : null, proj.endDate ? fmtDate(proj.endDate, bcp47) : null]
                          .filter(Boolean)
                          .join(" – ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
