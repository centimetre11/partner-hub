// 企业邮写信页适配器：点击写信 → 填充收件人/主题/正文 → 注入附件。
// 兼容经典版（frameset + #toAreaCtrl + QMEditor iframe）与新版（React DOM），
// 所有查找均递归遍历同源 iframe/frame，选择器按多策略依次尝试。

(() => {
  if (window.__phBridgeComposeLoaded) return;
  window.__phBridgeComposeLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "fillCompose") return false;
    runFillCompose(message)
      .then((r) => sendResponse(r))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: `${String(err && err.message ? err.message : err)}【诊断: ${diagnostics()}】`,
        }),
      );
    return true;
  });

  async function runFillCompose({ to, subject, body, files }) {
    // 1. 写信表单未打开时，找到并点击「写信」入口
    if (!findRecipientField()) {
      const btn = await waitFor(() => findComposeButton(), 15000, "找不到「写信」按钮，请确认已登录企业邮");
      btn.click();
    }

    // 2. 等待写信表单出现
    const recipientField = await waitFor(() => findRecipientField(), 15000, "写信表单未出现");

    // 3. 填充主题 / 正文 / 收件人（收件人最后填，避免地址解析弹层干扰）
    if (subject) fillSubject(subject);
    if (body) await fillBody(body);
    await fillRecipient(recipientField, to);

    // 4. 注入附件
    let attachError = null;
    if (files && files.length > 0) {
      try {
        await injectAttachments(files);
      } catch (err) {
        attachError = String(err && err.message ? err.message : err);
      }
    }

    return attachError
      ? { ok: true, warning: `内容已填充，但附件注入失败：${attachError}，请手动添加` }
      : { ok: true };
  }

  // ---------- 查找辅助：递归遍历同源 iframe / frame ----------

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

  function diagnostics() {
    try {
      const docs = allDocuments();
      const parts = [
        `frames=${docs.length}`,
        `toArea=${queryAll("#toAreaCtrl").length}`,
        `toInput=${queryAll("input[name='to']").length}`,
        `addrText=${queryAll(".addr_text, .addr_area input").length}`,
        `subject=${queryAll("input[name='subject'], #subject").length}`,
        `editableIframe=${countEditableIframes()}`,
        `fileInput=${queryAll("input[type='file']").length}`,
      ];
      return parts.join(", ");
    } catch (err) {
      return `diag failed: ${err.message}`;
    }
  }

  function countEditableIframes() {
    let n = 0;
    for (const doc of allDocuments()) {
      for (const iframe of doc.querySelectorAll("iframe")) {
        try {
          const d = iframe.contentDocument;
          if (d && d.body && (d.body.isContentEditable || d.designMode === "on")) n++;
        } catch {
          // 忽略
        }
      }
    }
    return n;
  }

  // ---------- 写信入口 ----------

  function findComposeButton() {
    const byId = queryAll("#composebtn").find(isVisible);
    if (byId) return byId;
    const candidates = queryAll("a, button, div[role='button'], span[role='button'], li");
    for (const el of candidates) {
      const text = (el.textContent || "").trim();
      if ((text === "写信" || text === "写邮件" || text === "Compose") && isVisible(el)) return el;
    }
    return null;
  }

  // ---------- 字段定位 ----------

  function findRecipientField() {
    const strategies = [
      // 经典版：收件人地址区（chip 输入框）
      () => queryAll("#toAreaCtrl input[type='text']").find(isVisible),
      () => queryAll(".addr_area input[type='text'], input.addr_text").find(isVisible),
      // 通用 name 匹配
      () => queryAll("input[name='to']").find(isVisible),
      () => queryAll("textarea[name='to']").find(isVisible),
      () => queryAll("input[name='toemail']").find(isVisible),
      // 行标签匹配：所在行文本以「收件人」开头的可见文本框
      () => findInputByRowLabel(/^收件人/),
      // 新版：contenteditable 收件人区
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

  function findInputByRowLabel(labelRe) {
    for (const input of queryAll("input[type='text'], input:not([type])")) {
      if (!isVisible(input)) continue;
      const row = input.closest("tr, .compose_field, .field, li, div");
      if (row && labelRe.test((row.textContent || "").trim().slice(0, 12))) return input;
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
      () => queryAll("#subject").find(isVisible),
      () => queryAll("input[placeholder*='主题']").find(isVisible),
      () => queryAll("input[placeholder*='Subject']").find(isVisible),
      () => findInputByRowLabel(/^主\s*题/),
    ];
    for (const s of strategies) {
      const el = s();
      if (el) return el;
    }
    return null;
  }

  function findBodyEditor() {
    // 经典版：QMEditor 富文本 iframe（iframe 内 body contenteditable 或 designMode=on）
    for (const doc of allDocuments()) {
      for (const iframe of doc.querySelectorAll("iframe")) {
        try {
          const innerDoc = iframe.contentDocument;
          const innerBody = innerDoc && innerDoc.body;
          if (
            innerBody &&
            isVisible(iframe) &&
            (innerBody.isContentEditable ||
              innerBody.getAttribute("contenteditable") === "true" ||
              innerDoc.designMode === "on")
          ) {
            return innerBody;
          }
        } catch {
          // 跨域忽略
        }
      }
    }
    // 新版：页面内最大的 contenteditable 区域
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
    const win = input.ownerDocument.defaultView;
    const proto = input.tagName === "TEXTAREA"
      ? win.HTMLTextAreaElement.prototype
      : win.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function pressKey(el, key, keyCode) {
    const win = el.ownerDocument.defaultView;
    for (const type of ["keydown", "keypress", "keyup"]) {
      el.dispatchEvent(
        new win.KeyboardEvent(type, { key, keyCode, which: keyCode, bubbles: true, cancelable: true }),
      );
    }
  }

  async function fillRecipient(field, to) {
    field.focus();
    if (field.tagName === "INPUT" || field.tagName === "TEXTAREA") {
      setNativeValue(field, to);
    } else {
      field.textContent = to;
      field.dispatchEvent(new InputEvent("input", { bubbles: true, data: to }));
    }
    // 经典版靠回车/分号/失焦把地址解析成 chip；多管齐下
    pressKey(field, "Enter", 13);
    if (typeof field.blur === "function") field.blur();
    field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    // 若解析后输入框被清空但没有生成 chip，再补一次值兜底
    await new Promise((r) => setTimeout(r, 300));
    if (
      (field.tagName === "INPUT" || field.tagName === "TEXTAREA") &&
      !field.value &&
      !hasAddressChip(field)
    ) {
      setNativeValue(field, to);
    }
  }

  function hasAddressChip(field) {
    const area = field.closest("#toAreaCtrl, .addr_area");
    if (!area) return false;
    return Boolean(area.querySelector(".addr_base:not(.addr_input), .addr_normal, .addr_item"));
  }

  function fillSubject(subject) {
    const field = findSubjectField();
    if (!field) return;
    field.focus();
    setNativeValue(field, subject);
  }

  async function fillBody(body) {
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

  async function injectAttachments(files) {
    // 策略 1：写信表单的「添加附件」背后通常有隐藏 file input
    const fileInput = queryAll("input[type='file']").find((el) => {
      const accept = el.getAttribute("accept") || "";
      return accept === "" || accept === "*/*" || accept === "*" || !/^image\//.test(accept);
    });

    if (fileInput) {
      const win = fileInput.ownerDocument.defaultView;
      const dt = new win.DataTransfer();
      for (const f of files) dt.items.add(base64ToFile(f, fileInput.ownerDocument));
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    // 策略 2：向正文编辑区 dispatch drop 事件（模拟拖拽）
    const editor = findBodyEditor();
    const target = editor || document.body;
    const targetDoc = target.ownerDocument;
    const win = targetDoc.defaultView;
    const dt = new win.DataTransfer();
    for (const f of files) dt.items.add(base64ToFile(f, targetDoc));
    for (const type of ["dragenter", "dragover", "drop"]) {
      target.dispatchEvent(
        new win.DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }),
      );
    }
  }
})();
