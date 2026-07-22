import { NavLink } from "@/components/nav-link";
import { ClickableCard } from "@/components/clickable-nav";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, EmptyState, fmtDate, ScoreBar } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import { AddCustomerForm } from "./add-customer-form";
import { CreateFromCrmButton } from "@/components/create-from-crm-button";
import { END_CUSTOMER_WHERE } from "@/lib/customer-filters";
import { nameContainsWhere } from "@/lib/name-search";
import { InstantSearchInput } from "@/components/instant-search-input";
import { getTaxonomyOptionsMany, loadTaxonomyLabelMaps, labelFromMap } from "@/lib/taxonomy";
import { CustomerBucketTabs } from "@/components/customer-bucket-tabs";
import { classifyCustomers, type CustomerBucketMeta, type GrowthProbability } from "@/lib/customer-bucket";
import { OPEN_OPPORTUNITY_STATUSES, opportunityStatusLabel, opportunityStatusTone } from "@/lib/opportunity-status";
import { ListPagination } from "@/components/list-pagination";
import { parseListPage } from "@/lib/list-pagination";

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
  page?: string;
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
  const { page, take, skip } = parseListPage(sp.page);

  const listWhere = {
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
  };

  const [bucketRows, partners, users, taxonomy, labelMaps] = await Promise.all([
    db.customer.findMany({
      where: listWhere,
      select: {
        id: true,
        status: true,
        updatedAt: true,
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
          select: { id: true, status: true, name: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.partner.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    getTaxonomyOptionsMany(["CUSTOMER_SEGMENT", "ICP_TIER", "BUYING_TRIGGER", "ENTRY_PATH"]),
    loadTaxonomyLabelMaps(),
  ]);

  const segmentOptions = taxonomy.CUSTOMER_SEGMENT ?? [];
  const icpTierOptions = taxonomy.ICP_TIER ?? [];
  const buyingTriggerOptions = taxonomy.BUYING_TRIGGER ?? [];
  const entryPathOptions = taxonomy.ENTRY_PATH ?? [];

  const statusLabel = (s: string) =>
    s === "ACTIVE" ? c.statusActive : s === "PROSPECT" ? c.statusProspect : c.statusInactive;

  const validBuckets: (CustomerBucketMeta["bucket"] | "all")[] = ["base", "growth", "opportunity", "all"];
  const currentBucket = validBuckets.includes(sp.bucket as CustomerBucketMeta["bucket"] | "all")
    ? (sp.bucket as CustomerBucketMeta["bucket"] | "all")
    : "base";
  const classified = classifyCustomers(bucketRows);
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

  const pageSlice = filtered.slice(skip, skip + take);
  const pageIds = pageSlice.map((item) => item.customer.id);
  const metaById = new Map(pageSlice.map((item) => [item.customer.id, item.meta]));

  const customers = pageIds.length
    ? await db.customer.findMany({
        where: { id: { in: pageIds } },
        include: {
          partnerLinks: { include: { partner: { select: { id: true, name: true } } } },
          owner: { select: { name: true } },
          presalesUser: { select: { name: true } },
          contacts: { select: { name: true, title: true, contactInfo: true }, take: 1, orderBy: { updatedAt: "desc" } },
        },
      })
    : [];
  const customerById = new Map(customers.map((cust) => [cust.id, cust]));
  const pageItems = pageIds
    .map((id) => {
      const cust = customerById.get(id);
      const meta = metaById.get(id);
      if (!cust || !meta) return null;
      return { customer: cust, meta };
    })
    .filter((x): x is { customer: (typeof customers)[number]; meta: CustomerBucketMeta } => !!x);

  const bucketLabel =
    currentBucket === "base" ? c.bucketBase
    : currentBucket === "growth" ? c.bucketGrowth
    : currentBucket === "opportunity" ? c.bucketOpportunity
    : c.bucketAll;
  const bucketDesc = c.bucketDesc.replace("{bucket}", bucketLabel).replace("{count}", String(filtered.length));

  const growthProbabilityOrder: GrowthProbability[] = ["P80", "P50", "P20"];
  const growthGroupLabel = (code: GrowthProbability) =>
    code === "P80" ? c.growthP80Group : code === "P50" ? c.growthP50Group : c.growthP20Group;

  function probabilityValue(code: GrowthProbability): number {
    switch (code) {
      case "P80": return 80;
      case "P50": return 50;
      case "P20": return 20;
    }
  }

  function CustomerCard({ cust, meta }: { cust: (typeof customers)[number]; meta: CustomerBucketMeta }) {
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
    const segmentLabel = cust.customerSegment
      ? labelFromMap(labelMaps.CUSTOMER_SEGMENT, cust.customerSegment)
      : null;
    const icpLabel = cust.icpTier ? labelFromMap(labelMaps.ICP_TIER, cust.icpTier) : null;
    const region = [cust.city, cust.country].filter(Boolean).join(" · ") || null;
    const partnerNames = cust.partnerLinks.map((l) => l.partner.name).join(", ") || null;
    return (
      <ClickableCard
        href={`/customers/${cust.id}`}
        className="rounded-lg border border-slate-200/80 bg-white shadow-sm p-3 hover:border-slate-300 hover:shadow-md transition-shadow"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold text-sm text-slate-900 min-w-0 break-words">{cust.name}</span>
          <div className="flex flex-wrap justify-end gap-1 shrink-0 max-w-[50%]">
            {meta.isArr && <Badge tone="purple">{c.arrCustomer}</Badge>}
            {meta.bucket === "base" && meta.hasOpenOpportunities && (
              <Badge tone="amber">{c.secondaryGrowth}</Badge>
            )}
            {bucketBadge && <Badge tone="zinc">{bucketBadge}</Badge>}
          </div>
        </div>
        <div className="text-[11px] text-slate-500 mt-1.5">
          {c.createdAt} {fmtDate(cust.createdAt, bcp47)}
        </div>
        <div className="text-[11px] text-slate-500 mt-1 truncate">
          {segmentLabel ? <span className="text-slate-700">{segmentLabel}</span> : <span className="text-slate-300">—</span>}
          {icpLabel && <span className="text-slate-400"> · {icpLabel}</span>}
        </div>
        <div className="text-[11px] text-slate-500 mt-1 truncate">
          {cust.industry ?? "—"}
          {region && <span> · {region}</span>}
        </div>
        <div className="text-[11px] text-slate-500 mt-1 truncate">
          {c.colPartner}: {partnerNames ?? c.noPartner}
        </div>
        <div className="text-[11px] text-slate-500 mt-1 truncate">
          {c.colOwner}: {cust.owner?.name ?? "—"} · {c.colPresales}: {cust.presalesUser?.name ?? "—"}
        </div>
        {meta.nextOpportunityName && (
          <div className="text-[11px] text-slate-500 mt-1 truncate">
            {c.openOpportunityCount.replace("{n}", String(meta.openOpportunityCount))}
            {meta.openOpportunityCount === 1 ? "" : " · "}
            {meta.nextOpportunityName}
          </div>
        )}
        <div className="mt-2">
          {currentBucket === "growth" && meta.growthProbability ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <ScoreBar score={probabilityValue(meta.growthProbability)} />
              </div>
              <span className="text-xs text-slate-500 shrink-0">
                {opportunityStatusLabel(meta.growthProbability, bcp47 === "zh-CN" ? "zh" : "en")}
              </span>
            </div>
          ) : (
            <Badge tone={statusTone(cust.status)}>{statusLabel(cust.status)}</Badge>
          )}
        </div>
      </ClickableCard>
    );
  }

  const filterParams = {
    q: sp.q,
    status: sp.status,
    segment: sp.segment,
    icpTier: sp.icpTier,
    partner: sp.partner,
    owner: sp.owner,
    presales: sp.presales,
    unbound: sp.unbound,
    bucket: currentBucket === "base" ? undefined : currentBucket,
  };

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

        {pageItems.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm">
            <EmptyState text={c.empty} />
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-4 overflow-hidden">
            {currentBucket === "growth" ? (
              growthProbabilityOrder.map((code) => {
                const groupItems = pageItems.filter((item) => item.meta.growthProbability === code);
                if (groupItems.length === 0) return null;
                return (
                  <div key={code} className="mb-5 last:mb-0">
                    <div className="flex items-center gap-2 px-2 py-1.5 mb-2 bg-slate-50/80 rounded-md">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white bg-slate-600">
                        {code === "P80" ? "3" : code === "P50" ? "2" : "1"}
                      </span>
                      <span className="text-xs font-semibold text-slate-600">{growthGroupLabel(code)}</span>
                      <span className="text-xs text-slate-400 tabular-nums">{groupItems.length}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {groupItems.map(({ customer: cust, meta }) => (
                        <CustomerCard key={cust.id} cust={cust} meta={meta} />
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {pageItems.map(({ customer: cust, meta }) => (
                  <CustomerCard key={cust.id} cust={cust} meta={meta} />
                ))}
              </div>
            )}
            <ListPagination
              pathname="/customers"
              searchParams={filterParams}
              page={page}
              total={filtered.length}
              pageSize={take}
              labels={{
                prevPage: m.common.prevPage,
                nextPage: m.common.nextPage,
                pageOf: m.common.pageOf,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
