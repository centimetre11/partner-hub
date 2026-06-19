import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { getKnowhowConfigStatus } from "@/lib/knowhow";
import { isSuperAdmin } from "@/lib/user-roles";
import { getServerI18n } from "@/lib/server-i18n";
import { KnowhowSearchPanel } from "./knowhow-search-panel";

export default async function KnowhowPage() {
  const user = await requireUser();
  const { messages: m } = await getServerI18n();
  const status = await getKnowhowConfigStatus();
  const admin = isSuperAdmin(user);

  return (
    <div className="pb-16">
      <PageHeader title={m.knowhow.title} desc={m.knowhow.desc} />
      <AiCenterNav />
      <div className="px-8 max-w-4xl">
        <KnowhowSearchPanel
          configured={status.configured}
          isAdmin={admin}
          labels={{
            query: m.knowhow.query,
            queryPlaceholder: m.knowhow.queryPlaceholder,
            search: m.knowhow.search,
            filters: m.knowhow.filters,
            businessDomain: m.knowhow.businessDomain,
            project: m.knowhow.project,
            contract: m.knowhow.contract,
            tags: m.knowhow.tags,
            tagsPlaceholder: m.knowhow.tagsPlaceholder,
            quality: m.knowhow.quality,
            qualityPlaceholder: m.knowhow.qualityPlaceholder,
            nodePath: m.knowhow.nodePath,
            nodePathPlaceholder: m.knowhow.nodePathPlaceholder,
            industry: m.knowhow.industry,
            industryPlaceholder: m.knowhow.industryPlaceholder,
            topK: m.knowhow.topK,
            notConfigured: m.knowhow.notConfigured,
            notConfiguredAdmin: m.knowhow.notConfiguredAdmin,
            noResults: m.knowhow.noResults,
            score: m.knowhow.score,
            viewDetail: m.knowhow.viewDetail,
            backToResults: m.knowhow.backToResults,
            searching: m.knowhow.searching,
            openSource: m.knowhow.openSource,
            detailFallback: m.knowhow.detailFallback,
            noContent: m.knowhow.noContent,
          }}
        />
      </div>
    </div>
  );
}
