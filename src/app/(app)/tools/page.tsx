import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { BUILTIN_TOOL_CATEGORIES, getToolAvailability } from "@/lib/tools-registry";
import { isWebSearchAvailable, webSearchBackendLabel } from "@/lib/web-search";

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
  const readyCount = BUILTIN_TOOL_CATEGORIES.flatMap((c) => c.tools).filter(
    (t) => getToolAvailability(t.name, { kmsConfigured, webSearchReady }) === "ready"
  ).length;
  const totalCount = BUILTIN_TOOL_CATEGORIES.flatMap((c) => c.tools).length;

  return (
    <div className="pb-16">
      <PageHeader
        title="工具背包"
        desc="经测试可用的 Agent 能力单元——中东伙伴拓展场景优先：档案、领英、新闻、待办、知识库"
        actions={
          <div className="flex items-center gap-2 text-xs">
            <Badge tone={webSearchReady ? "green" : "amber"}>
              {webSearchReady
                ? `${readyCount}/${totalCount} 可用（${searchBackend}）`
                : `${readyCount}/${totalCount} 可用（缺模型联网搜索）`}
            </Badge>
          </div>
        }
      />
      <AiCenterNav />
      <div className="px-8 max-w-5xl space-y-6">
        {!webSearchReady && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-medium">领英搜索 / 新闻搜索 / 舆情扫描需要支持联网的大模型。</span>
            请在「团队设置 → 大模型管理中心」配置 <strong>Kimi（moonshot）</strong> 或{" "}
            <strong>火山引擎</strong>（extra.tools 含 <code className="text-xs bg-amber-100 px-1 rounded">web_search</code>
            ），然后重启服务。
          </div>
        )}
        {!kmsConfigured && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            <span className="font-medium">读取 KMS 需要个人访问令牌。</span>
            请到 <a href="/settings" className="underline font-medium">团队设置 → KMS 文档访问</a> 填写一次，保存后{" "}
            <code className="text-xs bg-indigo-100 px-1 rounded">read_kms</code> 工具即可使用。
          </div>
        )}

        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-3 text-sm text-indigo-900/80">
          <span className="font-medium">场景优先级：</span>
          监测雷达 → linkedin_search + web_search + add_timeline_event；
          会前简报 → get_partner + search_knowledge + create_document；
          停滞唤醒 → search_partners + create_todo。
        </div>

        {BUILTIN_TOOL_CATEGORIES.map((cat) => (
          <section key={cat.id}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{cat.icon}</span>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-zinc-800">{cat.label}</h2>
                <p className="text-xs text-zinc-400">{cat.desc}</p>
              </div>
              <Badge tone="zinc">{cat.tools.length} 个</Badge>
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
                          {tool.priority === "core" && <Badge tone="indigo">核心</Badge>}
                        </div>
                        <div className="text-xs text-zinc-400 font-mono mt-0.5">{tool.name}</div>
                        <p className="text-xs text-zinc-500 mt-2 leading-relaxed">{tool.desc}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge tone={status === "ready" ? "green" : status === "needs_web_search" || status === "needs_kms" ? "amber" : "zinc"}>
                          {status === "ready" ? "已验证" : status === "needs_web_search" ? "需模型联网" : status === "needs_kms" ? "需 KMS 令牌" : "未知"}
                        </Badge>
                        {usedToolNames.has(tool.name) && <Badge tone="blue">已装备</Badge>}
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
