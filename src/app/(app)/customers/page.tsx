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
import { InstantSearchInput } from "@/components/instant-search-input";
import { getTaxonomyOptions, loadTaxonomyLabelMaps, labelFromMap } from "@/lib/taxonomy";
import { CustomerBucketTabs } from "@/components/customer-bucket-tabs";
import { classifyCustomers, type CustomerBucketMeta, type GrowthProbability } from "@/lib/customer-bucket";
import { OPEN_OPPORTUNITY_STATUSES, opportunityStatusLabel, opportunityStatusTone } from "@/lib/opportunity-status";

function statusTone(status: string): "green" | "blue" | "zinc" {
  if (status === "ACTIVE") return "green";
  if (status === "PROSPECT") return "blue";
  return "zinc";
}

type CustomerBucketSearchParams = {
  q?: string;
  status?: string;
  partner?: string;
  owner?: string;
  presales?: string;
  unbound?: string;
  add?: string;
  segment?: string;
  icpTier?: string;
  bucket?: string;
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<CustomerBucketSearchParams>;
}) {
  await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const c = m.customers;
  const sp = await searchParams;
  const nameFilter = nameContainsWhere(sp.q);

  const [customers, partners, users, segmentOptions, icpTierOptions, buyingTriggerOptions, entryPathOptions, labelMaps] = await Promise.all([
    db.customer.findMany({
      where: {
        ...END_CUSTOMER_WHERE,
        ...(nameFilter ? { name: nameFilter } : {}),
        ...(sp.status ? { status: sp.status } : {}),
        ...(sp.segment ? { customerSegment: sp.segment } : {}),
        ...(sp.icpTier ? { icpTier: sp.icpTier } : {}),
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
        contracts: {
          select: {
            id: true,
            contractType: true,
            status: true,
            endDate: true,
            renewsAt: true,
            startDate: true,
            amount: true,
            currency: true,
            billingCycle: true,
            termYears: true,
          },
        },
        opportunities: {
          where: { status: { in: [...OPEN_OPPORTUNITY_STATUSES] } },
          select: { status: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.partner.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    getTaxonomyOptions("CUSTOMER_SEGMENT"),
    getTaxonomyOptions("ICP_TIER"),
    getTaxonomyOptions("BUYING_TRIGGER"),
    getTaxonomyOptions("ENTRY_PATH"),
    loadTaxonomyLabelMaps(),
  ]);

  const statusLabel = (s: string) =>
    s === "ACTIVE" ? c.statusActive : s === "PROSPECT" ? c.statusProspect : c.statusInactive;

  const validBuckets: (CustomerBucketMeta["bucket"] | "all")[] = ["base", "growth", "opportunity", "all"];
  const currentBucket = validBuckets.includes(sp.bucket as CustomerBucketMeta["bucket"] | "all")
    ? (sp.bucket as CustomerBucketMeta["bucket"] | "all")
    : "base";
  const classified = classifyCustomers(customers);
  const bucketCounts = {
    base: classified.filter((item) => item.meta.bucket === "base").length,
    growth: classified.filter((item) => item.meta.bucket === "growth").length,
    opportunity: classified.filter((item) => item.meta.bucket === "opportunity").length,
    all: classified.length,
  };
  const filtered =
    currentBucket === "all"
      ? classified
      : classified.filter((item) => item.meta.bucket === currentBucket);

  const bucketLabel =
    currentBucket === "base" ? c.bucketBase
    : currentBucket === "growth" ? c.bucketGrowth
    : currentBucket === "opportunity" ? c.bucketOpportunity
    : c.bucketAll;
  const bucketDesc = c.bucketDesc.replace("{bucket}", bucketLabel).replace("{count}", String(filtered.length));

  const growthProbabilityOrder: GrowthProbability[] = ["P80", "P50", "P20"];
  const growthGroupLabel = (code: GrowthProbability) =>
    code === "P80" ? c.growthP80Group : code === "P50" ? c.growthP50Group : c.growthP20Group;

  function CustomerRow({ cust, meta }: { cust: (typeof customers)[number]; meta: CustomerBucketMeta }) {
    const bucketBadge =
      currentBucket === "all"
        ? meta.bucket === "base"
          ? c.bucketBase
          : meta.bucket === "growth"
            ? c.bucketGrowth
            : meta.bucket === "opportunity"
              ? c.bucketOpportunity
              : c.bucketOther
        : null;
    return (
      <ClickableRow key={cust.id} href={`/customers/${cust.id}`} className="hover:bg-slate-50/60">
        <td className="px-4 py-3">
          <span className="font-medium text-slate-900">{cust.name}</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {meta.isArr && <Badge tone="purple">{c.arrCustomer}</Badge>}
            {meta.bucket === "base" && meta.hasOpenOpportunities && (
              <Badge tone="amber">{c.secondaryGrowth}</Badge>
            )}
            {bucketBadge && <Badge tone="zinc">{bucketBadge}</Badge>}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{c.createdAt} {fmtDate(cust.createdAt, bcp47)}</div>
        </td>
        <td className="px-4 py-3">
          {cust.customerSegment ? (
            <span className="text-slate-700">{labelFromMap(labelMaps.CUSTOMER_SEGMENT, cust.customerSegment)}</span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
          {cust.icpTier && (
            <div className="text-[11px] text-slate-400 mt-0.5">{labelFromMap(labelMaps.ICP_TIER, cust.icpTier)}</div>
          )}
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
        <td className="px-4 py-3">
          {currentBucket === "growth" && meta.growthProbability ? (
            <Badge tone={opportunityStatusTone(meta.growthProbability)}>
              {opportunityStatusLabel(meta.growthProbability, bcp47 === "zh-CN" ? "zh" : "en")}
            </Badge>
          ) : (
            <Badge tone={statusTone(cust.status)}>{statusLabel(cust.status)}</Badge>
          )}
        </td>
      </ClickableRow>
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        title={c.title}
        desc={bucketDesc}
        actions={
          <div className="flex gap-2">
            <AddCustomerForm
              partners={partners}
              users={users}
              defaultPartnerId={sp.partner}
              defaultOpen={sp.add === "1"}
              segmentOptions={{
                customerSegment: segmentOptions,
                buyingTrigger: buyingTriggerOptions,
                entryPath: entryPathOptions,
                icpTier: icpTierOptions,
              }}
            />
            <CreateFromCrmButton entity="customer" />
          </div>
        }
      />
      <div className="px-8">
        <form className="flex flex-wrap gap-2 mb-4" method="get">
          <InstantSearchInput placeholder={c.searchPlaceholder} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm w-full sm:w-48" />
          <select name="status" defaultValue={sp.status ?? ""} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{c.allStatuses}</option>
            <option value="ACTIVE">{c.statusActive}</option>
            <option value="PROSPECT">{c.statusProspect}</option>
            <option value="INACTIVE">{c.statusInactive}</option>
          </select>
          <select name="segment" defaultValue={sp.segment ?? ""} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{c.allSegments}</option>
            {segmentOptions.map((opt) => (
              <option key={opt.code} value={opt.code}>{opt.label}</option>
            ))}
          </select>
          <select name="icpTier" defaultValue={sp.icpTier ?? ""} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
            <option value="">{c.allIcpTiers}</option>
            {icpTierOptions.map((opt) => (
              <option key={opt.code} value={opt.code}>{opt.label}</option>
            ))}
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
          <input type="hidden" name="bucket" value={currentBucket} />
          <button className="rounded-lg bg-slate-900 text-white px-4 py-1.5 text-sm hover:bg-slate-700">{m.common.filter}</button>
        </form>

        <CustomerBucketTabs
          current={currentBucket}
          tabs={[
            { key: "base", label: c.bucketBase, count: bucketCounts.base },
            { key: "growth", label: c.bucketGrowth, count: bucketCounts.growth },
            { key: "opportunity", label: c.bucketOpportunity, count: bucketCounts.opportunity },
            { key: "all", label: c.bucketAll, count: bucketCounts.all },
          ]}
          searchParams={{
            q: sp.q,
            status: sp.status,
            segment: sp.segment,
            icpTier: sp.icpTier,
            partner: sp.partner,
            owner: sp.owner,
            presales: sp.presales,
            unbound: sp.unbound,
          }}
        />

        {filtered.length === 0 ? (
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
                    <th className="px-4 py-2.5 font-medium">{c.colSegment}</th>
                    <th className="px-4 py-2.5 font-medium">{c.colIndustry}</th>
                    <th className="px-4 py-2.5 font-medium">{c.colRegion}</th>
                    <th className="px-4 py-2.5 font-medium">{c.colPartner}</th>
                    <th className="px-4 py-2.5 font-medium">{c.colContact}</th>
                    <th className="px-4 py-2.5 font-medium">{c.colOwner}</th>
                    <th className="px-4 py-2.5 font-medium">{c.colPresales}</th>
                    <th className="px-4 py-2.5 font-medium">{c.colStatus}</th>
                  </tr>
                </thead>
                {currentBucket === "growth" ? (
                  growthProbabilityOrder.map((code) => {
                    const groupItems = filtered.filter((item) => item.meta.growthProbability === code);
                    if (groupItems.length === 0) return null;
                    return (
                      <tbody key={code} className="divide-y divide-slate-50">
                        <tr className="bg-slate-50/80 text-xs text-slate-500">
                          <td colSpan={9} className="px-4 py-2 font-medium">{growthGroupLabel(code)}</td>
                        </tr>
                        {groupItems.map(({ customer: cust, meta }) => (
                          <CustomerRow key={cust.id} cust={cust} meta={meta} />
                        ))}
                      </tbody>
                    );
                  })
                ) : (
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map(({ customer: cust, meta }) => (
                      <CustomerRow key={cust.id} cust={cust} meta={meta} />
                    ))}
                  </tbody>
                )}
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
