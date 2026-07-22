import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Badge, fmtDate, TierBadge } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { EntityNameEditor } from "@/components/entity-name-editor";
import { getServerI18n } from "@/lib/server-i18n";
import { buildCrmCustomerViewUrl } from "@/lib/crm";
import { deleteCustomerAction, updateCustomerAction } from "@/lib/customer-actions";
import { resolveCustomerTier } from "@/lib/tier";

function statusTone(status: string): "green" | "blue" | "zinc" {
  if (status === "ACTIVE") return "green";
  if (status === "PROSPECT") return "blue";
  return "zinc";
}

export async function CustomerDetailHeader({ id }: { id: string }) {
  const [{ messages: m, bcp47 }, customer] = await Promise.all([
    getServerI18n(),
    db.customer.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        city: true,
        country: true,
        website: true,
        createdAt: true,
        crmCustomerId: true,
        partnerRelation: true,
        tier: true,
        icpTier: true,
        createdBy: { select: { name: true } },
        partnerLinks: { include: { partner: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
  ]);
  if (!customer) notFound();

  const c = m.customers;
  const resolvedTier = resolveCustomerTier(customer);
  const statusLabel = (s: string) =>
    s === "ACTIVE" ? c.statusActive : s === "PROSPECT" ? c.statusProspect : c.statusInactive;

  return (
    <div className="px-8 pt-5 sm:pt-7 pb-4 border-b border-slate-200/60 bg-white">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <BackButton fallbackHref="/customers" className="mt-1" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <EntityNameEditor entityId={customer.id} name={customer.name} updateAction={updateCustomerAction} />
              <Badge tone={statusTone(customer.status)}>{statusLabel(customer.status)}</Badge>
              <TierBadge tier={resolvedTier} />
              {customer.partnerRelation === "SELF" ? (
                <Badge tone="indigo">{c.selfBadge}</Badge>
              ) : (
                customer.partnerLinks.map((l) => (
                  <Badge key={l.partner.id} tone="zinc">{l.partner.name}</Badge>
                ))
              )}
            </div>
            <div className="text-sm text-slate-500 mt-1.5">
              {[customer.city, customer.country].filter(Boolean).join(" · ") || m.common.unknownRegion}
              {customer.website && (
                <>
                  {" · "}
                  <a href={`https://${customer.website.replace(/^https?:\/\//, "")}`} target="_blank" className="text-sky-600 hover:underline">
                    {customer.website}
                  </a>
                </>
              )}
              {" · "}{c.createdAt} {fmtDate(customer.createdAt, bcp47)}
              {customer.createdBy && ` · ${customer.createdBy.name}`}
              {customer.crmCustomerId && (
                <>
                  {" · "}
                  <a
                    href={buildCrmCustomerViewUrl(customer.crmCustomerId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-600 hover:underline"
                  >
                    {m.integrations.openInCrm} ↗
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <form action={deleteCustomerAction.bind(null, customer.id)}>
            <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-400 hover:text-red-600">
              {m.common.delete}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
