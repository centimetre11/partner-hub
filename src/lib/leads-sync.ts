import { db } from "./db";
import {
  fetchLeadsDataCached,
  findNormalizedLeadByClueId,
  getClueId,
  invalidateLeadsDataCache,
  normalizeLeadRows,
  type CrmLeadAction,
} from "./leads";

const LAST_SYNC_KEY = "leads_last_sync";
const BATCH = 100;
const NURTURE_STATUS = "销售培育中";
const CRM_ACTION_ALIASES: Record<string, CrmLeadAction | "fullSync"> = {
  toNurture: "toNurture",
  to_nurture: "toNurture",
  nurture: "toNurture",
  培育: "toNurture",
  转培育: "toNurture",
  toChannel: "toChannel",
  to_channel: "toChannel",
  channel: "toChannel",
  转channel: "toChannel",
  toCustomer: "toCustomer",
  to_customer: "toCustomer",
  customer: "toCustomer",
  转客户: "toCustomer",
  edit: "edit",
  编辑: "edit",
  基础信息编辑: "edit",
  shift: "shift",
  责任转移: "shift",
  view: "view",
  fullSync: "fullSync",
  full_sync: "fullSync",
  全量同步: "fullSync",
};

export function normalizeCrmCallbackAction(
  raw: string | undefined | null,
): CrmLeadAction | "fullSync" | null {
  if (!raw?.trim()) return null;
  const key = raw.trim();
  return CRM_ACTION_ALIASES[key] ?? CRM_ACTION_ALIASES[key.toLowerCase()] ?? null;
}

export type CrmCallbackPayload = {
  clueId?: string;
  action?: string;
  fullSync?: boolean;
  /** 仅校验密钥与连通性，不写库 */
  ping?: boolean;
  /** 预览将执行的操作，不写库 */
  dryRun?: boolean;
  /** 可选：密钥放在 body（部分网络会拦截自定义 Header） */
  callbackSecret?: string;
};

export type CrmCallbackResult =
  | {
      ok: true;
      mode:
        | "full_sync_started"
        | "updated"
        | "removed"
        | "reconcile_started"
        | "ignored"
        | "ping"
        | "dry_run";
      dryRunDetail?: string;
    }
  | { ok: false; reason: "invalid_payload" | "unknown_action" | "no_clue_id" | "fetch_failed"; error?: string };

const SUPPORTED_ACTIONS = [
  "toNurture",
  "toChannel",
  "toCustomer",
  "edit",
  "shift",
  "fullSync",
] as const;

export function getCrmCallbackPublicInfo(baseUrl: string) {
  const testClueId = process.env.CRM_CALLBACK_TEST_CLUE_ID?.trim() || null;
  return {
    ok: true as const,
    service: "partner-hub-leads-crm-callback",
    secretConfigured: Boolean(process.env.CRM_CALLBACK_SECRET?.trim()),
    callbackUrl: `${baseUrl}/api/leads/crm-callback`,
    supportedActions: SUPPORTED_ACTIONS,
    authHeader: "X-CRM-Callback-Secret",
    authAlternatives: [
      "Authorization: Bearer <密钥>",
      "JSON body 字段 callbackSecret（推荐 Postman / 内网调试）",
      "Query 参数 ?secret=<密钥>",
    ],
    note: "所有填报场景共用一个密钥 CRM_CALLBACK_SECRET，不是每个 action 单独一把密钥。若 Header 方式返回 nginx 400 HTML，请改用 body.callbackSecret。",
    test: {
      browserGet: `${baseUrl}/api/leads/crm-callback`,
      pingPost: {
        url: `${baseUrl}/api/leads/crm-callback`,
        body: { ping: true, callbackSecret: "<密钥>" },
        header: "X-CRM-Callback-Secret: <密钥>（可选，与 body 二选一）",
      },
      dryRunPost: {
        url: `${baseUrl}/api/leads/crm-callback`,
        body: {
          callbackSecret: "<密钥>",
          dryRun: true,
          clueId: testClueId ?? "<线索UUID>",
          action: "toNurture",
        },
        header: "X-CRM-Callback-Secret: <密钥>（可选）",
      },
      sampleClueId: testClueId,
    },
  };
}

