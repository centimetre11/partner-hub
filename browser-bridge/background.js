// Partner Hub 浏览器操作桥 — Service Worker
// 接收 Hub 网页（externally_connectable 白名单）的指令并在浏览器中执行。
// 指令协议：{ type: "ping" } / { type: "composeEmail", to, subject, body, attachments: [{url, filename}] }
// 协议预留扩展位：openAndFill / click / extract 等后续按需增加。

const VERSION = "1.0.6";

const MAIL_TAB_PATTERNS = [
  "https://exmail.qq.com/*",
  "https://*.exmail.qq.com/*",
  "https://mail.qq.com/*",
  "https://*.mail.qq.com/*",
  "https://work.weixin.qq.com/mail/*",
];

const MAIL_HOME_URL = "https://exmail.qq.com/";

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    sendResponse({ ok: false, error: "invalid message" });
    return false;
  }

  if (message.type === "ping") {
    sendResponse({ ok: true, version: VERSION });
    return false;
  }

  if (message.type === "composeEmail") {
    handleComposeEmail(message)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
    return true; // 异步响应
  }

  sendResponse({ ok: false, error: `unknown command: ${message.type}` });
  return false;
});

async function handleComposeEmail(payload) {
  const { to, subject, body, attachments } = payload;
  if (!to) return { ok: false, error: "missing recipient" };

  const files = [];
  for (const att of attachments || []) {
    try {
      const res = await fetch(att.url, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      files.push({
        filename: att.filename || "attachment",
        mimeType: res.headers.get("content-type") || "application/octet-stream",
        base64: arrayBufferToBase64(buf),
      });
    } catch (err) {
      return { ok: false, error: `附件下载失败（${att.filename}）: ${err.message}` };
    }
  }

  const tab = await findOrOpenMailTab();
  await waitForTabComplete(tab.id, 30000);
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.tabs.update(tab.id, { active: true });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content/exmail-compose.js"],
  });

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "fillCompose",
    to,
    subject: subject || "",
    body: body || "",
    bodyHtml: payload.bodyHtml || "",
    files,
  });
  return response || { ok: false, error: "no response from page" };
}

async function findOrOpenMailTab() {
  const tabs = await chrome.tabs.query({ url: MAIL_TAB_PATTERNS });
  if (tabs.length > 0) return tabs[0];
  return chrome.tabs.create({ url: MAIL_HOME_URL });
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      fn(arg);
    };
    const timer = setTimeout(() => finish(reject, new Error("页面加载超时")), timeoutMs);
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") finish(resolve);
    };
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return finish(reject, new Error(chrome.runtime.lastError.message));
      if (tab.status === "complete") return finish(resolve);
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
