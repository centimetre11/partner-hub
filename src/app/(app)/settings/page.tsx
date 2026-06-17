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
  if (!apiKey) return "Not set";
  return apiKey.slice(-4).padStart(Math.min(apiKey.length, 8), "*");
}

function fmtTokens(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
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

  const todayUsageEarly = dailyUsage.filter((row) => row.day === today);
  const usedTodayByBucket = new Map(todayUsageEarly.map((row) => [row.bucketKey, row.totalTokens]));

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
    dailyTokenLimit: api.dailyTokenLimit ?? null,
    usedTodayTokens: usedTodayByBucket.get(`api:${api.id}`) ?? 0,
    priority: api.priority,
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
        dailyTokenLimit: api.dailyTokenLimit ?? null,
        usedTodayTokens: usedTodayByBucket.get(`api:${api.id}`) ?? 0,
        priority: api.priority,
        createdAt: api.createdAt.toISOString(),
      };
    });
  const aiConfigured = aiApis.some((api) => api.enabled) || !!process.env.AI_API_KEY;
  const todayTokens = todayUsageEarly.reduce((sum, row) => sum + row.totalTokens, 0);

  return (
    <div className="pb-16">
      <PageHeader title="Team settings" desc="Manage team members, LLM APIs, and token usage" />
      <div className="px-8 grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-7xl">
        <Card title={`Team members (${users.length})`}>
          <div className="space-y-3 mb-5">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold">
                  {u.name.slice(0, 1)}
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-800">{u.name}</div>
                  <div className="text-xs text-zinc-400">
                    {u.email} · Joined {fmtDate(u.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <RegisterForm />
        </Card>

        <Card title="AI configuration status">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${aiConfigured ? "bg-emerald-500" : "bg-red-400"}`} />
              <span className="text-zinc-700">{aiConfigured ? "AI is configured and ready" : "AI not configured"}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className="text-lg font-bold text-zinc-900">{aiApis.length}</div>
                <div className="text-xs text-zinc-400">API configs</div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className="text-lg font-bold text-zinc-900">{aiApis.filter((api) => api.enabled).length}</div>
                <div className="text-xs text-zinc-400">Enabled</div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className="text-lg font-bold text-zinc-900">{fmtTokens(todayTokens)}</div>
                <div className="text-xs text-zinc-400">Today's tokens</div>
              </div>
            </div>
            <div className="text-xs text-zinc-500 leading-relaxed bg-zinc-50 rounded-lg p-4">
              Prefer enabled database APIs marked as default below; if none are added, falls back to <code className="bg-zinc-200 px-1 rounded">.env</code> AI_BASE_URL / AI_API_KEY / AI_MODEL.
            </div>
            <div className="text-xs text-zinc-400">
              AI capabilities: chat import · global assistant (query/update data) · question list completion · dynamic summary · weekly business report. Every model call logs feature source, API, model, and token usage.
            </div>
          </div>
        </Card>

        <Card title="LLM management center" className="lg:col-span-2">
          <AiApiManager apis={apiConfigs} volcengineApis={volcengineConfigs} />
        </Card>

        <Card title="KMS document access" className="lg:col-span-2">
          <KmsSetup
            credential={{
              configured: !!kmsCred,
              keyTail: kmsCred?.accessToken ? kmsCred.accessToken.slice(-4) : "",
              baseUrl: kmsCred?.baseUrl ?? KMS_DEFAULT_BASE_URL,
              updatedAt: kmsCred?.updatedAt.toISOString(),
            }}
          />
        </Card>

        <Card title="Daily token usage (last 14 days)" className="lg:col-span-2">
          {dailyUsage.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-zinc-400">
                  <tr className="border-b border-zinc-100">
                    <th className="py-2 text-left font-medium">Date</th>
                    <th className="py-2 text-left font-medium">API</th>
                    <th className="py-2 text-right font-medium">Requests</th>
                    <th className="py-2 text-right font-medium">Input tokens</th>
                    <th className="py-2 text-right font-medium">Output tokens</th>
                    <th className="py-2 text-right font-medium">Total tokens</th>
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
            <EmptyState text="No token usage yet. It will appear here after your first AI call." />
          )}
        </Card>

        <Card title="Recent AI calls" className="lg:col-span-2">
          {recentUsage.length ? (
            <div className="space-y-2.5">
              {recentUsage.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-4 rounded-lg border border-zinc-100 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-800">{row.feature}</span>
                      <Badge tone={row.status === "SUCCESS" ? "green" : "red"}>{row.status === "SUCCESS" ? "Success" : "Failed"}</Badge>
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      {row.apiName} · {row.model} · {row.user?.name ?? "System"} · {fmtDateTime(row.createdAt)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-zinc-900 tabular-nums">{fmtTokens(row.totalTokens)}</div>
                    <div className="text-xs text-zinc-400">Tokens</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="No AI call history yet." />
          )}
        </Card>
      </div>
    </div>
  );
}
