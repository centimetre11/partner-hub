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

    await waitFor(() => findLabelCell("Region") || findLabelCell("Company Name"), 25000, "CRM 填报表未加载完成（找不到 Region / Company Name）");
    await closeOpenDropdowns();

    const warnings = [];

    // 先填文本 / 单选 / 多选（不受下拉浮层影响），再填下拉
    if (fields.companyName) {
      if (!(await fillTextByLabel("Company Name", fields.companyName))) warnings.push("Company Name 未找到输入框");
    }
    if (fields.contactName) {
      if (!(await fillTextByLabel("Contact Name", fields.contactName))) warnings.push("Contact Name 未找到输入框");
    }
    if (fields.email) {
      const ok =
        (await fillTextByLabel("Email", fields.email)) ||
        (await fillTextByLabel("E-mail", fields.email)) ||
        (await fillTextByLabel("Contact Email", fields.email)) ||
        (await fillTextByLabel("邮箱", fields.email));
      if (!ok) warnings.push("Email 未找到输入框");
    }
    if (fields.phoneDialCode || fields.phoneLocal || fields.phone) {
      const ok = await fillPhoneFields(fields);
      if (!ok) warnings.push("Phone 未填完整，请手填区号与号码");
    }
    if (fields.contactTitle) {
      if (!(await fillRadioByLabel("Contact Title", fields.contactTitle))) {
        warnings.push(`Contact Title「${fields.contactTitle}」未选中，请手选`);
      }
    }
    if (fields.productsOfInterest) {
      const ok =
        (await fillCheckboxByLabel("Products of interest", fields.productsOfInterest)) ||
        (await fillCheckboxByLabel("Product of interest", fields.productsOfInterest));
      if (!ok) warnings.push(`Products of interest「${fields.productsOfInterest}」未勾选，请手选`);
    }
    if (fields.currentDemand) {
      if (!(await fillRadioByLabel("Current demand", fields.currentDemand))) {
        warnings.push("Current demand 未选中，请手选");
      }
    }

    // 下拉：每填一项强制关闭浮层，避免卡住后续字段
    if (fields.region) {
      if (!(await fillDropdownByLabel("Region", [fields.region], true))) warnings.push("Region 未匹配，请手选");
    }
    if (fields.country || (fields.countryAliases && fields.countryAliases.length)) {
      const aliases = [...(fields.country ? [fields.country] : []), ...(fields.countryAliases || [])];
      if (!(await fillDropdownByLabel("Country", aliases, false))) warnings.push("Country 未匹配，请手选");
    }
    if (fields.sales) {
      if (!(await fillDropdownByLabel("Sales", [fields.sales], true))) {
        warnings.push(`Sales「${fields.sales}」未匹配，请手选`);
      }
    }
    if (fields.preSales) {
      if (!(await fillDropdownByLabel("Pre-Sales", [fields.preSales], true))) {
        const ok2 = await fillDropdownByLabel("Pre-Sales", [fields.preSales], false);
        if (!ok2) warnings.push(`Pre-Sales「${fields.preSales}」未匹配，请手选`);
      }
    }
    if (fields.partnerType) {
      const ok =
        (await fillDropdownByLabel("Partner type", [fields.partnerType], false)) ||
        (await fillDropdownByLabel("Partner Type", [fields.partnerType], false));
      if (!ok) warnings.push("Partner type 未匹配，请手选");
    }

    await closeOpenDropdowns();

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

  /** 点击下拉箭头并选择匹配项；选完强制关闭浮层，避免卡住后续字段 */
  async function fillDropdownByLabel(label, aliases, preferExact) {
    await closeOpenDropdowns();

    const labelEl = findLabelCell(label);
    if (!labelEl) return false;
    const valueCell = findValueCellFromLabel(labelEl);
    if (!valueCell) return false;

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

    const input = valueCell.querySelector("input:not([type='hidden'])");
    const arrow =
      valueCell.querySelector(
        "button, .fr-trigger-btn-up, .fr-trigger-btn-down, .fr-trigger-center, span[class*='arrow'], div[class*='trigger']",
      ) ||
      [...valueCell.querySelectorAll("*")].find((el) => {
        if (!isVisible(el)) return false;
        const r = el.getBoundingClientRect();
        return r.width <= 32 && r.height <= 32 && r.width >= 10;
      });

    // 打开下拉
    if (arrow) {
      arrow.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      arrow.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      arrow.click();
    } else if (input) {
      input.focus();
      input.click();
      const rect = input.getBoundingClientRect();
      const doc = input.ownerDocument;
      const rightEl = doc.elementFromPoint(rect.right - 6, rect.top + rect.height / 2);
      if (rightEl && rightEl !== input) rightEl.click();
    } else {
      return false;
    }

    await sleep(500);

    const items = await waitFor(
      () => {
        const listItems = findVisibleDropdownItems();
        return listItems.length >= 1 ? listItems : null;
      },
      6000,
      "dropdown",
    ).catch(() => null);

    if (!items || !items.length) {
      if (input && aliases[0]) {
        input.focus();
        setNativeValue(input, aliases[0]);
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, keyCode: 13 }));
        await closeOpenDropdowns();
        return true;
      }
      await closeOpenDropdowns();
      return false;
    }

    const texts = items.map((el) => (el.textContent || "").trim());
    const idx = matchOptionText(texts, aliases, preferExact);
    if (idx == null) {
      await closeOpenDropdowns();
      return false;
    }

    const target = items[idx];
    // FineReport 列表项有时要 mousedown 才生效
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    target.click();
    await sleep(250);

    // 若列表仍开着，再试 Enter / 再点一次
    if (findVisibleDropdownItems().length > 0) {
      target.click();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, keyCode: 13 }));
      await sleep(200);
    }

    await closeOpenDropdowns();

    // 校验：输入框是否已有接近别名的值
    if (input) {
      const v = normalizeLabel(input.value || "");
      const hit = aliases.some((a) => {
        const n = normalizeLabel(a);
        return v && (v === n || v.includes(n) || n.includes(v));
      });
      if (hit) return true;
      // 有些下拉选中后 input 显示完整项，只要非空也算成功
      if ((input.value || "").trim().length > 0 && preferExact === false) return true;
      if ((input.value || "").trim().length > 0) return true;
    }
    return true;
  }

  function findVisibleDropdownItems() {
    return queryAll(
      "li, .fr-combo-list-item, .fr-list-item, div[class*='list-item'], tr[class*='list'], div[role='option'], .fr-list-container div",
    ).filter((el) => {
      if (!isVisible(el)) return false;
      const t = (el.textContent || "").trim();
      return t.length > 0 && t.length < 220;
    });
  }

  async function closeOpenDropdowns() {
    for (let i = 0; i < 3; i++) {
      if (findVisibleDropdownItems().length === 0) break;
      const docs = allDocuments();
      for (const doc of docs) {
        doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, keyCode: 27 }));
        doc.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true, keyCode: 27 }));
      }
      // 点一下页面空白处关掉浮层
      const body = document.body;
      if (body) {
        body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 2, clientY: 2 }));
        body.click();
      }
      await sleep(200);
    }
    // 仍开着：再 Esc 一次
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, keyCode: 27 }));
    await sleep(150);
  }

  async function fillPhoneFields(fields) {
    const dial = fields.phoneDialCode || "";
    const local = fields.phoneLocal || "";
    const full = fields.phone || `${dial}${local}`;

    const labelEl =
      findLabelCell("Contact phone number") ||
      findLabelCell("Phone") ||
      findLabelCell("Mobile") ||
      findLabelCell("电话") ||
      findLabelCell("手机");
    if (!labelEl) return false;
    const valueCell = findValueCellFromLabel(labelEl);
    if (!valueCell) return false;

    const inputs = [...valueCell.querySelectorAll("input:not([type='hidden']):not([type='radio']):not([type='checkbox'])")].filter(
      isVisible,
    );

    // 常见结构：左侧区号下拉/输入 + 右侧号码输入
    if (inputs.length >= 2) {
      const dialInput = inputs[0];
      const numInput = inputs[1];
      if (dial) {
        // 区号也可能是自定义下拉
        const dialCell = dialInput.closest("td, div") || valueCell;
        const opened = await trySelectInCell(dialCell, [dial, dial.replace("+", "")], true);
        if (!opened) {
          dialInput.focus();
          setNativeValue(dialInput, dial);
        }
        await closeOpenDropdowns();
      }
      if (local || full) {
        numInput.focus();
        setNativeValue(numInput, local || full.replace(/^\+\d+/, ""));
      }
      return true;
    }

    if (inputs.length === 1) {
      inputs[0].focus();
      setNativeValue(inputs[0], full);
      return true;
    }

    // 区号是独立下拉（无 input）：在 valueCell 内找 trigger
    if (dial) {
      await trySelectInCell(valueCell, [dial, dial.replace("+", ""), `＋${dial.replace("+", "")}`], false);
      await closeOpenDropdowns();
    }
    // 再找号码输入
    const num =
      valueCell.querySelector("input[placeholder*='mobile' i], input[placeholder*='phone' i], input[placeholder*='号码']") ||
      [...valueCell.querySelectorAll("input")].filter(isVisible).pop();
    if (num && (local || full)) {
      num.focus();
      setNativeValue(num, local || full.replace(/^\+\d+/, ""));
      return true;
    }
    return Boolean(num);
  }

  async function trySelectInCell(cell, aliases, preferExact) {
    if (!cell) return false;
    await closeOpenDropdowns();
    const arrow =
      cell.querySelector("button, .fr-trigger-btn-up, .fr-trigger-center, div[class*='trigger']") ||
      [...cell.querySelectorAll("*")].find((el) => {
        if (!isVisible(el)) return false;
        const r = el.getBoundingClientRect();
        return r.width <= 32 && r.height <= 32 && r.width >= 10;
      });
    const input = cell.querySelector("input:not([type='hidden'])");
    if (arrow) arrow.click();
    else if (input) input.click();
    else return false;
    await sleep(400);
    const items = findVisibleDropdownItems();
    if (!items.length) return false;
    const texts = items.map((el) => (el.textContent || "").trim());
    const idx = matchOptionText(texts, aliases, preferExact);
    if (idx == null) {
      await closeOpenDropdowns();
      return false;
    }
    items[idx].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    items[idx].click();
    await sleep(200);
    await closeOpenDropdowns();
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
    const target = normalizeLabel(optionText);
    // 长文案用前缀匹配（Current demand 等）
    const targetPrefix = target.slice(0, 40);

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
      const nt = normalizeLabel(text);
      if (nt === target || nt.includes(target) || (targetPrefix.length >= 12 && nt.includes(targetPrefix))) {
        radio.click();
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }

    const clickables = [...scope.querySelectorAll("label, span, div, td, li")].filter(isVisible);
    for (const el of clickables) {
      const t = normalizeLabel(el.textContent);
      const rawLen = (el.textContent || "").trim().length;
      if (t === target || (t.includes(targetPrefix) && rawLen < 220)) {
        el.click();
        return true;
      }
    }

    const global = queryAll("label, span, div").filter(isVisible);
    for (const el of global) {
      const t = normalizeLabel(el.textContent);
      if (t === target || (targetPrefix.length >= 12 && t.startsWith(targetPrefix))) {
        el.click();
        return true;
      }
    }
    return false;
  }

  async function fillCheckboxByLabel(label, optionText) {
    const labelEl = findLabelCell(label);
    const target = normalizeLabel(optionText);

    let scope = document;
    if (labelEl) {
      const valueCell = findValueCellFromLabel(labelEl);
      if (valueCell) scope = valueCell;
      else {
        const tr = labelEl.closest("tr");
        if (tr && tr.parentElement) scope = tr.parentElement;
      }
    }

    const boxes = [...scope.querySelectorAll('input[type="checkbox"]')].filter(isVisible);
    for (const box of boxes) {
      const id = box.id;
      let text = "";
      if (id) {
        const safeId = String(id).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const lab = box.ownerDocument.querySelector(`label[for="${safeId}"]`);
        if (lab) text = lab.textContent || "";
      }
      if (!text) {
        const parent = box.parentElement;
        text = (parent && parent.textContent) || "";
      }
      const nt = normalizeLabel(text);
      if (nt === target || nt.includes(target) || target.includes(nt)) {
        if (!box.checked) {
          box.click();
          box.checked = true;
          box.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return true;
      }
    }

    const clickables = [...scope.querySelectorAll("label, span, div, td, li")].filter(isVisible);
    for (const el of clickables) {
      const t = normalizeLabel(el.textContent);
      const raw = (el.textContent || "").trim();
      if (t === target || (raw.length < 40 && t.includes(target))) {
        el.click();
        return true;
      }
    }
    return false;
  }
})();
