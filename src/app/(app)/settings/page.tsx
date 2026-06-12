import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Card, PageHeader, fmtDate } from "@/components/ui";
import { RegisterForm } from "./register-form";

export default async function SettingsPage() {
  await requireUser();
  const users = await db.user.findMany({ orderBy: { createdAt: "asc" } });
  const aiConfigured = !!process.env.AI_API_KEY;

  return (
    <div className="pb-16">
      <PageHeader title="团队设置" desc="管理团队成员与系统配置" />
      <div className="px-8 grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-4xl">
        <Card title={`团队成员（${users.length}）`}>
          <div className="space-y-3 mb-5">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold">
                  {u.name.slice(0, 1)}
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-800">{u.name}</div>
                  <div className="text-xs text-zinc-400">
                    {u.email} · 加入于 {fmtDate(u.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <RegisterForm />
        </Card>

        <Card title="AI 配置状态">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${aiConfigured ? "bg-emerald-500" : "bg-red-400"}`} />
              <span className="text-zinc-700">{aiConfigured ? "AI 已配置，可正常使用" : "AI 未配置"}</span>
            </div>
            <div className="text-xs text-zinc-500 leading-relaxed bg-zinc-50 rounded-lg p-4">
              在项目根目录的 <code className="bg-zinc-200 px-1 rounded">.env</code> 文件中配置（OpenAI 兼容接口，Kimi / DeepSeek / 通义 / OpenAI 均可）：
              <pre className="mt-2 text-[11px] leading-relaxed">{`AI_BASE_URL="https://api.moonshot.cn/v1"
AI_API_KEY="sk-..."
AI_MODEL="kimi-k2-0711-preview"`}</pre>
              修改后需重启服务生效。
            </div>
            <div className="text-xs text-zinc-400">
              AI 能力：会议模式实时刷新 · 聊天记录导入 · 全局助手（查/改数据） · 补全提问清单 · 动态摘要 · 经营周报。所有 AI 写入都经过人工确认（diff）并留审计记录。
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
