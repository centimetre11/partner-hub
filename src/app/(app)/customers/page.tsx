import { NavLink } from "@/components/nav-link";
import { ClickableRow } from "@/components/clickable-nav";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, EmptyState, fmtDate } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import { AddCustomerForm } from "./add-customer-form";
import { CreateFromCrmButton } from "@/components/create-from-crm-button";
import { END_CUSTOMER_WHERE } from "@/lib/customer-filters";
import { nameContainsWhere } from "@/lib/name-search";

function statusTone(status: string): "green" | "blue" | "zinc" {
  if (status === "ACTIVE") return "green";
  if (status === "PROSPECT") return "blue";
  return "zinc";
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; partner?: string; owner?: string; presales?: string; unbound?: string; add?: string }>;
}) {
  await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const c = m.customers;
  const sp = await searchParams;
  const nameFilter = nameContainsWhere(sp.q);

  const [customers, partners, users] = await Promise.all([
    db.customer.findMany({
      where: {
        ...END_CUSTOMER_WHERE,
        ...(nameFilter ? { name: nameFilter } : {}),
        ...(sp.status ? { status: sp.status } : {}),
        ...(sp.owner ? { ownerId: sp.owner } : {}),
        ...(sp.presales ? { presalesUserId: sp.presales } : {}),
        ...(sp.unbound === "1"
          ? { partnerLinks: { none: {} } }
          : sp.partner
            ? { partnerLinks: { some: { partnerId: sp.partner } } }
            : {}),
      },
      include: {
        partnerLinks: { include: { partner: { select: { id: true, name: true } } } },
        owner: { select: { name: true } },
        presalesUser: { select: { name: true } },
        contacts: { select: { name: true, title: true, contactInfo: true }, take: 1, orderBy: { updatedAt: "desc" } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.partner.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
  ]);

  const statusLabel = (s: string) =>
    s === "ACTIVE" ? c.statusActive : s === "PROSPECT" ? c.statusProspect : c.statusInactive;

  return (
    <div className="pb-16">
      <PageHeader
        title={c.title}
        desc={c.desc.replace("{count}", String(customers.length))}
        actions={
          <div className="flex gap-2">
            <AddCustomerForm
              partners={partners}
              users={users}
              defaultPartnerId={sp.partner}
              defaultOpen={sp.add === "1"}
            />
            <CreateFromCrmButton entity="customer" />
          </div>
        }
      />
      <div className="px-8">
        <form className="flex flex-wrap gap-2 mb-4" method="get">
          <input name="q" defaultValue={sp.q} placeholder={c.searchPlaceholder} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm w-full sm:w-48" />
          <select name="status" defaultValue={sp.status ?? ""} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{c.allStatuses}</option>
            <option value="ACTIVE">{c.statusActive}</option>
            <option value="PROSPECT">{c.statusProspect}</option>
            <option value="INACTIVE">{c.statusInactive}</option>
          </select>
          <select name="partner" defaultValue={sp.partner ?? ""} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{c.allPartners}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select name="owner" defaultValue={sp.owner ?? ""} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{c.allSalesOwners}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select name="presales" defaultValue={sp.presales ?? ""} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{c.allPresalesOwners}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 px-2">
            <input type="checkbox" name="unbound" value="1" defaultChecked={sp.unbound === "1"} />
            {c.unboundOnly}
          </label>
          <button className="rounded-lg bg-slate-900 text-white px-4 py-1.5 text-sm hover:bg-slate-700">{m.common.filter}</button>
        </form>

        {customers.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm">
            <EmptyState text={c.empty} />
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs text-slate-500">
                    <th className="px-4 py-2.5 font-medium">{c.colName}</th>
                    <th className="px-4 py-2.5 font-medium">{c.colIndustry}</th>
                    <th className="px-4 py-2.5 font-medium">{c.colRegion}</th>
                    <th className="px-4 py-2.5 font-medium">{c.colPartner}</th>
                    <th className="px-4 py-2.5 font-medium">{c.colContact}</th>
                    <th className="px-4 py-2.5 font-medium">{c.colOwner}</th>
                    <th className="px-4 py-2.5 font-medium">{c.colPresales}</th>
                    <th className="px-4 py-2.5 font-medium">{c.colStatus}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {customers.map((cust) => (
                    <ClickableRow key={cust.id} href={`/customers/${cust.id}`} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-900">{cust.name}</span>
                        <div className="text-[11px] text-slate-400 mt-0.5">{c.createdAt} {fmtDate(cust.createdAt, bcp47)}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{cust.industry ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{[cust.city, cust.country].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-4 py-3">
                        {cust.partnerLinks.length > 0 ? (
                          <span className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                            {cust.partnerLinks.map((link, i) => (
                              <span key={link.partner.id}>
                                <NavLink href={`/partners/${link.partner.id}`} className="text-sky-600 hover:underline">{link.partner.name}</NavLink>
                                {i < cust.partnerLinks.length - 1 && <span className="text-slate-300">,</span>}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-slate-300">{c.noPartner}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {cust.contacts[0] ? (
                          <span>
                            {cust.contacts[0].name}
                            {cust.contacts[0].title ? (
                              <span className="text-slate-400"> · {cust.contacts[0].title}</span>
                            ) : null}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{cust.owner?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{cust.presalesUser?.name ?? "—"}</td>
                      <td className="px-4 py-3"><Badge tone={statusTone(cust.status)}>{statusLabel(cust.status)}</Badge></td>
                    </ClickableRow>
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
