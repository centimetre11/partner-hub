import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Badge, Card, EmptyState, PageHeader, fmtDate, fmtDateTime } from "@/components/ui";
import { RegisterForm } from "./register-form";
import { AiApiManager, type AiApiConfigForClient } from "./ai-api-manager";
import { KmsSetup } from "./kms-setup";
import type { VolcengineApiForClient } from "./volcengine-api-setup";
import { KMS_DEFAULT_BASE_URL } from "@/lib/kms";
import { normalizeApiKeyInput, type VolcengineExtraConfig } from "@/lib/volcengine-config";
import { parseAiCapabilities } from "@/lib/ai-capabilities";

function maskKey(apiKey: string) {
  if (!apiKey) return "未填写";
  return apiKey.slice(-4).padStart(Math.min(apiKey.length, 8), "*");
}

function fmtTokens(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

export default async function SettingsPage() {
  const user = await requireUser();
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date();
  since.setDate(since.getDate() - 13);
  const sinceDay = since.toISOString().slice(0, 10);

  const [users, aiApis, dailyUsage, recentUsage, kmsCred] = await Promise.all([
    db.user.findMany({ orderBy: { createdAt: "asc" } }),
    db.aiApiConfig.findMany({ orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
    db.aiDailyTokenUsage.findMany({
      where: { day: { gte: sinceDay } },
      orderBy: [{ day: "desc" }, { totalTokens: "desc" }],
      take: 80,
    }),
    db.aiTokenUsage.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: true },
    }),
    db.userKmsCredential.findUnique({ where: { userId: user.id } }),
  ]);

  const apiConfigs: AiApiConfigForClient[] = aiApis.map((api) => ({
    id: api.id,
    name: api.name,
    provider: api.provider,
    baseUrl: api.baseUrl,
    model: api.model,
    enabled: api.enabled,
    isDefault: api.isDefault,
    keyTail: maskKey(api.apiKey),
    capabilities: parseAiCapabilities(api.capabilities),
    createdAt: api.createdAt.toISOString(),
  }));

  const volcengineConfigs: VolcengineApiForClient[] = aiApis
    .filter((api) => api.provider === "volcengine")
    .map((api) => {
      let extraConfig: VolcengineExtraConfig | null = null;
      if (api.extraConfig) {
        try {
          extraConfig = JSON.parse(api.extraConfig) as VolcengineExtraConfig;
        } catch {
          extraConfig = null;
        }
      }
      return {
        id: api.id,
        name: api.name,
        baseUrl: api.baseUrl,
        model: api.model,
        enabled: api.enabled,
        isDefault: api.isDefault,
        keyTail: maskKey(api.apiKey),
        keyValid: !!normalizeApiKeyInput(api.apiKey),
        extraConfig,
        capabilities: parseAiCapabilities(api.capabilities),
        createdAt: api.createdAt.toISOString(),
      };
    });
  const aiConfigured = aiApis.some((api) => api.enabled) || !!process.env.AI_API_KEY;
  const todayUsage = dailyUsage.filter((row) => row.day === today);
  const todayTokens = todayUsage.reduce((sum, row) => sum + row.totalTokens, 0);

  return (
    <div className="pb-16">
      <PageHeader title="团队设置" desc="管理团队成员、大模型 API 与 Token 用量" />
      <div className="px-8 grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-7xl">
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
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className="text-lg font-bold text-zinc-900">{aiApis.length}</div>
                <div className="text-xs text-zinc-400">API 配置</div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className="text-lg font-bold text-zinc-900">{aiApis.filter((api) => api.enabled).length}</div>
                <div className="text-xs text-zinc-400">启用中</div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className="text-lg font-bold text-zinc-900">{fmtTokens(todayTokens)}</div>
                <div className="text-xs text-zinc-400">今日 Token</div>
              </div>
            </div>
            <div className="text-xs text-zinc-500 leading-relaxed bg-zinc-50 rounded-lg p-4">
              优先使用下方启用且标记为默认的数据库 API；未添加数据库 API 时，兼容读取 <code className="bg-zinc-200 px-1 rounded">.env</code> 中的 AI_BASE_URL / AI_API_KEY / AI_MODEL。
            </div>
            <div className="text-xs text-zinc-400">
              AI 能力：聊天记录导入 · 全局助手（查/改数据） · 补全提问清单 · 动态摘要 · 经营周报。每次模型调用都会记录功能来源、API、模型与 Token 用量。
            </div>
          </div>
        </Card>

        <Card title="大模型管理中心" className="lg:col-span-2">
          <AiApiManager apis={apiConfigs} volcengineApis={volcengineConfigs} />
        </Card>

        <Card title="KMS 文档访问" className="lg:col-span-2">
          <KmsSetup
            credential={{
              configured: !!kmsCred,
              keyTail: kmsCred?.accessToken ? kmsCred.accessToken.slice(-4) : "",
              baseUrl: kmsCred?.baseUrl ?? KMS_DEFAULT_BASE_URL,
              updatedAt: kmsCred?.updatedAt.toISOString(),
            }}
          />
        </Card>

        <Card title="最近 14 天每日 Token 用量" className="lg:col-span-2">
          {dailyUsage.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-zinc-400">
                  <tr className="border-b border-zinc-100">
                    <th className="py-2 text-left font-medium">日期</th>
                    <th className="py-2 text-left font-medium">API</th>
                    <th className="py-2 text-right font-medium">请求</th>
                    <th className="py-2 text-right font-medium">输入 Token</th>
                    <th className="py-2 text-right font-medium">输出 Token</th>
                    <th className="py-2 text-right font-medium">总 Token</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {dailyUsage.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2 text-zinc-700">{row.day}</td>
                      <td className="py-2 text-zinc-700">{row.apiName}</td>
                      <td className="py-2 text-right tabular-nums text-zinc-600">{fmtTokens(row.requestCount)}</td>
                      <td className="py-2 text-right tabular-nums text-zinc-600">{fmtTokens(row.promptTokens)}</td>
                      <td className="py-2 text-right tabular-nums text-zinc-600">{fmtTokens(row.completionTokens)}</td>
                      <td className="py-2 text-right tabular-nums font-semibold text-zinc-900">{fmtTokens(row.totalTokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState text="暂无 Token 用量记录，完成一次 AI 调用后会在这里显示。" />
          )}
        </Card>

        <Card title="最近 AI 调用记录" className="lg:col-span-2">
          {recentUsage.length ? (
            <div className="space-y-2.5">
              {recentUsage.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-4 rounded-lg border border-zinc-100 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-800">{row.feature}</span>
                      <Badge tone={row.status === "SUCCESS" ? "green" : "red"}>{row.status === "SUCCESS" ? "成功" : "失败"}</Badge>
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      {row.apiName} · {row.model} · {row.user?.name ?? "系统"} · {fmtDateTime(row.createdAt)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-zinc-900 tabular-nums">{fmtTokens(row.totalTokens)}</div>
                    <div className="text-xs text-zinc-400">Token</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="暂无 AI 调用记录。" />
          )}
        </Card>
      </div>
    </div>
  );
}
