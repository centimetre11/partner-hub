// 企业邮写信页适配器：点击写信 → 填充收件人/主题/正文 → 注入附件。
// 关键设计：先定位正文编辑器（QMEditor iframe / contenteditable），以其所在文档为
// 「写信表单文档」，收件人/主题/附件均只在该文档内查找，避免误填顶层搜索框等无关输入。

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

  async function runFillCompose({ to, subject, body, bodyHtml, files }) {
    // 1. 写信表单未打开时，点击「写信」入口
    if (!findEditorBody()) {
      const btn = await waitFor(() => findComposeButton(), 15000, "找不到「写信」按钮，请确认已登录企业邮");
      btn.click();
    }

    // 2. 等待写信表单（以正文编辑器出现为准）
    const editorBody = await waitFor(() => findEditorBody(), 15000, "写信表单未出现（找不到正文编辑器）");
    // 写信表单文档：编辑器 iframe 所在的文档（经典版），或编辑器自身所在文档（新版）
    const composeDoc = editorBody.__phComposeDoc || editorBody.ownerDocument;

    const problems = [];

    // 3. 主题（仅在写信表单文档内查找）
    if (subject) {
      const subjectField = findSubjectField(composeDoc);
      if (subjectField) {
        subjectField.focus();
        setNativeValue(subjectField, subject);
      } else {
        problems.push("主题输入框未找到");
      }
    }

    // 4. 正文（优先 HTML 富文本）
    if (body || bodyHtml) fillBody(editorBody, body, bodyHtml);

    // 5. 收件人
    const recipientField = findRecipientField(composeDoc);
    if (recipientField) {
      await fillRecipient(recipientField, to);
    } else {
      problems.push("收件人输入框未找到");
    }

    // 6. 附件
    if (files && files.length > 0) {
      try {
        await injectAttachments(composeDoc, files);
      } catch (err) {
        problems.push(`附件注入失败：${String(err && err.message ? err.message : err)}`);
      }
    }

    if (problems.length > 0) {
      return { ok: true, warning: `${problems.join("；")}【诊断: ${diagnostics(composeDoc)}】` };
    }
    return { ok: true };
  }

  // ---------- 文档遍历 ----------

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

  function queryAllGlobal(selector) {
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

  function diagnostics(composeDoc) {
    try {
      const doc = composeDoc || document;
      const parts = [
        `frames=${allDocuments().length}`,
        `scoped=${composeDoc ? "yes" : "no"}`,
        `toArea=${doc.querySelectorAll("#toAreaCtrl").length}`,
        `toInput=${doc.querySelectorAll("input[name='to'], .addr_text").length}`,
        `subject=${doc.querySelectorAll("input[name='subject'], #subject").length}`,
        `fileInput=${doc.querySelectorAll("input[type='file']").length}`,
        `textInputs=${doc.querySelectorAll("input[type='text']").length}`,
      ];
      return parts.join(", ");
    } catch (err) {
      return `diag failed: ${err.message}`;
    }
  }

  // ---------- 写信入口 ----------

  function findComposeButton() {
    const byId = queryAllGlobal("#composebtn").find(isVisible);
    if (byId) return byId;
    const candidates = queryAllGlobal("a, button, div[role='button'], span[role='button'], li");
    for (const el of candidates) {
      const text = (el.textContent || "").trim();
      if ((text === "写信" || text === "写邮件" || text === "Compose") && isVisible(el)) return el;
    }
    return null;
  }

  // ---------- 正文编辑器（写信表单的锚点）----------

  function findEditorBody() {
    // 经典版：QMEditor iframe（body contenteditable 或 designMode=on）
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
            innerBody.__phComposeDoc = doc; // 编辑器 iframe 所在文档 = 写信表单文档
            return innerBody;
          }
        } catch {
          // 跨域忽略
        }
      }
    }
    // 新版：页面内最大的 contenteditable 区域
    const editables = queryAllGlobal("div[contenteditable='true']").filter(isVisible);
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
    if (best) best.__phComposeDoc = best.ownerDocument;
    return best;
  }

  // ---------- 字段定位（限定写信表单文档）----------

  function findRecipientField(doc) {
    const strategies = [
      () => Array.from(doc.querySelectorAll("#toAreaCtrl input[type='text']")).find(isVisible),
      () =>
        Array.from(doc.querySelectorAll(".addr_area input[type='text'], input.addr_text")).find(isVisible),
      () => Array.from(doc.querySelectorAll("input[name='to']")).find(isVisible),
      () => Array.from(doc.querySelectorAll("textarea[name='to']")).find(isVisible),
      () => findInputByRowLabel(doc, /^收件人/),
      () =>
        Array.from(doc.querySelectorAll("div[contenteditable='true']")).find(
          (el) => isVisible(el) && /收件人|to/i.test(nearbyLabelText(el)),
        ),
      () => Array.from(doc.querySelectorAll("input[placeholder*='收件人']")).find(isVisible),
    ];
    for (const s of strategies) {
      const el = s();
      if (el) return el;
    }
    return null;
  }

  function findSubjectField(doc) {
    const strategies = [
      () => Array.from(doc.querySelectorAll("input[name='subject']")).find(isVisible),
      () => (isVisible(doc.querySelector("#subject")) ? doc.querySelector("#subject") : null),
      () => Array.from(doc.querySelectorAll("input[placeholder*='主题']")).find(isVisible),
      () => findInputByRowLabel(doc, /^主\s*题/),
    ];
    for (const s of strategies) {
      const el = s();
      if (el) return el;
    }
    return null;
  }

  function findInputByRowLabel(doc, labelRe) {
    for (const input of doc.querySelectorAll("input[type='text'], input:not([type])")) {
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
    // 经典版靠回车/失焦把地址解析成 chip
    pressKey(field, "Enter", 13);
    if (typeof field.blur === "function") field.blur();
    field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    // 解析后输入框被清空且没生成 chip 时，补一次值兜底
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

  function fillBody(editorBody, body, bodyHtml) {
    editorBody.focus();
    const html = bodyHtml && bodyHtml.trim()
      ? bodyHtml
      : body
        .split("\n")
        .map((line) => `<div>${escapeHtml(line) || "<br>"}</div>`)
        .join("");
    // 保留编辑器已有签名等内容，插到最前
    editorBody.innerHTML = html + editorBody.innerHTML;
    editorBody.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ---------- 附件（限定写信表单文档）----------

  function base64ToFile(item, doc) {
    const binary = atob(item.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const FileCtor = doc.defaultView.File;
    return new FileCtor([bytes], item.filename, { type: item.mimeType });
  }

  async function injectAttachments(composeDoc, files) {
    // 策略 1：写信表单内的 file input（「添加附件」背后的隐藏 input）
    const fileInput = Array.from(composeDoc.querySelectorAll("input[type='file']")).find((el) => {
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
    const editor = findEditorBody();
    const target = editor || composeDoc.body;
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
