import { ClickableCard } from "@/components/clickable-nav";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader, EmptyState, fmtDate, ScoreBar, TierBadge } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import { AddCustomerForm } from "./add-customer-form";
import { CreateFromCrmButton } from "@/components/create-from-crm-button";
import { END_CUSTOMER_WHERE } from "@/lib/customer-filters";
import { nameContainsWhere } from "@/lib/name-search";
import { InstantSearchInput } from "@/components/instant-search-input";
import { SearchableSelect } from "@/components/searchable-select";
import { getTaxonomyOptionsMany, loadTaxonomyLabelMaps, labelFromMap } from "@/lib/taxonomy";
import { classifyCustomers, type CustomerBucketMeta, type GrowthProbability } from "@/lib/customer-bucket";
import { toArrContractInput } from "@/lib/arr";
import { OPEN_OPPORTUNITY_STATUSES, opportunityStatusLabel } from "@/lib/opportunity-status";
import { PARTNER_TIERS, resolveCustomerTier, splitByTierFocus, countTiersFromItems } from "@/lib/tier";
import { TierCFold } from "@/components/tier-c-fold";
import { TierCountSummary } from "@/components/tier-count-summary";
import type { ReactNode } from "react";

function statusTone(status: string): "green" | "blue" | "zinc" {
  if (status === "ACTIVE") return "green";
  if (status === "PROSPECT") return "blue";
  return "zinc";
}

function probabilityValue(code: GrowthProbability): number {
  switch (code) {
    case "P80":
      return 80;
    case "P50":
      return 50;
    case "P20":
      return 20;
  }
}

function columnTone(tone: "green" | "amber" | "blue", over = false) {
  if (tone === "green") {
    return over
      ? "border-emerald-400 bg-emerald-50/80 ring-2 ring-emerald-200"
      : "border-emerald-200/80 bg-emerald-50/40";
  }
  if (tone === "amber") {
    return over
      ? "border-amber-400 bg-amber-50/80 ring-2 ring-amber-200"
      : "border-amber-200/80 bg-amber-50/40";
  }
  return over
    ? "border-sky-400 bg-sky-50/80 ring-2 ring-sky-200"
    : "border-sky-200/80 bg-sky-50/40";
}

function headerBadge(tone: "green" | "amber" | "blue") {
  if (tone === "green") return "bg-emerald-700 text-white";
  if (tone === "amber") return "bg-amber-600 text-white";
  return "bg-sky-700 text-white";
}

function customerTierRank(cust: { tier?: string | null; icpTier?: string | null }): number {
  const t = resolveCustomerTier(cust);
  if (t === "A") return 0;
  if (t === "B") return 1;
  if (t === "C") return 2;
  return 3;
}

