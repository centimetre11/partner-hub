import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, PageHeader } from "@/components/ui";
import { AiCenterNav } from "@/components/ai-center-nav";
import { BUILTIN_TOOL_CATEGORIES, BUILTIN_TOOL_COUNT } from "@/lib/tools-registry";

export default async function ToolsPage() {
  await requireUser();
  const equippedCount = await db.agent.findMany({
    where: { isTemplate: false },
    select: { skills: true },
  });
  const usedToolNames = new Set<string>();
  for (const a of equippedCount) {
    for (const name of JSON.parse(a.skills || "[]") as string[]) {
      usedToolNames.add(name);
    }
  }

  return (
    <div className="pb-16">
      <PageHeader
        title="工具背包"
        desc="Agent 可调用的能力单元——从文件操作到 API 对接；勾选后 Agent 运行时直接调用"
        actions={
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Badge tone="indigo">{BUILTIN_TOOL_COUNT} 个内置</Badge>
            <Badge tone="zinc">按需扩展 MCP（规划中）</Badge>
          </div>
        }
      />
      <AiCenterNav />
      <div className="px-8 max-w-5xl space-y-6">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-3 text-sm text-indigo-900/80">
          <span className="font-medium">工具 vs 技能：</span>
          工具是 Agent 能<span className="font-medium">直接调用</span>的原子能力（如读档案、联网搜索）；
          技能是<span className="font-medium">方法论</span>，告诉 Agent 如何组合工具完成专业任务。
          在 <a href="/agents/new" className="text-indigo-600 hover:underline">创建 Agent</a> 时分别勾选。
        </div>

        {BUILTIN_TOOL_CATEGORIES.map((cat) => (
          <section key={cat.id}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{cat.icon}</span>
              <div>
                <h2 className="text-sm font-semibold text-zinc-800">{cat.label}</h2>
                <p className="text-xs text-zinc-400">{cat.desc}</p>
              </div>
              <Badge tone="zinc">{cat.tools.length} 个</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {cat.tools.map((tool) => (
                <div
                  key={tool.name}
                  className="bg-white rounded-xl border border-zinc-200/80 p-4 hover:border-indigo-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-900">{tool.label}</div>
                      <div className="text-xs text-zinc-400 font-mono mt-0.5">{tool.name}</div>
                      <p className="text-xs text-zinc-500 mt-2 leading-relaxed">{tool.desc}</p>
                    </div>
                    {usedToolNames.has(tool.name) && <Badge tone="green">已装备</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-5">
          <h2 className="text-sm font-semibold text-zinc-700">按需扩展（规划中）</h2>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            未来将支持通过 MCP（Model Context Protocol）接入外部工具，如 GitHub、数据库、浏览器自动化等，
            同一 MCP Server 可跨 Cursor、Claude、本平台复用。
          </p>
        </section>
      </div>
    </div>
  );
}
