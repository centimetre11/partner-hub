// 企业邮写信页适配器：点击写信 → 填充收件人/主题/正文 → 注入附件。
// 兼容经典版（frameset + QMEditor iframe）与新版（React DOM）两类界面，
// 所有查找均递归遍历同源 iframe，选择器按多策略依次尝试。

(() => {
  if (window.__phBridgeComposeLoaded) return;
  window.__phBridgeComposeLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "fillCompose") return false;
    runFillCompose(message)
      .then((r) => sendResponse(r))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
    return true;
  });

  async function runFillCompose({ to, subject, body, files }) {
    // 1. 找到并点击「写信」入口（若写信表单已打开则跳过）
    if (!findComposeForm()) {
      const btn = await waitFor(() => findComposeButton(), 15000, "找不到「写信」按钮，请确认已登录企业邮");
      btn.click();
    }

    // 2. 等待写信表单出现
    const form = await waitFor(() => findComposeForm(), 15000, "写信表单未出现");

    // 3. 填充收件人 / 主题 / 正文
    await fillRecipient(form, to);
    if (subject) fillSubject(form, subject);
    if (body) await fillBody(form, body);

    // 4. 注入附件
    let attachError = null;
    if (files && files.length > 0) {
      try {
        await injectAttachments(form, files);
      } catch (err) {
        attachError = String(err && err.message ? err.message : err);
      }
    }

    return attachError
      ? { ok: true, warning: `内容已填充，但附件注入失败：${attachError}，请手动添加` }
      : { ok: true };
  }

  // ---------- 查找辅助：递归遍历同源 iframe ----------

  function allDocuments(root = document) {
    const docs = [root];
    const frames = root.querySelectorAll("iframe, frame");
    for (const f of frames) {
      try {
        if (f.contentDocument) docs.push(...allDocuments(f.contentDocument));
      } catch {
        // 跨域 iframe 忽略
      }
    }
    return docs;
  }

  function queryAll(selector) {
    const out = [];
    for (const doc of allDocuments()) out.push(...doc.querySelectorAll(selector));
    return out;
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (rect && rect.width === 0 && rect.height === 0) return false;
    const doc = el.ownerDocument;
    const win = doc.defaultView;
    if (win) {
      const style = win.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  }

  function waitFor(fn, timeoutMs, errMsg) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        let result = null;
        try {
          result = fn();
        } catch {
          // 继续轮询
        }
        if (result) return resolve(result);
        if (Date.now() - start > timeoutMs) return reject(new Error(errMsg));
        setTimeout(tick, 400);
      };
      tick();
    });
  }

  // ---------- 写信入口 ----------

  function findComposeButton() {
    // 经典版固定 id
    const byId = queryAll("#composebtn").find(isVisible);
    if (byId) return byId;
    // 文案匹配：写信 / 写邮件
    const candidates = queryAll("a, button, div[role='button'], span[role='button'], li");
    for (const el of candidates) {
      const text = (el.textContent || "").trim();
      if ((text === "写信" || text === "写邮件" || text === "Compose") && isVisible(el)) return el;
    }
    return null;
  }

  // ---------- 写信表单 ----------

  function findComposeForm() {
    // 经典版：input[name=to] 在 compose 表单里
    const toInput = findRecipientField();
    if (!toInput) return null;
    // 返回一个包含各字段的上下文对象
    return { doc: toInput.ownerDocument };
  }

  function findRecipientField() {
    const strategies = [
      () => queryAll("input[name='to']").find(isVisible),
      () => queryAll("input[name='toemail']").find(isVisible),
      () => queryAll("textarea[name='to']").find(isVisible),
      // 新版：收件人是 contenteditable 区域，常带 placeholder/label
      () =>
        queryAll("div[contenteditable='true']").find(
          (el) => isVisible(el) && /收件人|to/i.test(nearbyLabelText(el)),
        ),
      () => queryAll("input[placeholder*='收件人']").find(isVisible),
    ];
    for (const s of strategies) {
      const el = s();
      if (el) return el;
    }
    return null;
  }

  function nearbyLabelText(el) {
    let node = el;
    for (let i = 0; i < 3 && node; i++) {
      node = node.parentElement;
      if (node) {
        const t = (node.textContent || "").slice(0, 30);
        if (t) return t;
      }
    }
    return "";
  }

  function findSubjectField() {
    const strategies = [
      () => queryAll("input[name='subject']").find(isVisible),
      () => queryAll("input[placeholder*='主题']").find(isVisible),
      () => queryAll("input[placeholder*='Subject']").find(isVisible),
    ];
    for (const s of strategies) {
      const el = s();
      if (el) return el;
    }
    return null;
  }

  function findBodyEditor() {
    // 经典版：QMEditor 富文本 iframe（iframe 内 body 是 contenteditable）
    for (const doc of allDocuments()) {
      for (const iframe of doc.querySelectorAll("iframe")) {
        try {
          const innerBody = iframe.contentDocument && iframe.contentDocument.body;
          if (innerBody && (innerBody.isContentEditable || innerBody.getAttribute("contenteditable") === "true")) {
            return innerBody;
          }
        } catch {
          // 跨域忽略
        }
      }
    }
    // 新版：页面内 contenteditable 大区域（排除收件人小输入区）
    const editables = queryAll("div[contenteditable='true']").filter(isVisible);
    let best = null;
    let bestArea = 0;
    for (const el of editables) {
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > bestArea && rect.height > 100) {
        best = el;
        bestArea = area;
      }
    }
    return best;
  }

  // ---------- 填充 ----------

  function setNativeValue(input, value) {
    const proto = input.tagName === "TEXTAREA"
      ? input.ownerDocument.defaultView.HTMLTextAreaElement.prototype
      : input.ownerDocument.defaultView.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function fillRecipient(_form, to) {
    const field = await waitFor(() => findRecipientField(), 8000, "找不到收件人输入框");
    field.focus();
    if (field.tagName === "INPUT" || field.tagName === "TEXTAREA") {
      setNativeValue(field, to);
    } else {
      // contenteditable
      field.textContent = to;
      field.dispatchEvent(new InputEvent("input", { bubbles: true, data: to }));
    }
    // 触发地址确认（部分界面靠回车/失焦生成收件人 chip）
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    if (typeof field.blur === "function") field.blur();
  }

  function fillSubject(_form, subject) {
    const field = findSubjectField();
    if (!field) return;
    field.focus();
    setNativeValue(field, subject);
  }

  async function fillBody(_form, body) {
    const editor = await waitFor(() => findBodyEditor(), 8000, "找不到正文编辑器");
    editor.focus();
    const html = body
      .split("\n")
      .map((line) => `<div>${escapeHtml(line) || "<br>"}</div>`)
      .join("");
    // 保留编辑器已有签名等内容，插到最前
    editor.innerHTML = html + editor.innerHTML;
    editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ---------- 附件 ----------

  function base64ToFile(item, doc) {
    const binary = atob(item.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const FileCtor = doc.defaultView.File;
    return new FileCtor([bytes], item.filename, { type: item.mimeType });
  }

  async function injectAttachments(form, files) {
    const doc = form.doc || document;

    // 策略 1：找 input[type=file]（写信表单的「添加附件」背后通常有隐藏 file input）
    const fileInput = queryAll("input[type='file']").find((el) => {
      const accept = el.getAttribute("accept") || "";
      return !/image\//.test(accept) || accept === "" || accept === "*/*" || accept === "*";
    });

    const domFiles = files.map((f) => base64ToFile(f, fileInput ? fileInput.ownerDocument : doc));

    if (fileInput) {
      const dt = new (fileInput.ownerDocument.defaultView.DataTransfer)();
      for (const f of domFiles) dt.items.add(f);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    // 策略 2：向写信区域 dispatch drop 事件（模拟拖拽）
    const editor = findBodyEditor();
    const target = editor || doc.body;
    const targetDoc = target.ownerDocument;
    const dt = new (targetDoc.defaultView.DataTransfer)();
    for (const f of files.map((x) => base64ToFile(x, targetDoc))) dt.items.add(f);
    for (const type of ["dragenter", "dragover", "drop"]) {
      const event = new (targetDoc.defaultView.DragEvent)(type, {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      });
      target.dispatchEvent(event);
    }
  }
})();