function CustomerBucketColumn({
  index,
  title,
  count,
  desc,
  tone,
  emptyText,
  tierCounts,
  children,
}: {
  index: number;
  title: string;
  count: number;
  desc: string;
  tone: "green" | "amber" | "blue";
  emptyText: string;
  tierCounts: { A: number; B: number; C: number; unset: number };
  children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col min-w-[260px] w-[min(100%,320px)] sm:min-w-[280px] lg:min-w-0 lg:flex-1 rounded-xl border ${columnTone(
        tone,
      )} max-h-[calc(100vh-14rem)]`}
    >
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${headerBadge(tone)}`}
          >
            {index}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-800 truncate">
              {title}
              <span className="ml-1.5 text-xs font-normal text-slate-500 tabular-nums">{count}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
              <div className="text-[11px] text-slate-500 truncate min-w-0" title={desc}>
                {desc}
              </div>
              {count > 0 ? <TierCountSummary counts={tierCounts} className="shrink-0" /> : null}
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-2 min-h-[4rem]">
        {count === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white/60 px-3 py-6 text-center text-xs text-slate-400">
            {emptyText}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

type CustomerBucketSearchParams = {
  q?: string;
  status?: string;
  partner?: string;
  owner?: string;
  presales?: string;
  satisfaction?: string;
  unbound?: string;
  add?: string;
  segment?: string;
  tier?: string;
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<CustomerBucketSearchParams>;
}) {
  await requireUser();
  const { messages: m, bcp47 } = await getServerI18n();
  const c = m.customers;
  const pe = m.profileEditor;
  const sp = await searchParams;
  const nameFilter = nameContainsWhere(sp.q);
  const tierFilter = sp.tier?.trim().toUpperCase();
  const legacyIcp =
    tierFilter === "A" ? "PRIMARY" : tierFilter === "B" ? "NURTURE" : tierFilter === "C" ? "WATCH" : null;

  const listWhere = {
    ...END_CUSTOMER_WHERE,
    ...(nameFilter ? { name: nameFilter } : {}),
    ...(sp.status ? { status: sp.status } : {}),
    ...(sp.segment ? { customerSegment: sp.segment } : {}),
    ...(tierFilter && PARTNER_TIERS.includes(tierFilter as (typeof PARTNER_TIERS)[number])
      ? {
          OR: [
            { tier: tierFilter },
            ...(legacyIcp ? [{ tier: null, icpTier: legacyIcp }] : []),
          ],
        }
      : {}),
    ...(sp.owner ? { ownerId: sp.owner } : {}),
    ...(sp.presales ? { presalesUserId: sp.presales } : {}),
    ...(sp.satisfaction ? { satisfactionUserId: sp.satisfaction } : {}),
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
            productMaintRatePct: true,
            childContracts: {
              where: { contractType: "PRODUCT_MAINTENANCE", status: "ACTIVE" },
              select: { id: true },
              take: 1,
            },
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
    getTaxonomyOptionsMany(["CUSTOMER_SEGMENT", "BUYING_TRIGGER", "ENTRY_PATH"]),
    loadTaxonomyLabelMaps(),
  ]);

  const segmentOptions = taxonomy.CUSTOMER_SEGMENT ?? [];
  const buyingTriggerOptions = taxonomy.BUYING_TRIGGER ?? [];
  const entryPathOptions = taxonomy.ENTRY_PATH ?? [];

  const statusLabel = (s: string) =>
    s === "ACTIVE" ? c.statusActive : s === "PROSPECT" ? c.statusProspect : c.statusInactive;

  const classified = classifyCustomers(
    bucketRows.map((row) => ({
      ...row,
      contracts: row.contracts.map((ct) => toArrContractInput(ct)),
    }))
  );
  const boardItems = classified.filter((item) => item.meta.bucket !== "other");
  const boardIds = boardItems.map((item) => item.customer.id);
  const metaById = new Map(boardItems.map((item) => [item.customer.id, item.meta]));

  const customers = boardIds.length
    ? await db.customer.findMany({
        where: { id: { in: boardIds } },
        include: {
          partnerLinks: { include: { partner: { select: { id: true, name: true } } } },
          owner: { select: { name: true } },
          presalesUser: { select: { name: true } },
          satisfactionUser: { select: { name: true } },
          contacts: {
            select: { name: true, title: true, email: true, phone: true, contactInfo: true },
            take: 1,
            orderBy: { updatedAt: "desc" },
          },
        },
      })
    : [];
  const customerById = new Map(customers.map((cust) => [cust.id, cust]));
  const items = boardIds
    .map((id) => {
      const cust = customerById.get(id);
      const meta = metaById.get(id);
      if (!cust || !meta) return null;
      return { customer: cust, meta };
    })
    .filter((x): x is { customer: (typeof customers)[number]; meta: CustomerBucketMeta } => !!x);

  type BoardBucket = "base" | "growth" | "opportunity";
  const columns: {
    key: BoardBucket;
    index: number;
    title: string;
    desc: string;
    tone: "green" | "amber" | "blue";
  }[] = [
    { key: "base", index: 1, title: c.bucketBase, desc: c.bucketBaseDesc, tone: "green" },
    { key: "growth", index: 2, title: c.bucketGrowth, desc: c.bucketGrowthDesc, tone: "amber" },
    { key: "opportunity", index: 3, title: c.bucketOpportunity, desc: c.bucketOpportunityDesc, tone: "blue" },
  ];

  const byBucket: Record<BoardBucket, typeof items> = {
    base: items.filter((item) => item.meta.bucket === "base"),
    growth: items.filter((item) => item.meta.bucket === "growth"),
    opportunity: items.filter((item) => item.meta.bucket === "opportunity"),
  };

  function CustomerCard({
    cust,
    meta,
  }: {
    cust: (typeof customers)[number];
    meta: CustomerBucketMeta;
  }) {
    const segmentLabel = cust.customerSegment
      ? labelFromMap(labelMaps.CUSTOMER_SEGMENT, cust.customerSegment)
      : null;
    const resolvedTier = resolveCustomerTier(cust);
    const region = [cust.city, cust.country].filter(Boolean).join(" · ") || null;
    const partnerNames = cust.partnerLinks.map((l) => l.partner.name).join(", ") || null;
    const summaryBits = [
      segmentLabel,
      cust.industry,
      region,
      partnerNames ? `${c.colPartner}: ${partnerNames}` : c.noPartner,
      meta.nextOpportunityName
        ? `${c.openOpportunityCount.replace("{n}", String(meta.openOpportunityCount))} · ${meta.nextOpportunityName}`
        : null,
    ].filter(Boolean);

    return (
      <ClickableCard
        href={`/customers/${cust.id}`}
        className="rounded-lg border border-slate-200/80 bg-white shadow-sm p-3 hover:border-slate-300"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold text-sm text-slate-900 min-w-0 break-words">{cust.name}</span>
          <div className="flex items-center gap-1 shrink-0">
            <TierBadge tier={resolvedTier} />
            {meta.isArr && <Badge tone="purple">{c.arrCustomer}</Badge>}
            {meta.bucket === "base" && meta.hasOpenOpportunities && (
              <Badge tone="amber">{c.secondaryGrowth}</Badge>
            )}
            {meta.bucket === "growth" && meta.growthProbability && (
              <Badge tone="blue">
                {opportunityStatusLabel(meta.growthProbability, bcp47 === "zh-CN" ? "zh" : "en")}
              </Badge>
            )}
          </div>
        </div>
        <div className="text-[11px] text-slate-500 mt-1.5 truncate">
          {fmtDate(cust.createdAt, bcp47)}
          {cust.owner?.name ? ` · ${cust.owner.name}` : ""}
          {cust.presalesUser?.name ? ` · ${cust.presalesUser.name}` : ""}
          {cust.satisfactionUser?.name ? ` · ${cust.satisfactionUser.name}` : ""}
        </div>
        <div className="text-[11px] text-slate-500 mt-1 truncate">
          {summaryBits.join(" · ") || "—"}
        </div>
        {meta.growthProbability ? (
          <div className="mt-2 w-full max-w-[7rem]">
            <ScoreBar score={probabilityValue(meta.growthProbability)} />
          </div>
        ) : (
          <div className="mt-2">
            <Badge tone={statusTone(cust.status)}>{statusLabel(cust.status)}</Badge>
          </div>
        )}
      </ClickableCard>
    );
  }

  return (
    <div className="pb-16">
      <PageHeader
        title={c.title}
        desc={c.desc.replace("{count}", String(items.length))}
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
              }}
            />
            <CreateFromCrmButton entity="customer" />
          </div>
        }
      />
      <div className="px-8">
        <form className="flex flex-wrap gap-2 mb-4" method="get">
          <InstantSearchInput
            placeholder={c.searchPlaceholder}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm w-full sm:w-48"
          />
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{c.allStatuses}</option>
            <option value="ACTIVE">{c.statusActive}</option>
            <option value="PROSPECT">{c.statusProspect}</option>
            <option value="INACTIVE">{c.statusInactive}</option>
          </select>
          <select
            name="segment"
            defaultValue={sp.segment ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{c.allSegments}</option>
            {segmentOptions.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            name="tier"
            defaultValue={sp.tier ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{c.allTiers}</option>
            <option value="A">{pe.tierA}</option>
            <option value="B">{pe.tierB}</option>
            <option value="C">{pe.tierC}</option>
          </select>
          <SearchableSelect
            name="partner"
            defaultValue={sp.partner ?? ""}
            emptyLabel={c.allPartners}
            fullWidth={false}
            className="w-44 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
            aria-label={c.allPartners}
            options={partners.map((p) => ({ value: p.id, label: p.name }))}
          />
          <select
            name="owner"
            defaultValue={sp.owner ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{c.allSalesOwners}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            name="presales"
            defaultValue={sp.presales ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{c.allPresalesOwners}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            name="satisfaction"
            defaultValue={sp.satisfaction ?? ""}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
          >
            <option value="">{c.allSatisfactionOwners}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 px-2">
            <input type="checkbox" name="unbound" value="1" defaultChecked={sp.unbound === "1"} />
            {c.unboundOnly}
          </label>
          <button className="rounded-lg bg-slate-900 text-white px-4 py-1.5 text-sm hover:bg-slate-700">
            {m.common.filter}
          </button>
        </form>

        {items.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{m.common.tier}</span>
            <TierCountSummary
              counts={countTiersFromItems(items, (item) => resolveCustomerTier(item.customer))}
            />
          </div>
        ) : null}

        {items.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm">
            <EmptyState text={c.empty} />
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 items-stretch">
            {columns.map((col) => {
              const colItems = [...byBucket[col.key]].sort(
                (a, b) => customerTierRank(a.customer) - customerTierRank(b.customer),
              );
              const { primary, folded } = splitByTierFocus(colItems, (item) =>
                resolveCustomerTier(item.customer),
              );
              const forceOpenTierC = String(sp.tier ?? "").trim().toUpperCase() === "C";
              const tierCounts = countTiersFromItems(colItems, (item) =>
                resolveCustomerTier(item.customer),
              );
              return (
                <CustomerBucketColumn
                  key={col.key}
                  index={col.index}
                  title={col.title}
                  count={colItems.length}
                  desc={col.desc}
                  tone={col.tone}
                  emptyText={c.empty}
                  tierCounts={tierCounts}
                >
                  {primary.map(({ customer: cust, meta }) => (
                    <CustomerCard key={cust.id} cust={cust} meta={meta} />
                  ))}
                  <TierCFold
                    count={folded.length}
                    storageKey="customers-board-show-c"
                    forceOpen={forceOpenTierC}
                    label={m.common.tierCFoldLabel.replace("{n}", String(folded.length))}
                    hint={m.common.tierCFoldHint}
                  >
                    {folded.map(({ customer: cust, meta }) => (
                      <CustomerCard key={cust.id} cust={cust} meta={meta} />
                    ))}
                  </TierCFold>
                </CustomerBucketColumn>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
