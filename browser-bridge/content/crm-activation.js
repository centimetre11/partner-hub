// FineReport 海外激活填报表适配器（oversea_activation_single.cpt）
// 按左侧标签文案定位行，填充下拉 / 文本 / 单选；不代点提交。

(() => {
  if (window.__phBridgeCrmActivationLoaded) return;
  window.__phBridgeCrmActivationLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "fillActivation") return false;
    runFill(message.fields || {})
      .then((r) => sendResponse(r))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: String(err && err.message ? err.message : err),
        }),
      );
    return true;
  });

  // 供 background 在 allFrames executeScript 时直接调用
  window.__phBridgeFillActivation = (fields) => runFill(fields || {});

  async function runFill(fields) {
    if (looksLikeLoginPage()) {
      return { ok: false, error: "请先在本浏览器登录 CRM，再回到 Hub 重试「在 CRM 新建」" };
    }

    // 等待表单标签出现（报表异步渲染）
    await waitFor(() => findLabelCell("Region") || findLabelCell("Company Name"), 25000, "CRM 填报表未加载完成（找不到 Region / Company Name）");

    const warnings = [];

    // 1. Region — 固定下拉
    if (fields.region) {
      const ok = await fillDropdownByLabel("Region", [fields.region], true);
      if (!ok) warnings.push("Region 未匹配，请手选");
    }

    // 2. Country — 别名匹配
    if (fields.country || (fields.countryAliases && fields.countryAliases.length)) {
      const aliases = [
        ...(fields.country ? [fields.country] : []),
        ...(fields.countryAliases || []),
      ];
      const ok = await fillDropdownByLabel("Country", aliases, false);
      if (!ok) warnings.push("Country 未匹配，请手选");
    }

    // 3. Sales
    if (fields.sales) {
      const ok = await fillDropdownByLabel("Sales", [fields.sales], true);
      if (!ok) warnings.push(`Sales「${fields.sales}」未匹配，请手选`);
    }

    // 4. Company Name — 文本
    if (fields.companyName) {
      const ok = await fillTextByLabel("Company Name", fields.companyName);
      if (!ok) warnings.push("Company Name 未找到输入框");
    }

    // 5. Partner type — 伙伴才填；客户留空
    if (fields.partnerType) {
      const ok = await fillDropdownByLabel("Partner type", [fields.partnerType], false);
      if (!ok) {
        // 也尝试中文标签
        const ok2 = await fillDropdownByLabel("Partner Type", [fields.partnerType], false);
        if (!ok2) warnings.push("Partner type 未匹配，请手选");
      }
    }

    // 6. Contact Name
    if (fields.contactName) {
      const ok = await fillTextByLabel("Contact Name", fields.contactName);
      if (!ok) warnings.push("Contact Name 未找到输入框");
    }

    // 7. Contact Title — 单选第一项
    if (fields.contactTitle) {
      const ok = await fillRadioByLabel("Contact Title", fields.contactTitle);
      if (!ok) warnings.push(`Contact Title「${fields.contactTitle}」未选中，请手选`);
    }

    // 8. Email / Phone — 标签可能是 Email / E-mail / Phone / Mobile
    if (fields.email) {
      const ok =
        (await fillTextByLabel("Email", fields.email)) ||
        (await fillTextByLabel("E-mail", fields.email)) ||
        (await fillTextByLabel("邮箱", fields.email));
      if (!ok) warnings.push("Email 未找到输入框");
    }
    if (fields.phone) {
      const ok =
        (await fillTextByLabel("Phone", fields.phone)) ||
        (await fillTextByLabel("Mobile", fields.phone)) ||
        (await fillTextByLabel("电话", fields.phone)) ||
        (await fillTextByLabel("手机", fields.phone));
      if (!ok) warnings.push("Phone 未找到输入框");
    }

    if (warnings.length) {
      return { ok: true, warning: warnings.join("；") };
    }
    return { ok: true };
  }

  // ---------- DOM 辅助 ----------

  function allDocuments(root = document) {
    const docs = [root];
    const frames = root.querySelectorAll("iframe, frame");
    for (const f of frames) {
      try {
        if (f.contentDocument) docs.push(...allDocuments(f.contentDocument));
      } catch {
        // 跨域忽略
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
    if (rect && (rect.width === 0 || rect.height === 0)) return false;
    const win = el.ownerDocument && el.ownerDocument.defaultView;
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
          // continue
        }
        if (result) return resolve(result);
        if (Date.now() - start > timeoutMs) return reject(new Error(errMsg));
        setTimeout(tick, 400);
      };
      tick();
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function looksLikeLoginPage() {
    const text = (document.body && document.body.innerText) || "";
    if (/登录|login|password|密码/i.test(text) && !findLabelCell("Region") && !findLabelCell("Company Name")) {
      // 粗判：有登录字样且没有表单标签
      const pwd = queryAll('input[type="password"]').find(isVisible);
      return Boolean(pwd);
    }
    return false;
  }

  function normalizeLabel(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .replace(/[:：*＊]/g, "")
      .trim()
      .toLowerCase();
  }

  /** 找左侧标签单元格（灰底文字与截图一致） */
  function findLabelCell(label) {
    const target = normalizeLabel(label);
    const candidates = queryAll("td, th, div, span, label");
    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const text = normalizeLabel(el.textContent);
      // 标签单元格通常很短
      if (text === target && (el.textContent || "").trim().length < 40) {
        return el;
      }
    }
    return null;
  }

  /** 从标签单元格走到同行的值单元格 */
  function findValueCellFromLabel(labelEl) {
    const td = labelEl.closest("td, th") || labelEl;
    const tr = td.closest("tr");
    if (tr) {
      const cells = [...tr.children].filter((c) => c.tagName === "TD" || c.tagName === "TH");
      const idx = cells.indexOf(td);
      if (idx >= 0 && idx + 1 < cells.length) return cells[idx + 1];
      // 有时标签与值不在同一行结构，取下一个兄弟 td
      let sib = td.nextElementSibling;
      while (sib) {
        if (sib.tagName === "TD" || sib.tagName === "TH") return sib;
        sib = sib.nextElementSibling;
      }
    }
    // 非 table：找后续兄弟里的输入区
    let node = labelEl.parentElement;
    for (let i = 0; i < 4 && node; i++) {
      const input = node.querySelector("input, textarea, select, [contenteditable='true']");
      if (input && isVisible(input)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function setNativeValue(input, value) {
    const win = input.ownerDocument.defaultView;
    const proto =
      input.tagName === "TEXTAREA"
        ? win.HTMLTextAreaElement.prototype
        : win.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  async function fillTextByLabel(label, value) {
    const labelEl = findLabelCell(label);
    if (!labelEl) return false;
    const valueCell = findValueCellFromLabel(labelEl);
    if (!valueCell) return false;

    const input =
      valueCell.querySelector("input:not([type='hidden']):not([type='radio']):not([type='checkbox']), textarea") ||
      [...valueCell.querySelectorAll("input, textarea")].find(isVisible);
    if (!input) return false;

    input.focus();
    setNativeValue(input, value);
    return true;
  }

  /** 点击下拉箭头并选择匹配项；exact=true 时要求选项全文等于或包含且大小写不敏感精确偏好 */
  async function fillDropdownByLabel(label, aliases, preferExact) {
    const labelEl = findLabelCell(label);
    if (!labelEl) return false;
    const valueCell = findValueCellFromLabel(labelEl);
    if (!valueCell) return false;

    // 先尝试原生 select
    const select = valueCell.querySelector("select");
    if (select) {
      const opts = [...select.options];
      const match = matchOptionText(
        opts.map((o) => o.textContent || ""),
        aliases,
        preferExact,
      );
      if (match == null) return false;
      select.selectedIndex = match;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    // FineReport 自定义下拉：点蓝色箭头或输入框
    const arrow =
      valueCell.querySelector("button, .fr-trigger-btn-up, .fr-trigger-center, span[class*='arrow'], div[class*='trigger']") ||
      [...valueCell.querySelectorAll("*")].find((el) => {
        if (!isVisible(el)) return false;
        const r = el.getBoundingClientRect();
        return r.width <= 28 && r.height <= 28 && r.width >= 12 && /▼|▾|↓/.test(el.textContent || "");
      });

    const input = valueCell.querySelector("input:not([type='hidden'])");

    if (arrow) {
      arrow.click();
    } else if (input) {
      input.focus();
      input.click();
      // 尝试点输入框右侧区域
      const rect = input.getBoundingClientRect();
      const doc = input.ownerDocument;
      const rightEl = doc.elementFromPoint(rect.right - 8, rect.top + rect.height / 2);
      if (rightEl && rightEl !== input) rightEl.click();
    } else {
      return false;
    }

    await sleep(400);

    // 找可见的下拉列表项
    const items = await waitFor(
      () => {
        const listItems = queryAll(
          "li, .fr-combo-list-item, .fr-list-item, div[class*='list-item'], tr[class*='list'], div[role='option']",
        ).filter(isVisible);
        // 过滤掉过短或像表头的
        const texts = listItems.filter((el) => {
          const t = (el.textContent || "").trim();
          return t.length > 0 && t.length < 200;
        });
        return texts.length >= 1 ? texts : null;
      },
      5000,
      "dropdown",
    ).catch(() => null);

    if (!items || !items.length) {
      // 退化为直接往 input 里打字
      if (input && aliases[0]) {
        input.focus();
        setNativeValue(input, aliases[0]);
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        return true;
      }
      return false;
    }

    const texts = items.map((el) => (el.textContent || "").trim());
    const idx = matchOptionText(texts, aliases, preferExact);
    if (idx == null) {
      // 关闭下拉：Esc
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return false;
    }

    items[idx].click();
    await sleep(200);
    return true;
  }

  function matchOptionText(texts, aliases, preferExact) {
    const norms = aliases.map((a) => normalizeLabel(a)).filter(Boolean);
    if (!norms.length) return null;

    // 1) 精确（忽略大小写）
    for (let i = 0; i < texts.length; i++) {
      const t = normalizeLabel(texts[i]);
      if (norms.some((a) => t === a)) return i;
    }
    if (preferExact) {
      // Sales 等：选项包含别名或别名包含选项
      for (let i = 0; i < texts.length; i++) {
        const t = normalizeLabel(texts[i]);
        if (norms.some((a) => t === a || t.includes(a) || a.includes(t))) return i;
      }
      return null;
    }

    // 2) 包含匹配（国家等长文本）
    for (const a of norms) {
      for (let i = 0; i < texts.length; i++) {
        const t = normalizeLabel(texts[i]);
        if (t.includes(a) || a.includes(t)) return i;
      }
    }

    // 3) 别名按空格拆词，全部命中
    for (let i = 0; i < texts.length; i++) {
      const t = normalizeLabel(texts[i]);
      for (const a of norms) {
        const parts = a.split(/[\s/\-_]+/).filter((p) => p.length >= 2);
        if (parts.length && parts.every((p) => t.includes(p))) return i;
      }
    }
    return null;
  }

  async function fillRadioByLabel(label, optionText) {
    const labelEl = findLabelCell(label);
    // Contact Title 区域可能很大，在整页找 radio + 文案
    const target = normalizeLabel(optionText);

    // 优先在标签所在行/后续区域找
    let scope = document;
    if (labelEl) {
      const valueCell = findValueCellFromLabel(labelEl);
      if (valueCell) scope = valueCell;
      else {
        const tr = labelEl.closest("tr");
        if (tr && tr.parentElement) scope = tr.parentElement;
      }
    }

    const radios = [...scope.querySelectorAll('input[type="radio"]')].filter(isVisible);
    for (const radio of radios) {
      const id = radio.id;
      let text = "";
      if (id) {
        const safeId = String(id).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const lab = radio.ownerDocument.querySelector(`label[for="${safeId}"]`);
        if (lab) text = lab.textContent || "";
      }
      if (!text) {
        const parent = radio.parentElement;
        text = (parent && parent.textContent) || "";
      }
      if (normalizeLabel(text).includes(target) || normalizeLabel(text) === target) {
        radio.click();
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }

    // 无 native radio：点带文案的可点击元素
    const clickables = [
      ...scope.querySelectorAll("label, span, div, td, li"),
    ].filter(isVisible);
    for (const el of clickables) {
      const t = normalizeLabel(el.textContent);
      if (t === target || (t.includes(target) && (el.textContent || "").trim().length < 80)) {
        el.click();
        return true;
      }
    }

    // 全局再试一次（第一项）
    const global = queryAll("label, span, div").filter(isVisible);
    for (const el of global) {
      if (normalizeLabel(el.textContent) === target) {
        el.click();
        return true;
      }
    }
    return false;
  }
})();
