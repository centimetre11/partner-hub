type SearchParams = {
  q?: string;
  status?: string;
  segment?: string;
  icpTier?: string;
  partner?: string;
  owner?: string;
  presales?: string;
  unbound?: string;
};

type BucketTab = {
  key: string;
  label: string;
  count: number;
};

function buildTabHref(sp: SearchParams, bucket: string): string {
  const params = new URLSearchParams();
  if (sp.q) params.set("q", sp.q);
  if (sp.status) params.set("status", sp.status);
  if (sp.segment) params.set("segment", sp.segment);
  if (sp.icpTier) params.set("icpTier", sp.icpTier);
  if (sp.partner) params.set("partner", sp.partner);
  if (sp.owner) params.set("owner", sp.owner);
  if (sp.presales) params.set("presales", sp.presales);
  if (sp.unbound) params.set("unbound", sp.unbound);
  if (bucket !== "base") params.set("bucket", bucket);
  const qs = params.toString();
  return qs ? `/customers?${qs}` : "/customers";
}

export function CustomerBucketTabs({
  current,
  tabs,
  searchParams,
}: {
  current: string;
  tabs: BucketTab[];
  searchParams: SearchParams;
}) {
  return (
    <div className="flex gap-1 border-b border-slate-200 mb-4">
      {tabs.map((tab) => {
        const active = current === tab.key;
        return (
          <a
            key={tab.key}
            href={buildTabHref(searchParams, tab.key)}
            className={[
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              active
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300",
            ].join(" ")}
          >
            {tab.label}
            <span className={["ml-1.5 text-xs tabular-nums", active ? "text-slate-500" : "text-slate-400"].join(" ")}>
              {tab.count}
            </span>
          </a>
        );
      })}
    </div>
  );
}