function describeDryRun(actionNorm: CrmLeadAction | "fullSync" | null): string {
  switch (actionNorm) {
    case "toNurture":
      return "将把该线索状态更新为「销售培育中」，并后台 CRM 校准";
    case "toChannel":
    case "toCustomer":
      return "将从 Partner Hub 线索列表删除该条，并后台 CRM 校准";
    case "edit":
    case "shift":
      return "将后台拉 CRM 数据校准该条（约 1 分钟）";
    case "fullSync":
      return "将触发全量线索同步（约 1 分钟）";
    default:
      return "未知 action";
  }
}

export type LeadsSyncResult = {
  ok: boolean;
  leadCount: number;
  durationMs: number;
  error?: string;
};

export async function getLeadsLastSyncAt() {
  const row = await db.setting.findUnique({ where: { key: LAST_SYNC_KEY } });
  if (!row?.value) return null;
  const d = new Date(row.value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function getLatestLeadsSyncLog() {
  return db.leadsSyncLog.findFirst({ orderBy: { createdAt: "desc" } });
}

/** 全量拉取后清空旧数据再写入（整表替换） */
export async function syncLeadsData(): Promise<LeadsSyncResult> {
  const started = Date.now();
  try {
    invalidateLeadsDataCache();
    const rows = await fetchLeadsDataCached({ force: true });
    const { leads } = normalizeLeadRows(rows);

    await db.crmLead.deleteMany();

    for (let i = 0; i < leads.length; i += BATCH) {
      const chunk = leads.slice(i, i + BATCH);
      await db.crmLead.createMany({ data: chunk });
    }

    const durationMs = Date.now() - started;
    const finishedAt = new Date().toISOString();

    await db.$transaction([
      db.setting.upsert({
        where: { key: LAST_SYNC_KEY },
        create: { key: LAST_SYNC_KEY, value: finishedAt },
        update: { value: finishedAt },
      }),
      db.leadsSyncLog.create({
        data: {
          status: "SUCCESS",
          leadCount: leads.length,
          durationMs,
        },
      }),
    ]);

    console.log(`[leads-sync] OK — ${leads.length} leads (full replace) in ${durationMs}ms`);

    return { ok: true, leadCount: leads.length, durationMs };
  } catch (e) {
    const durationMs = Date.now() - started;
    const error = e instanceof Error ? e.message : String(e);
    await db.leadsSyncLog.create({
      data: { status: "FAILED", durationMs, error },
    });
    console.error("[leads-sync] failed:", error);
    return { ok: false, leadCount: 0, durationMs, error };
  }
}

export type RefreshLeadResult =
  | { ok: true; status: "updated" | "removed"; durationMs: number; reconciled?: boolean }
  | { ok: false; reason: "no_clue_id" | "fetch_failed"; error?: string; durationMs?: number };

async function reconcileLeadFromCrm(leadId: string, clueId: string) {
  const rows = await fetchLeadsDataCached({ force: true });
  const match = findNormalizedLeadByClueId(rows, clueId);

  if (!match) {
    await db.crmLead.deleteMany({ where: { id: leadId } });
    return { ok: true as const, status: "removed" as const };
  }

  const { id: _id, ...data } = match;
  await db.crmLead.upsert({
    where: { id: match.id },
    create: match,
    update: data,
  });
  return { ok: true as const, status: "updated" as const };
}

/**
 * 单条线索校准：
 * - 转培育/转 channel/转客户：先即时更新本地，后台再拉 CRM 校准；
 * - 编辑/责任转移：必须拉 CRM 全量 API 查找该条（pub API 无单条接口，约 1 分钟）。
 */
export async function refreshLeadById(
  leadId: string,
  action?: CrmLeadAction,
): Promise<RefreshLeadResult> {
  const started = Date.now();
  const clueId = getClueId(leadId);
  if (!clueId) return { ok: false, reason: "no_clue_id" };

  try {
    if (action === "toNurture") {
      const updated = await db.crmLead.updateMany({
        where: { id: leadId },
        data: { status: NURTURE_STATUS },
      });
      if (updated.count === 0) {
        console.warn(`[leads-refresh] toNurture: lead not found id=${leadId}, reconciling from CRM`);
      }
      void reconcileLeadFromCrm(leadId, clueId).catch((e) =>
        console.error("[leads-refresh] reconcile failed:", e),
      );
      return { ok: true, status: "updated", durationMs: Date.now() - started, reconciled: false };
    }

    if (action === "toChannel" || action === "toCustomer") {
      const deleted = await db.crmLead.deleteMany({ where: { id: leadId } });
      if (deleted.count === 0) {
        console.warn(`[leads-refresh] ${action}: lead not found id=${leadId}, reconciling from CRM`);
      }
      void reconcileLeadFromCrm(leadId, clueId).catch((e) =>
        console.error("[leads-refresh] reconcile failed:", e),
      );
      return { ok: true, status: "removed", durationMs: Date.now() - started, reconciled: false };
    }

    const result = await reconcileLeadFromCrm(leadId, clueId);
    return { ...result, durationMs: Date.now() - started, reconciled: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "fetch_failed", error, durationMs: Date.now() - started };
  }
}

/**
 * CRM 填报成功回调（Java 自定义提交 / JS 回调均可调用）。
 * 快速返回；全量同步、编辑/转移校准在后台执行。
 */
export async function handleCrmLeadCallback(payload: CrmCallbackPayload): Promise<CrmCallbackResult> {
  if (payload.ping) {
    return { ok: true, mode: "ping" };
  }

  if (payload.fullSync) {
    if (payload.dryRun) {
      return { ok: true, mode: "dry_run", dryRunDetail: describeDryRun("fullSync") };
    }
    void syncLeadsData().catch((e) => console.error("[crm-callback] full sync failed:", e));
    return { ok: true, mode: "full_sync_started" };
  }

  const clueId = payload.clueId?.trim();
  if (!clueId) return { ok: false, reason: "invalid_payload", error: "clueId required" };

  const actionNorm = normalizeCrmCallbackAction(payload.action);

  if (actionNorm === "fullSync") {
    if (payload.dryRun) {
      return { ok: true, mode: "dry_run", dryRunDetail: describeDryRun("fullSync") };
    }
    void syncLeadsData().catch((e) => console.error("[crm-callback] full sync failed:", e));
    return { ok: true, mode: "full_sync_started" };
  }

  if (payload.dryRun) {
    if (actionNorm === "view" || !actionNorm) {
      return { ok: true, mode: "dry_run", dryRunDetail: "view 或无 action：忽略，不写库" };
    }
    return { ok: true, mode: "dry_run", dryRunDetail: describeDryRun(actionNorm) };
  }

  if (actionNorm === "view" || !actionNorm) {
    return { ok: true, mode: "ignored" };
  }

  if (
    actionNorm !== "toNurture" &&
    actionNorm !== "toChannel" &&
    actionNorm !== "toCustomer" &&
    actionNorm !== "edit" &&
    actionNorm !== "shift"
  ) {
    return { ok: false, reason: "unknown_action", error: String(payload.action) };
  }

  const leadId = clueId;

  try {
    if (actionNorm === "edit" || actionNorm === "shift") {
      void refreshLeadById(leadId, actionNorm).catch((e) =>
        console.error("[crm-callback] reconcile failed:", e),
      );
      console.log(`[crm-callback] action=${actionNorm} clueId=${clueId} mode=reconcile_started`);
      return { ok: true, mode: "reconcile_started" };
    }

    const result = await refreshLeadById(leadId, actionNorm);
    if (!result.ok) {
      console.error(`[crm-callback] action=${actionNorm} clueId=${clueId} failed:`, result.error ?? result.reason);
      return {
        ok: false,
        reason: result.reason === "no_clue_id" ? "invalid_payload" : result.reason,
        error: result.error,
      };
    }

    const mode = result.status === "removed" ? "removed" : "updated";
    console.log(`[crm-callback] action=${actionNorm} clueId=${clueId} mode=${mode}`);
    return { ok: true, mode };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "fetch_failed", error };
  }
}

export async function getLeadsSyncStats() {
  const [leadCount, lastSyncAt, latestLog] = await Promise.all([
    db.crmLead.count(),
    getLeadsLastSyncAt(),
    getLatestLeadsSyncLog(),
  ]);
  return { leadCount, lastSyncAt, latestLog };
}
