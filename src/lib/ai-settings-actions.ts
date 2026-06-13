"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireUser } from "./session";
import { parseVolcengineSnippet, sanitizeVolcengineApiKey } from "./volcengine-config";

export type AiApiActionState = { ok?: boolean; error?: string; message?: string } | null;

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
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
  await requireUser();
  const id = cleanText(formData.get("id"));
  const name = cleanText(formData.get("name"));
  const baseUrl = cleanText(formData.get("baseUrl")).replace(/\/+$/, "");
  const model = cleanText(formData.get("model"));
  const apiKey = cleanText(formData.get("apiKey"));
  const enabled = formData.get("enabled") === "on";
  const isDefault = formData.get("isDefault") === "on";

  if (!name || !baseUrl || !model) return { error: "请填写名称、Base URL 和模型" };
  if (!id && !apiKey) return { error: "新增 API 时必须填写 API Key" };

  if (id) {
    await db.aiApiConfig.update({
      where: { id },
      data: {
        name,
        baseUrl,
        model,
        enabled,
        ...(apiKey ? { apiKey } : {}),
      },
    });
    if (isDefault) await makeOnlyDefault(id);
    else await ensureDefaultApi();
    revalidatePath("/settings");
    return { ok: true, message: "API 配置已更新" };
  }

  const count = await db.aiApiConfig.count();
  const created = await db.aiApiConfig.create({
    data: {
      name,
      baseUrl,
      model,
      apiKey,
      enabled,
      isDefault: isDefault || count === 0,
    },
  });
  if (created.isDefault) await makeOnlyDefault(created.id);
  else await ensureDefaultApi();
  revalidatePath("/settings");
  return { ok: true, message: "API 配置已添加" };
}

export async function setDefaultAiApiAction(id: string) {
  await requireUser();
  await makeOnlyDefault(id);
  revalidatePath("/settings");
}

export async function toggleAiApiAction(id: string, enabled: boolean) {
  await requireUser();
  await db.aiApiConfig.update({ where: { id }, data: { enabled } });
  await ensureDefaultApi();
  revalidatePath("/settings");
}

export async function deleteAiApiAction(id: string) {
  await requireUser();
  await db.aiApiConfig.delete({ where: { id } });
  await ensureDefaultApi();
  revalidatePath("/settings");
}

export async function upsertVolcengineApiAction(_: AiApiActionState, formData: FormData): Promise<AiApiActionState> {
  await requireUser();
  const id = cleanText(formData.get("id"));
  const name = cleanText(formData.get("name")) || "火山方舟 Doubao";
  const manualKey = sanitizeVolcengineApiKey(cleanText(formData.get("apiKey")));
  const snippet = cleanText(formData.get("snippet"));
  const enabled = formData.get("enabled") === "on";
  const isDefault = formData.get("isDefault") === "on";

  if (!id && !manualKey) return { error: "请填写 ARK API Key（从火山方舟控制台 → API Key 管理复制完整密钥）" };
  if (!id && !snippet) return { error: "请粘贴 curl 或 JSON 请求体" };

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
    snippetKey = parsed.data.apiKey ? sanitizeVolcengineApiKey(parsed.data.apiKey) : null;
  } else if (id) {
    const existing = await db.aiApiConfig.findUnique({ where: { id } });
    if (!existing || existing.provider !== "volcengine") return { error: "配置不存在" };
    baseUrl = existing.baseUrl;
    model = existing.model;
    extraConfig = existing.extraConfig ?? "{}";
  } else {
    return { error: "请粘贴 curl 或 JSON 请求体" };
  }

  const finalKey = manualKey || snippetKey;
  if (!id && !finalKey) {
    return {
      error: "请填写有效的 ARK API Key。curl 里的 $ARK_API_KEY 只是占位符，必须在上方密钥框粘贴真实 Key",
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
        ...(finalKey ? { apiKey: finalKey } : {}),
      },
    });
    if (isDefault) await makeOnlyDefault(id);
    else await ensureDefaultApi();
    revalidatePath("/settings");
    return { ok: true, message: finalKey ? "火山引擎配置已更新（含新 Key）" : "火山引擎配置已更新" };
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
      isDefault: isDefault || count === 0,
    },
  });
  if (created.isDefault) await makeOnlyDefault(created.id);
  else await ensureDefaultApi();
  revalidatePath("/settings");
  return { ok: true, message: "火山引擎配置已保存，可点击「测试连通性」验证" };
}

export async function testVolcengineApiAction(_: AiApiActionState, formData: FormData): Promise<AiApiActionState> {
  await requireUser();
  const id = cleanText(formData.get("id"));
  const snippet = cleanText(formData.get("snippet"));
  const manualKey = sanitizeVolcengineApiKey(cleanText(formData.get("apiKey")));

  let api: { baseUrl: string; model: string; apiKey: string; extraConfig: string | null } | null = null;
  if (id) {
    const row = await db.aiApiConfig.findUnique({ where: { id } });
    if (!row || row.provider !== "volcengine") return { error: "火山引擎配置不存在" };
    api = row;
  }

  let model = api?.model ?? "";
  let baseUrl = api?.baseUrl ?? "";
  let apiKey = manualKey ?? api?.apiKey ?? "";
  let extra: Record<string, unknown> = {};

  if (snippet) {
    const parsed = parseVolcengineSnippet(snippet);
    if (!parsed.ok) return { error: parsed.error };
    model = parsed.data.model;
    baseUrl = parsed.data.baseUrl;
    extra = parsed.data.extraConfig;
    const snippetKey = parsed.data.apiKey ? sanitizeVolcengineApiKey(parsed.data.apiKey) : null;
    if (snippetKey) apiKey = snippetKey;
  } else if (api?.extraConfig) {
    try {
      extra = JSON.parse(api.extraConfig);
    } catch {
      extra = {};
    }
  }

  if (!sanitizeVolcengineApiKey(apiKey)) {
    return {
      error:
        "API Key 无效或未保存。请在编辑配置时重新填写 ARK API Key（完整密钥，不要用 $ARK_API_KEY 占位符），保存后再测试",
    };
  }
  if (!model || !baseUrl) return { error: "缺少模型或 Base URL" };

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
          error: `认证失败（401）：API Key 无效或已过期。请到火山方舟控制台重新创建 Key，在编辑配置里粘贴完整密钥后保存再试。\n${text.slice(0, 280)}`,
        };
      }
      return { error: `测试失败（HTTP ${res.status}）：${text.slice(0, 400)}` };
    }
    let preview = text.slice(0, 120);
    try {
      const data = JSON.parse(text) as { output?: Array<{ content?: Array<{ text?: string }> }> };
      const msg = data.output?.find((o) => o.content)?.content?.[0]?.text;
      if (msg) preview = msg.slice(0, 120);
    } catch {
      // 保留原始片段
    }
    return { ok: true, message: `连通成功。模型回复：${preview}` };
  } catch (e) {
    return { error: `测试请求失败：${e instanceof Error ? e.message : String(e)}` };
  }
}
