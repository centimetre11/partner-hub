// Partner Hub 浏览器操作桥（Chrome 扩展）前端封装。
// 扩展 ID 由 manifest key 固定；通过 externally_connectable 与扩展通信。

export const BROWSER_BRIDGE_EXTENSION_ID =
  process.env.NEXT_PUBLIC_BROWSER_BRIDGE_EXTENSION_ID || "gnmnjdfmcfegdkkgpopoefjpjlcabajl";

export type BridgeAttachment = {
  url: string;
  filename: string;
};

type ChromeRuntime = {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (response: unknown) => void,
  ) => void;
  lastError?: { message?: string };
};

function getChromeRuntime(): ChromeRuntime | null {
  const w = window as unknown as { chrome?: { runtime?: ChromeRuntime } };
  return w.chrome?.runtime ?? null;
}

function sendToBridge<T>(message: unknown, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const runtime = getChromeRuntime();
    if (!runtime || typeof runtime.sendMessage !== "function") {
      reject(new Error("no chrome runtime"));
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("bridge timeout"));
      }
    }, timeoutMs);
    try {
      runtime.sendMessage(BROWSER_BRIDGE_EXTENSION_ID, message, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const err = getChromeRuntime()?.lastError;
        if (err) {
          reject(new Error(err.message || "bridge error"));
          return;
        }
        resolve(response as T);
      });
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}

export type BridgeStatus = {
  available: boolean;
  version: string | null;
  /** CRM 新建填表需要扩展 ≥ 1.1.11（下拉输入过滤后选第一项） */
  supportsCrmActivation: boolean;
};

function parseVersionParts(v: string | null | undefined): number[] {
  if (!v) return [];
  return v.split(".").map((p) => Number.parseInt(p, 10) || 0);
}

function versionGte(version: string | null, min: string): boolean {
  if (!version) return false;
  const a = parseVersionParts(version);
  const b = parseVersionParts(min);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}

/** 检测浏览器助手扩展是否已安装（1.5s 超时视为未安装）。 */
export async function isBridgeAvailable(): Promise<boolean> {
  const s = await getBridgeStatus();
  return s.available;
}

/** 检测扩展安装状态与版本能力。 */
export async function getBridgeStatus(): Promise<BridgeStatus> {
  try {
    const res = await sendToBridge<{ ok?: boolean; version?: string }>({ type: "ping" }, 1500);
    const available = Boolean(res?.ok);
    const version = available && res?.version ? String(res.version) : null;
    return {
      available,
      version,
      supportsCrmActivation: versionGte(version, "1.1.11"),
    };
  } catch {
    return { available: false, version: null, supportsCrmActivation: false };
  }
}

export type ComposeResult = { ok: boolean; warning?: string; error?: string };

/** 按附件数量估算超时（大文件 base64 编码较慢，需多等一会儿）。 */
export function bridgeComposeTimeoutMs(attachmentCount: number): number {
  const base = 90_000;
  const perFile = 60_000;
  return Math.min(300_000, base + Math.max(0, attachmentCount) * perFile);
}

/** 通过扩展打开企业邮写信页并填充内容与附件。 */
export async function composeEmailViaBridge(params: {
  to: string;
  subject: string;
  body: string;
  /** 富文本 HTML；有值时优先注入企业邮编辑器 */
  bodyHtml?: string;
  attachments?: BridgeAttachment[];
}): Promise<ComposeResult> {
  const attachments = params.attachments ?? [];
  try {
    const res = await sendToBridge<ComposeResult>(
      { type: "composeEmail", ...params, attachments },
      bridgeComposeTimeoutMs(attachments.length),
    );
    return res ?? { ok: false, error: "no response" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type CrmActivationBridgeFields = {
  region: string;
  country: string;
  countryAliases: string[];
  sales: string;
  preSales?: string;
  companyName: string;
  partnerType: string;
  contactName: string;
  contactTitle: string;
  productsOfInterest?: string;
  currentDemand?: string;
  email: string;
  phone: string;
  phoneDialCode?: string;
  phoneLocal?: string;
};

/** CRM 填表含多个下拉等待，需比企业邮更长的超时（避免 Hub 超时后再开第二页）。 */
export const CRM_ACTIVATION_BRIDGE_TIMEOUT_MS = 180_000;

/** 通过扩展打开 CRM 海外激活填报表并预填字段（不代提交）。 */
export async function fillCrmActivationViaBridge(params: {
  url: string;
  fields: CrmActivationBridgeFields;
}): Promise<ComposeResult> {
  try {
    const res = await sendToBridge<ComposeResult>(
      { type: "fillCrmActivation", url: params.url, fields: params.fields },
      CRM_ACTIVATION_BRIDGE_TIMEOUT_MS,
    );
    return res ?? { ok: false, error: "no response" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
