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
  /** 富文本 HTML；有值时优先注入企业邮编辑器 */
  bodyHtml?: string;
  /** 是否由扩展注入附件（大文件易超时，默认 false，改由 Hub 触发本地下载） */
  injectAttachments?: boolean;
  attachments?: BridgeAttachment[];
}): Promise<ComposeResult> {
  try {
    const res = await sendToBridge<ComposeResult>(
      {
        type: "composeEmail",
        to: params.to,
        subject: params.subject,
        body: params.body,
        bodyHtml: params.bodyHtml,
        injectAttachments: params.injectAttachments ?? false,
        attachments: params.injectAttachments ? params.attachments ?? [] : [],
      },
      30000,
    );
    return res ?? { ok: false, error: "no response" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
