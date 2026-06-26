"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireSuperAdmin } from "./session";
import { parseVolcengineSnippet, normalizeApiKeyInput } from "./volcengine-config";
import { recordSystemEvent } from "./activity-log";
import { isLlmScene, type LlmScene } from "./llm-scenes";

function resolveVolcengineApiKey(opts: {
  formKey?: string;
  snippetKey?: string;
  storedKey?: string;
}): string | null {
  for (const raw of [opts.formKey, opts.snippetKey, opts.storedKey]) {
    const normalized = normalizeApiKeyInput(raw ?? "");
    if (normalized) return normalized;
  }
  return null;
}

function describeStoredKey(storedKey: string | undefined | null): string {
  const raw = (storedKey ?? "").trim();
  if (!raw) return "No API Key saved in database";
  return `Database key length ${raw.length}, tail ${raw.slice(-4)}`;
}

export type AiApiActionState = { ok?: boolean; error?: string; message?: string } | null;

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

/** 解析每日 Token 上限：空 / 非正数 / 非法 → null（表示不限） */
function parseDailyTokenLimit(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").replace(/[,_\s]/g, "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/** 解析调度优先级：数字越大越先用。空 / 非法 → 0 */
function parsePriority(value: FormDataEntryValue | null): number {
  const raw = String(value ?? "").replace(/[,_\s]/g, "").trim();
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

async function makeOnlyDefault(id: string) {
  await db.aiApiConfig.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
  await db.aiApiConfig.update({ where: { id }, data: { isDefault: true, enabled: true } });
}

async function ensureDefaultApi() {
  const defaultApi = await db.aiApiConfig.findFirst({ where: { isDefault: true } });
  if (defaultApi) return;
  const next = await db.aiApiConfig.findFirst({ where: { enabled: true }, orderBy: { createdAt: "asc" } });
  if (next) await makeOnlyDefault(next.id);
}

export async function upsertAiApiAction(_: AiApiActionState, formData: FormData): Promise<AiApiActionState> {
  const admin = await requireSuperAdmin();
  const id = cleanText(formData.get("id"));
  const name = cleanText(formData.get("name"));
  const baseUrl = cleanText(formData.get("baseUrl")).replace(/\/+$/, "");
  const model = cleanText(formData.get("model"));
  const apiKey = cleanText(formData.get("apiKey"));
  const enabled = formData.get("enabled") === "on";
  const isDefault = formData.get("isDefault") === "on";
  const dailyTokenLimit = parseDailyTokenLimit(formData.get("dailyTokenLimit"));
  const priority = parsePriority(formData.get("priority"));

  if (!name || !baseUrl || !model) return { error: "Please fill in name, Base URL, and model" };
  if (!id && !apiKey) return { error: "API Key is required when adding a new API" };

  if (id) {
    await db.aiApiConfig.update({
      where: { id },
      data: {
        name,
        baseUrl,
        model,
        enabled,
        dailyTokenLimit,
        priority,
        ...(apiKey ? { apiKey } : {}),
      },
    });
    if (isDefault) await makeOnlyDefault(id);
    else await ensureDefaultApi();
    void recordSystemEvent({
      category: "SETTINGS",
      action: "ai.api.update",
      actorId: admin.id,
      actorLabel: admin.name,
      targetType: "AiApiConfig",
      targetId: id,
      targetLabel: name,
      summary: `AI API 已更新：${name}`,
    });
    revalidatePath("/settings");
    return { ok: true, message: "API configuration updated" };
  }

  const count = await db.aiApiConfig.count();
  const created = await db.aiApiConfig.create({
    data: {
      name,
      baseUrl,
      model,
      apiKey,
      enabled,
      dailyTokenLimit,
      priority,
      isDefault: isDefault || count === 0,
    },
  });
  if (created.isDefault) await makeOnlyDefault(created.id);
  else await ensureDefaultApi();
  void recordSystemEvent({
    category: "SETTINGS",
    action: "ai.api.create",
    actorId: admin.id,
    actorLabel: admin.name,
    targetType: "AiApiConfig",
    targetId: created.id,
    targetLabel: name,
    summary: `AI API 已添加：${name}`,
  });
  revalidatePath("/settings");
  return { ok: true, message: "API configuration added" };
}

export async function setDefaultAiApiAction(id: string) {
  const admin = await requireSuperAdmin();
  const api = await db.aiApiConfig.findUnique({ where: { id } });
  await makeOnlyDefault(id);
  void recordSystemEvent({
    category: "SETTINGS",
    action: "ai.api.set_default",
    actorId: admin.id,
    actorLabel: admin.name,
    targetType: "AiApiConfig",
    targetId: id,
    targetLabel: api?.name,
    summary: `默认 AI API 已切换：${api?.name ?? id}`,
  });
  revalidatePath("/settings");
}

export async function toggleAiApiAction(id: string, enabled: boolean) {
  const admin = await requireSuperAdmin();
  const api = await db.aiApiConfig.findUnique({ where: { id } });
  await db.aiApiConfig.update({ where: { id }, data: { enabled } });
  await ensureDefaultApi();
  void recordSystemEvent({
    category: "SETTINGS",
    action: enabled ? "ai.api.enable" : "ai.api.disable",
    actorId: admin.id,
    actorLabel: admin.name,
    targetType: "AiApiConfig",
    targetId: id,
    targetLabel: api?.name,
    summary: enabled ? `AI API 已启用：${api?.name}` : `AI API 已停用：${api?.name}`,
  });
  revalidatePath("/settings");
}

export async function deleteAiApiAction(id: string) {
  const admin = await requireSuperAdmin();
  const api = await db.aiApiConfig.findUnique({ where: { id } });
  await db.aiApiConfig.delete({ where: { id } });
  await ensureDefaultApi();
  void recordSystemEvent({
    category: "SETTINGS",
    action: "ai.api.delete",
    actorId: admin.id,
    actorLabel: admin.name,
    targetType: "AiApiConfig",
    targetId: id,
    targetLabel: api?.name,
    summary: `AI API 已删除：${api?.name ?? id}`,
  });
  revalidatePath("/settings");
}

export async function upsertVolcengineApiAction(_: AiApiActionState, formData: FormData): Promise<AiApiActionState> {
  const admin = await requireSuperAdmin();
  const id = cleanText(formData.get("id"));
  const name = cleanText(formData.get("name")) || "火山方舟 Doubao";
  const manualKey = normalizeApiKeyInput(cleanText(formData.get("apiKey")));
  const snippet = cleanText(formData.get("snippet"));
  const enabled = formData.get("enabled") === "on";
  const isDefault = formData.get("isDefault") === "on";
  const dailyTokenLimit = parseDailyTokenLimit(formData.get("dailyTokenLimit"));
  const priority = parsePriority(formData.get("priority"));

  if (!id && !manualKey) return { error: "Please enter the ARK API Key (copy the full key from Volcengine Ark console → API Key management)" };
  if (!id && !snippet) return { error: "Please paste the curl or JSON request body" };

  let baseUrl = "";
  let model = "";
  let extraConfig = "";
  let snippetKey: string | null = null;

  if (snippet) {
    const parsed = parseVolcengineSnippet(snippet);
    if (!parsed.ok) return { error: parsed.error };
    baseUrl = parsed.data.baseUrl;
    model = parsed.data.model;
    extraConfig = JSON.stringify(parsed.data.extraConfig);
    snippetKey = parsed.data.apiKey ? normalizeApiKeyInput(parsed.data.apiKey) : null;
  } else if (id) {
    const existing = await db.aiApiConfig.findUnique({ where: { id } });
    if (!existing || existing.provider !== "volcengine") return { error: "Configuration not found" };
    baseUrl = existing.baseUrl;
    model = existing.model;
    extraConfig = existing.extraConfig ?? "{}";
  } else {
    return { error: "Please paste the curl or JSON request body" };
  }

  const finalKey = manualKey || snippetKey;
  if (!id && !finalKey) {
    return {
      error: "Please enter a valid ARK API Key. $ARK_API_KEY in curl is only a placeholder — paste the real key in the field above",
    };
  }

  if (id) {
    await db.aiApiConfig.update({
      where: { id },
      data: {
        name,
        provider: "volcengine",
        baseUrl,
        model,
        extraConfig,
        enabled,
        dailyTokenLimit,
        priority,
        ...(finalKey ? { apiKey: finalKey } : {}),
      },
    });
    if (isDefault) await makeOnlyDefault(id);
    else await ensureDefaultApi();
    revalidatePath("/settings");
    return { ok: true, message: finalKey ? `Volcengine configuration updated (key tail ${finalKey.slice(-4)})` : "Volcengine configuration updated" };
  }

  const count = await db.aiApiConfig.count();
  const created = await db.aiApiConfig.create({
    data: {
      name,
      provider: "volcengine",
      baseUrl,
      model,
      apiKey: finalKey!,
      extraConfig,
      enabled,
      dailyTokenLimit,
      priority,
      isDefault: isDefault || count === 0,
    },
  });
  if (created.isDefault) await makeOnlyDefault(created.id);
  else await ensureDefaultApi();
  revalidatePath("/settings");
  return { ok: true, message: `Volcengine configuration saved (key tail ${finalKey!.slice(-4)}). Click "Test connection" to verify` };
}

/* ----------------------------- 场景模型分配 ----------------------------- */

function parseScene(value: unknown): LlmScene | null {
  const raw = String(value ?? "").trim();
  return isLlmScene(raw) ? raw : null;
}

/** 把某模型追加到某场景末尾（已存在则忽略） */
export async function assignSceneModelAction(scene: string, apiConfigId: string) {
  const admin = await requireSuperAdmin();
  const s = parseScene(scene);
  if (!s || !apiConfigId) return;
  const api = await db.aiApiConfig.findUnique({ where: { id: apiConfigId } });
  if (!api) return;
  const existing = await db.llmSceneModel.findUnique({
    where: { scene_apiConfigId: { scene: s, apiConfigId } },
  });
  if (existing) return;
  const last = await db.llmSceneModel.findFirst({
    where: { scene: s },
    orderBy: { order: "desc" },
  });
  await db.llmSceneModel.create({
    data: { scene: s, apiConfigId, order: (last?.order ?? -1) + 1 },
  });
  void recordSystemEvent({
    category: "SETTINGS",
    action: "ai.scene.assign",
    actorId: admin.id,
    actorLabel: admin.name,
    targetType: "LlmSceneModel",
    targetId: apiConfigId,
    targetLabel: `${s} · ${api.name}`,
    summary: `场景「${s}」已添加模型：${api.name}`,
  });
  revalidatePath("/settings");
}

/** 从某场景移除某模型 */
export async function removeSceneModelAction(scene: string, apiConfigId: string) {
  const admin = await requireSuperAdmin();
  const s = parseScene(scene);
  if (!s || !apiConfigId) return;
  await db.llmSceneModel
    .delete({ where: { scene_apiConfigId: { scene: s, apiConfigId } } })
    .catch(() => undefined);
  void recordSystemEvent({
    category: "SETTINGS",
    action: "ai.scene.remove",
    actorId: admin.id,
    actorLabel: admin.name,
    targetType: "LlmSceneModel",
    targetId: apiConfigId,
    targetLabel: `${s} · ${apiConfigId}`,
    summary: `场景「${s}」已移除模型`,
  });
  revalidatePath("/settings");
}

/** 在某场景内上移/下移某模型（调整尝试顺序） */
export async function moveSceneModelAction(scene: string, apiConfigId: string, direction: "up" | "down") {
  await requireSuperAdmin();
  const s = parseScene(scene);
  if (!s || !apiConfigId) return;
  const list = await db.llmSceneModel.findMany({
    where: { scene: s },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  const idx = list.findIndex((r) => r.apiConfigId === apiConfigId);
  if (idx < 0) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return;
  const a = list[idx]!;
  const b = list[swapIdx]!;
  await db.$transaction([
    db.llmSceneModel.update({ where: { id: a.id }, data: { order: b.order } }),
    db.llmSceneModel.update({ where: { id: b.id }, data: { order: a.order } }),
  ]);
  revalidatePath("/settings");
}

export async function testVolcengineApiAction(_: AiApiActionState, formData: FormData): Promise<AiApiActionState> {
  await requireSuperAdmin();
  const id = cleanText(formData.get("id"));
  const snippet = cleanText(formData.get("snippet"));
  const formKeyRaw = cleanText(formData.get("apiKey"));

  if (!id) {
    return { error: "Missing configuration ID. Click \"Test connection\" on a saved configuration card" };
  }

  const row = await db.aiApiConfig.findUnique({ where: { id } });
  if (!row || row.provider !== "volcengine") return { error: "Volcengine configuration not found" };

  let model = row.model;
  let baseUrl = row.baseUrl;
  let extra: Record<string, unknown> = {};
  let snippetKey: string | undefined;

  if (snippet) {
    const parsed = parseVolcengineSnippet(snippet);
    if (!parsed.ok) return { error: parsed.error };
    model = parsed.data.model;
    baseUrl = parsed.data.baseUrl;
    extra = parsed.data.extraConfig;
    snippetKey = parsed.data.apiKey;
  } else if (row.extraConfig) {
    try {
      extra = JSON.parse(row.extraConfig);
    } catch {
      extra = {};
    }
  }

  const apiKey = resolveVolcengineApiKey({
    formKey: formKeyRaw,
    snippetKey,
    storedKey: row.apiKey,
  });

  if (!apiKey) {
    return {
      error: `${describeStoredKey(row.apiKey)}. Re-enter the ARK API Key on the edit page and save ($ARK_API_KEY in curl is only a placeholder and is not saved automatically).`,
    };
  }
  if (!model || !baseUrl) return { error: "Missing model or Base URL" };

  const body: Record<string, unknown> = {
    model,
    stream: false,
    store: false,
    input: [{ role: "user", content: [{ type: "input_text", text: "回复 OK 两个字母即可" }] }],
    max_output_tokens: 16,
    ...(Array.isArray(extra.tools) && extra.tools.length ? { tools: extra.tools } : {}),
  };

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401) {
        return {
          error: `Authentication failed (401): key read from database (tail ${apiKey.slice(-4)}), but Volcengine Ark rejected it. Confirm the key is valid and not expired in the console.\n${text.slice(0, 280)}`,
        };
      }
      return { error: `Test failed (HTTP ${res.status}): ${text.slice(0, 400)}` };
    }
    let preview = text.slice(0, 120);
    try {
      const data = JSON.parse(text) as { output?: { content?: { text?: string }[] }[] };
      const msg = data.output?.find((o) => o.content)?.content?.[0]?.text;
      if (msg) preview = msg.slice(0, 120);
    } catch {
      // 保留原始片段
    }
    return { ok: true, message: `Connection successful (using database key, tail ${apiKey.slice(-4)}). Model reply: ${preview}` };
  } catch (e) {
    return { error: `Test request failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
