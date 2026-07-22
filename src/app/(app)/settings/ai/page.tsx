import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { Badge, Card, EmptyState, fmtDateTime } from "@/components/ui";
import { AiApiManager, type AiApiConfigForClient } from "../ai-api-manager";
import { SceneModelsSetup, type SceneModelRef, type SceneModelOption } from "../scene-models-setup";
import { LLM_SCENES } from "@/lib/llm-scenes";
import { detectModelCapabilities } from "@/lib/model-capability-detect";
import { normalizeApiKeyInput, type VolcengineExtraConfig } from "@/lib/volcengine-config";
import type { VolcengineApiForClient } from "../volcengine-api-setup";
import { parseAiCapabilities } from "@/lib/ai-capabilities";
import { getServerI18n } from "@/lib/server-i18n";

function maskKey(apiKey: string, notSet: string) {
  if (!apiKey) return notSet;
  return apiKey.slice(-4).padStart(Math.min(apiKey.length, 8), "*");
}

function fmtTokens(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US").format(value);
}

export default async function AiSettingsPage() {
  await requireSuperAdmin();
  const { locale, messages: m, bcp47 } = await getServerI18n();
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date();
  since.setDate(since.getDate() - 13);
  const sinceDay = since.toISOString().slice(0, 10);

  const [aiApis, dailyUsage, recentUsage, sceneModelRows] = await Promise.all([
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
    db.llmSceneModel.findMany({
      orderBy: [{ scene: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const todayUsageEarly = dailyUsage.filter((row) => row.day === today);
  const usedTodayByBucket = new Map(todayUsageEarly.map((row) => [row.bucketKey, row.totalTokens]));

  const scenesByApi = new Map<string, string[]>();
  for (const row of sceneModelRows) {
    const arr = scenesByApi.get(row.apiConfigId) ?? [];
    arr.push(row.scene);
    scenesByApi.set(row.apiConfigId, arr);
  }

  const apiConfigs: AiApiConfigForClient[] = aiApis.map((api) => ({
    id: api.id,
    name: api.name,
    provider: api.provider,
    baseUrl: api.baseUrl,
    model: api.model,
    enabled: api.enabled,
    isDefault: api.isDefault,
    keyTail: maskKey(api.apiKey, m.settings.notSet),
    capabilities: parseAiCapabilities(api.capabilities),
    dailyTokenLimit: api.dailyTokenLimit ?? null,
    usedTodayTokens: usedTodayByBucket.get(`api:${api.id}`) ?? 0,
    priority: api.priority,
    assignedScenes: scenesByApi.get(api.id) ?? [],
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
        keyTail: maskKey(api.apiKey, m.settings.notSet),
        keyValid: !!normalizeApiKeyInput(api.apiKey),
        extraConfig,
        capabilities: parseAiCapabilities(api.capabilities),
        dailyTokenLimit: api.dailyTokenLimit ?? null,
        usedTodayTokens: usedTodayByBucket.get(`api:${api.id}`) ?? 0,
        priority: api.priority,
        assignedScenes: scenesByApi.get(api.id) ?? [],
        createdAt: api.createdAt.toISOString(),
      };
    });

  const apiById = new Map(aiApis.map((api) => [api.id, api]));
  const detectedById = new Map(aiApis.map((api) => [api.id, detectModelCapabilities(api)]));
  const sceneAssignments: Record<string, SceneModelRef[]> = Object.fromEntries(
    LLM_SCENES.map((scene) => [scene, [] as SceneModelRef[]]),
  );
  for (const row of sceneModelRows) {
    const api = apiById.get(row.apiConfigId);
    if (!api) continue;
    const list = sceneAssignments[row.scene];
    if (!list) continue;
    const caps = detectedById.get(api.id) ?? { webSearch: false, vision: false };
    list.push({
      apiConfigId: api.id,
      name: api.name,
      model: api.model,
      enabled: api.enabled,
      webSearch: caps.webSearch,
      vision: caps.vision,
    });
  }
  const sceneModelOptions: SceneModelOption[] = aiApis
    .filter((api) => api.enabled)
    .map((api) => {
      const caps = detectedById.get(api.id) ?? { webSearch: false, vision: false };
      return { id: api.id, name: api.name, model: api.model, webSearch: caps.webSearch, vision: caps.vision };
    });

  const aiConfigured = aiApis.some((api) => api.enabled) || !!process.env.AI_API_KEY;
  const todayTokens = todayUsageEarly.reduce((sum, row) => sum + row.totalTokens, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{m.settings.sectionAi}</h2>
        <p className="text-sm text-slate-500">{m.settings.sectionAiDesc}</p>
      </div>

      <Card title={m.settings.aiConfigStatus}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${aiConfigured ? "bg-emerald-500" : "bg-red-400"}`} />
            <span className="text-slate-700">{aiConfigured ? m.settings.aiReady : m.settings.aiNotConfigured}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-lg font-bold text-slate-900">{aiApis.length}</div>
              <div className="text-xs text-slate-400">{m.settings.apiConfigs}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-lg font-bold text-slate-900">{aiApis.filter((api) => api.enabled).length}</div>
              <div className="text-xs text-slate-400">{m.settings.enabledCount}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-lg font-bold text-slate-900">{fmtTokens(todayTokens, locale)}</div>
              <div className="text-xs text-slate-400">{m.settings.todayTokens}</div>
            </div>
          </div>
          <div className="text-xs text-slate-500 leading-relaxed bg-slate-50 rounded-lg p-4">
            {m.settings.preferDbApisDetail}
          </div>
          <div className="text-xs text-slate-400">{m.settings.aiCapabilitiesDetail}</div>
        </div>
      </Card>

      <Card title={m.settings.llmCenter} className="lg:col-span-2">
        <AiApiManager
          apis={apiConfigs}
          volcengineApis={volcengineConfigs}
          leadResearchSceneModels={(sceneAssignments.lead_research ?? []).map((x) => ({
            name: x.name,
            model: x.model,
          }))}
        />
      </Card>

      <Card title={m.settings.scenes.title} className="lg:col-span-2">
        <SceneModelsSetup assignments={sceneAssignments} options={sceneModelOptions} m={m.settings.scenes} />
      </Card>

      <Card title={m.settings.dailyTokens14} className="lg:col-span-2">
        {dailyUsage.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-400">
                <tr className="border-b border-slate-100">
                  <th className="py-2 text-left font-medium">{m.settings.date}</th>
                  <th className="py-2 text-left font-medium">{m.settings.api}</th>
                  <th className="py-2 text-right font-medium">{m.settings.requests}</th>
                  <th className="py-2 text-right font-medium">{m.settings.inputTokens}</th>
                  <th className="py-2 text-right font-medium">{m.settings.outputTokens}</th>
                  <th className="py-2 text-right font-medium">{m.settings.totalTokens}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {dailyUsage.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2 text-slate-700">{row.day}</td>
                    <td className="py-2 text-slate-700">{row.apiName}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{fmtTokens(row.requestCount, locale)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{fmtTokens(row.promptTokens, locale)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">{fmtTokens(row.completionTokens, locale)}</td>
                    <td className="py-2 text-right tabular-nums font-semibold text-slate-900">{fmtTokens(row.totalTokens, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text={m.settings.noTokenUsage} />
        )}
      </Card>

      <Card title={m.settings.recentCalls} className="lg:col-span-2">
        {recentUsage.length ? (
          <div className="space-y-2.5">
            {recentUsage.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{row.feature}</span>
                    <Badge tone={row.status === "SUCCESS" ? "green" : "red"}>
                      {row.status === "SUCCESS" ? m.common.success : m.common.failed}
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {row.apiName} · {row.model} · {row.user?.name ?? m.agents.system} · {fmtDateTime(row.createdAt, bcp47)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-slate-900 tabular-nums">{fmtTokens(row.totalTokens, locale)}</div>
                  <div className="text-xs text-slate-400">{m.settings.tokens}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text={m.settings.noCallHistory} />
        )}
      </Card>
    </div>
  );
}
