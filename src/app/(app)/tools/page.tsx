import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { BUILTIN_TOOL_CATEGORIES, getToolAvailability } from "@/lib/tools-registry";
import { getKmsConfigStatus } from "@/lib/kms";
import { isKnowhowConfigured } from "@/lib/knowhow";
import { isWebSearchAvailable, webSearchBackendLabel } from "@/lib/web-search";
import { isSuperAdmin } from "@/lib/user-roles";
import { getServerI18n } from "@/lib/server-i18n";

export default async function ToolsPage() {
  const user = await requireUser();
  const { messages: m } = await getServerI18n();
  const equippedAgents = await db.agent.findMany({
    where: { isTemplate: false },
    select: { skills: true },
  });
  const kmsStatus = await getKmsConfigStatus(user.id);
  const kmsConfigured = kmsStatus.configured;
  const knowhowConfigured = await isKnowhowConfigured();
  const usedToolNames = new Set<string>();
  for (const a of equippedAgents) {
    for (const name of JSON.parse(a.skills || "[]") as string[]) {
      usedToolNames.add(name);
    }
  }

  const webSearchReady = await isWebSearchAvailable();
  const searchBackend = webSearchReady ? await webSearchBackendLabel() : null;
  const admin = isSuperAdmin(user);
  const readyCount = BUILTIN_TOOL_CATEGORIES.flatMap((c) => c.tools).filter(
    (t) => getToolAvailability(t.name, { kmsConfigured, knowhowConfigured, webSearchReady }) === "ready"
  ).length;
  const totalCount = BUILTIN_TOOL_CATEGORIES.flatMap((c) => c.tools).length;

  return (
    <div className="pb-16">
      <PageHeader
        title={m.tools.title}
        desc={m.tools.descLong}
        actions={
          <div className="flex items-center gap-2 text-xs">
            <Badge tone={webSearchReady ? "green" : "amber"}>
              {webSearchReady
                ? `${m.tools.available.replace("{n}", String(readyCount)).replace("{m}", String(totalCount))} (${searchBackend})`
                : `${m.tools.available.replace("{n}", String(readyCount)).replace("{m}", String(totalCount))} (${m.tools.backendMissingShort})`}
            </Badge>
          </div>
        }
      />
      <AiCenterNav />
      <div className="px-8 max-w-5xl space-y-6">
        {!webSearchReady && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-medium">{m.tools.webSearchBanner}</span>{" "}
            {admin ? m.tools.webSearchBannerAdmin : m.tools.webSearchBannerNonAdmin}.{" "}
            {m.tools.webSearchBannerModels}
          </div>
        )}
        {!kmsConfigured && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            <span className="font-medium">{m.tools.kmsBanner}</span>{" "}
            <a href="/account" className="underline font-medium">{m.tools.kmsBannerLink}</a>{" "}
            {m.tools.kmsBannerDetail}
          </div>
        )}
        {kmsConfigured && kmsStatus.fallback && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {m.tools.kmsFallbackBanner}
          </div>
        )}

        {!knowhowConfigured && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            <span className="font-medium">{m.tools.knowhowBanner}</span>{" "}
            {admin ? m.tools.knowhowBannerAdmin : m.tools.knowhowBannerNonAdmin}
          </div>
        )}

        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-3 text-sm text-indigo-900/80">
          <span className="font-medium">{m.tools.scenarioPriority}</span> {m.tools.scenarioBody}
        </div>

        {BUILTIN_TOOL_CATEGORIES.map((cat) => (
          <section key={cat.id}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{cat.icon}</span>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-zinc-800">{cat.label}</h2>
                <p className="text-xs text-zinc-400">{cat.desc}</p>
              </div>
              <Badge tone="zinc">{cat.tools.length}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {cat.tools.map((tool) => {
                const status = getToolAvailability(tool.name, { kmsConfigured, knowhowConfigured, webSearchReady });
                return (
                  <div
                    key={tool.name}
                    className={`bg-white rounded-xl border p-4 transition-colors ${
                      status === "ready" ? "border-zinc-200/80 hover:border-indigo-200" : "border-zinc-200/60 opacity-80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-sm font-semibold text-zinc-900">{tool.label}</div>
                          {tool.priority === "core" && <Badge tone="indigo">{m.tools.core}</Badge>}
                        </div>
                        <div className="text-xs text-zinc-400 font-mono mt-0.5">{tool.name}</div>
                        <p className="text-xs text-zinc-500 mt-2 leading-relaxed">{tool.desc}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge tone={status === "ready" ? "green" : status === "needs_web_search" || status === "needs_kms" || status === "needs_knowhow" ? "amber" : "zinc"}>
                          {status === "ready"
                            ? m.tools.verified
                            : status === "needs_web_search"
                              ? m.tools.needsWebSearch
                              : status === "needs_kms"
                                ? m.tools.needsKms
                                : status === "needs_knowhow"
                                  ? m.tools.needsKnowhow
                                  : m.tools.unknown}
                        </Badge>
                        {usedToolNames.has(tool.name) && <Badge tone="blue">{m.tools.equipped}</Badge>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
