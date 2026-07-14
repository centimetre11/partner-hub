// Partner Hub 浏览器操作桥 — Service Worker
// 指令协议：
//   { type: "ping" }
//   { type: "composeEmail", to, subject, body, attachments: [{url, filename}] }
//   { type: "fillCrmActivation", url, fields: { region, country, countryAliases, sales, companyName, partnerType, contactName, contactTitle, email, phone } }

const VERSION = "1.1.4";

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
    return true;
  }

  if (message.type === "fillCrmActivation") {
    handleFillCrmActivation(message)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
    return true;
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

async function handleFillCrmActivation(payload) {
  const url = payload.url;
  const fields = payload.fields || {};
  if (!url) return { ok: false, error: "missing CRM url" };
  if (!fields.companyName) return { ok: false, error: "missing companyName" };

  const tab = await chrome.tabs.create({ url });
  await waitForTabComplete(tab.id, 45000);
  // FineReport 报表常二次异步渲染，再多等一会
  await sleep(2500);
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.tabs.update(tab.id, { active: true });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    files: ["content/crm-activation.js"],
  });

  // allFrames 注入后，向顶层发消息；content script 内部会跨同源 iframe 查找
  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, {
      type: "fillActivation",
      fields,
    });
  } catch (err) {
    // 部分环境下顶层无 listener（脚本只在 iframe 生效），改为对所有 frame 执行
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: (fieldsArg) => {
        if (typeof window.__phBridgeFillActivation === "function") {
          return window.__phBridgeFillActivation(fieldsArg);
        }
        return null;
      },
      args: [fields],
    });
    response = (results || []).map((r) => r.result).find((r) => r && (r.ok || r.error));
    if (!response) {
      return {
        ok: false,
        error: `无法与 CRM 页面通信：${err && err.message ? err.message : err}。请确认已登录 CRM 且页面已加载完成。`,
      };
    }
  }

  return response || { ok: false, error: "no response from CRM page" };
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
