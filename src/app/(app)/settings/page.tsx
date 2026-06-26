import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { Badge, Card, EmptyState, PageHeader, fmtDateTime } from "@/components/ui";
import { RegisterForm } from "./register-form";
import { MemberRow } from "./member-row";
import { AiApiManager, type AiApiConfigForClient } from "./ai-api-manager";
import { SceneModelsSetup, type SceneModelRef, type SceneModelOption } from "./scene-models-setup";
import { LLM_SCENES } from "@/lib/llm-scenes";
import { detectModelCapabilities } from "@/lib/model-capability-detect";
import { SystemKmsSetup } from "./system-kms-setup";
import { SystemKnowhowSetup } from "./knowhow-setup";
import { AmmoSetup } from "./ammo-setup";
import { WecomChatsCard } from "./wecom-chats-card";
import type { VolcengineApiForClient } from "./volcengine-api-setup";
import { KMS_DEFAULT_BASE_URL } from "@/lib/kms";
import { KNOWHOW_DEFAULT_BASE_URL } from "@/lib/knowhow";
import { normalizeApiKeyInput, type VolcengineExtraConfig } from "@/lib/volcengine-config";
import { parseAiCapabilities } from "@/lib/ai-capabilities";
import { CrmSyncCard } from "./crm-sync-card";
import { FeedbackList } from "./feedback-list";
import { getCrmSalesmenAction, getCrmExtraRecordersAction } from "@/lib/crm-actions";
import { getCrmSyncStats } from "@/lib/crm-sync";
import { getAmmoConfigForClient } from "@/lib/ammo-config";
import { getEmailConfigForClient } from "@/lib/email-config";
import { EmailSetup } from "./email-setup";
import { getServerI18n } from "@/lib/server-i18n";
import { SettingsShell, SettingsSection } from "./settings-shell";
import { ActivityLogsCard } from "./activity-logs-card";
import { getActivityLogStats } from "@/lib/activity-log";

function maskKey(apiKey: string, notSet: string) {
  if (!apiKey) return notSet;
  return apiKey.slice(-4).padStart(Math.min(apiKey.length, 8), "*");
}

function fmtTokens(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US").format(value);
}

