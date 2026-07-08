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

/** 检测浏览器助手扩展是否已安装（1.5s 超时视为未安装）。 */
export async function isBridgeAvailable(): Promise<boolean> {
  try {
    const res = await sendToBridge<{ ok?: boolean }>({ type: "ping" }, 1500);
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

export type ComposeResult = { ok: boolean; warning?: string; error?: string };

/** 通过扩展打开企业邮写信页并填充内容与附件。 */
export async function composeEmailViaBridge(params: {
  to: string;
  subject: string;
  body: string;
  attachments: BridgeAttachment[];
}): Promise<ComposeResult> {
  try {
    const res = await sendToBridge<ComposeResult>(
      { type: "composeEmail", ...params },
      60000, // 附件下载 + 页面加载可能较慢
    );
    return res ?? { ok: false, error: "no response" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
