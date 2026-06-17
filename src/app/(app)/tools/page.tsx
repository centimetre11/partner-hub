import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { BUILTIN_TOOL_CATEGORIES, getToolAvailability } from "@/lib/tools-registry";
import { isWebSearchAvailable, webSearchBackendLabel } from "@/lib/web-search";
import { isSuperAdmin } from "@/lib/user-roles";

export default async function ToolsPage() {
  const user = await requireUser();
  const equippedAgents = await db.agent.findMany({
    where: { isTemplate: false },
    select: { skills: true },
  });
  const kmsCred = await db.userKmsCredential.findUnique({ where: { userId: user.id } });
  const kmsConfigured = !!kmsCred?.accessToken;
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
    (t) => getToolAvailability(t.name, { kmsConfigured, webSearchReady }) === "ready"
  ).length;
  const totalCount = BUILTIN_TOOL_CATEGORIES.flatMap((c) => c.tools).length;

  return (
    <div className="pb-16">
      <PageHeader
        title="Tool Kit"
        desc="Tested Agent capability units—Middle East partner expansion first: profiles, LinkedIn, news, todos, knowledge base"
        actions={
          <div className="flex items-center gap-2 text-xs">
            <Badge tone={webSearchReady ? "green" : "amber"}>
              {webSearchReady
                ? `${readyCount}/${totalCount} available (${searchBackend})`
                : `${readyCount}/${totalCount} available (web search model missing)`}
            </Badge>
          </div>
        }
      />
      <AiCenterNav />
      <div className="px-8 max-w-5xl space-y-6">
        {!webSearchReady && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-medium">LinkedIn search / news search / sentiment scan require a web-enabled LLM.</span>
            Add and <strong>enable</strong> a web-capable model in{" "}
            {admin ? (
              <>Team Settings → LLM Management Center</>
            ) : (
              <>LLM Management Center (ask a Super Admin)</>
            )}
            :{" "}
            <strong>Kimi (moonshot)</strong> or <strong>Volcano Engine</strong> (tools include{" "}
            <code className="text-xs bg-amber-100 px-1 rounded">web_search</code>
            ). The system auto-selects from <strong>all enabled</strong> configs—it does not have to be the default model.
          </div>
        )}
        {!kmsConfigured && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            <span className="font-medium">Reading KMS requires a personal access token.</span>
            Go to <a href="/settings/kms" className="underline font-medium">KMS document access</a> to enter it once; after saving, the{" "}
            <code className="text-xs bg-indigo-100 px-1 rounded">read_kms</code> tool becomes available.
          </div>
        )}

        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-3 text-sm text-indigo-900/80">
          <span className="font-medium">Scenario priority:</span>
          Monitoring radar → linkedin_search + web_search + add_timeline_event;
          Pre-meeting brief → get_partner + search_knowledge + create_document;
          Stalled partner wake-up → search_partners + create_todo.
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
                const status = getToolAvailability(tool.name, { kmsConfigured, webSearchReady });
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
                          {tool.priority === "core" && <Badge tone="indigo">Core</Badge>}
                        </div>
                        <div className="text-xs text-zinc-400 font-mono mt-0.5">{tool.name}</div>
                        <p className="text-xs text-zinc-500 mt-2 leading-relaxed">{tool.desc}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge tone={status === "ready" ? "green" : status === "needs_web_search" || status === "needs_kms" ? "amber" : "zinc"}>
                          {status === "ready" ? "Verified" : status === "needs_web_search" ? "Needs web search" : status === "needs_kms" ? "Needs KMS token" : "Unknown"}
                        </Badge>
                        {usedToolNames.has(tool.name) && <Badge tone="blue">Equipped</Badge>}
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