export default async function SettingsPage() {
  const user = await requireSuperAdmin();
  const { locale, messages: m, bcp47 } = await getServerI18n();
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date();
  since.setDate(since.getDate() - 13);
  const sinceDay = since.toISOString().slice(0, 10);

  const [users, aiApis, dailyUsage, recentUsage, systemKms, systemKnowhow, crmStats, ammoConfig, emailConfig, salesmen, extraRecorders, feedbackItems, activityStats, aiConversationLogs, systemEventLogs, sceneModelRows] = await Promise.all([
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
    db.systemKmsCredential.findUnique({ where: { id: "singleton" } }),
    db.systemKnowhowCredential.findUnique({ where: { id: "singleton" } }),
    getCrmSyncStats(),
    getAmmoConfigForClient(),
    getEmailConfigForClient(),
    getCrmSalesmenAction(),
    getCrmExtraRecordersAction(),
    db.feedbackSubmission.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        createdBy: { select: { name: true, email: true } },
        assets: { include: { asset: { select: { id: true, filename: true, mimeType: true, kind: true } } } },
      },
    }),
    getActivityLogStats(),
    db.aiConversationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        user: { select: { name: true, email: true } },
        partner: { select: { name: true } },
      },
    }),
    db.systemEventLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        actor: { select: { name: true } },
      },
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
  const openFeedbackCount = feedbackItems.filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS").length;

  const nav = [
    { id: "team", label: m.settings.sectionTeam },
    { id: "ai", label: m.settings.sectionAi },
    { id: "logs", label: m.activityLogs.sectionTitle },
    { id: "knowledge", label: m.settings.sectionKnowledge },
    { id: "integrations", label: m.settings.sectionIntegrations },
  ];

  return (
    <div className="pb-16">
      <PageHeader title={m.settings.title} desc={m.settings.desc} />
      <SettingsShell nav={nav}>
        <SettingsSection id="team" title={m.settings.sectionTeam} desc={m.settings.sectionTeamDesc}>
          <Card title={m.settings.teamMembersCount.replace("{count}", String(users.length))} className="lg:col-span-2">
            <p className="text-xs text-slate-500 mb-4">{m.settings.teamMembersHint}</p>
            <div className="space-y-3 mb-5">
              {users.map((u) => (
                <MemberRow key={u.id} user={u} salesmen={salesmen} />
              ))}
            </div>
            <RegisterForm />
          </Card>

          <Card
            title={
              openFeedbackCount > 0
                ? m.feedback.adminTitleWithCount.replace("{count}", String(openFeedbackCount))
                : m.feedback.adminTitle
            }
            className="lg:col-span-2"
          >
            <FeedbackList items={feedbackItems} bcp47={bcp47} admin />
          </Card>
        </SettingsSection>

        <SettingsSection id="ai" title={m.settings.sectionAi} desc={m.settings.sectionAiDesc}>
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
            <SceneModelsSetup
              assignments={sceneAssignments}
              options={sceneModelOptions}
              m={m.settings.scenes}
            />
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
                        <Badge tone={row.status === "SUCCESS" ? "green" : "red"}>{row.status === "SUCCESS" ? m.common.success : m.common.failed}</Badge>
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
        </SettingsSection>

        <SettingsSection id="logs" title={m.activityLogs.sectionTitle} desc={m.activityLogs.sectionDesc}>
          <Card title={m.activityLogs.title} className="lg:col-span-2">
            <ActivityLogsCard
              aiLogs={aiConversationLogs.map((row) => ({
                id: row.id,
                channel: row.channel,
                feature: row.feature,
                mode: row.mode,
                userMessage: row.userMessage,
                assistantReply: row.assistantReply,
                status: row.status,
                error: row.error,
                durationMs: row.durationMs,
                createdAt: row.createdAt.toISOString(),
                user: row.user,
                partner: row.partner,
              }))}
              systemLogs={systemEventLogs.map((row) => ({
                id: row.id,
                category: row.category,
                action: row.action,
                actorLabel: row.actorLabel,
                targetType: row.targetType,
                targetLabel: row.targetLabel,
                summary: row.summary,
                detail: row.detail,
                status: row.status,
                createdAt: row.createdAt.toISOString(),
                actor: row.actor,
              }))}
              stats={activityStats}
              bcp47={bcp47}
            />
          </Card>
        </SettingsSection>

        <SettingsSection id="knowledge" title={m.settings.sectionKnowledge} desc={m.settings.sectionKnowledgeDesc}>
          <Card title={m.settings.systemKmsTitle} className="lg:col-span-2">
            <SystemKmsSetup
              credential={{
                configured: !!systemKms?.accessToken,
                keyTail: systemKms?.accessToken ? systemKms.accessToken.slice(-4) : "",
                baseUrl: systemKms?.baseUrl ?? KMS_DEFAULT_BASE_URL,
                updatedAt: systemKms?.updatedAt?.toISOString(),
              }}
            />
            <p className="text-xs text-slate-500 mt-4">
              {m.settings.personalKmsHint}{" "}
              <a href="/account" className="text-sky-600 hover:underline">{m.nav.account}</a>
            </p>
          </Card>

          <Card title={m.settings.systemKnowhowTitle} className="lg:col-span-2">
            <SystemKnowhowSetup
              credential={{
                configured: !!systemKnowhow?.apiKey,
                keyTail: systemKnowhow?.apiKey ? systemKnowhow.apiKey.slice(-4) : "",
                baseUrl: systemKnowhow?.baseUrl ?? KNOWHOW_DEFAULT_BASE_URL,
                updatedAt: systemKnowhow?.updatedAt?.toISOString(),
              }}
            />
          </Card>

          <Card title={m.ammoSettings.title} className="lg:col-span-2">
            <AmmoSetup config={ammoConfig} />
          </Card>
        </SettingsSection>

        <SettingsSection id="integrations" title={m.settings.sectionIntegrations} desc={m.settings.sectionIntegrationsDesc}>
          <Card title={m.crm.syncTitle} className="lg:col-span-2">
            <CrmSyncCard
              customerCount={crmStats.customerCount}
              contactCount={crmStats.contactCount}
              lastSyncAt={crmStats.lastSyncAt?.toISOString() ?? null}
              latestStatus={crmStats.latestLog?.status ?? null}
              latestError={crmStats.latestLog?.error ?? null}
              extraRecorders={extraRecorders.join("\n")}
            />
          </Card>

          <WecomChatsCard />

          <Card title={m.settings.systemEmailTitle} className="lg:col-span-2">
            <EmailSetup config={emailConfig} />
          </Card>
        </SettingsSection>
      </SettingsShell>
    </div>
  );
}
