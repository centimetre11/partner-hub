// FineReport 海外激活填报表适配器（oversea_activation_single.cpt）
// 按左侧标签文案定位行，填充下拉 / 文本 / 单选；不代点提交。

(() => {
  // 允许扩展升级后重新注入覆盖旧逻辑
  const SCRIPT_VER = "1.1.3";
  if (window.__phBridgeCrmActivationVer === SCRIPT_VER) return;
  window.__phBridgeCrmActivationVer = SCRIPT_VER;
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

  window.__phBridgeFillActivation = (fields) => runFill(fields || {});

  async function runFill(fields) {
    if (looksLikeLoginPage()) {
      return { ok: false, error: "请先在本浏览器登录 CRM，再回到 Hub 重试「在 CRM 新建」" };
    }

    await waitFor(() => findLabelCell("Region") || findLabelCell("Company Name"), 25000, "CRM 填报表未加载完成（找不到 Region / Company Name）");
    await sleep(800);
    await closeOpenDropdowns();

    const warnings = [];

    // 下拉通用策略：输入关键词 → 等待过滤 → 选第一个匹配项 → 关闭浮层 → 稍等再填下一项
    // Region 放慢，避免「太快导致为空」
    if (fields.region) {
      const ok = await fillDropdownByLabel("Region", [fields.region, "中东", "ME"], {
        typeQuery: "中东",
        settleMs: 900,
      });
      if (!ok) warnings.push("Region 未匹配，请手选");
      await sleep(700);
    }

    if (fields.country || (fields.countryAliases && fields.countryAliases.length)) {
      const aliases = [...(fields.country ? [fields.country] : []), ...(fields.countryAliases || [])];
      const ok = await fillDropdownByLabel("Country", aliases, {
        typeQuery: pickTypeQuery(aliases),
        settleMs: 900,
        selectFirstMatch: true,
      });
      if (!ok) warnings.push("Country 未匹配，请手选");
      await sleep(700);
    }

    if (fields.sales) {
      const ok = await fillDropdownByLabel("Sales", [fields.sales], {
        typeQuery: fields.sales,
        settleMs: 900,
        selectFirstMatch: true,
      });
      if (!ok) warnings.push(`Sales「${fields.sales}」未匹配，请手选`);
      await sleep(700);
    }

    // Pre-Sales 按需求先不填

    if (fields.partnerType) {
      const ok =
        (await fillDropdownByLabel("Partner type", [fields.partnerType], {
          typeQuery: "经销商",
          settleMs: 900,
          selectFirstMatch: true,
        })) ||
        (await fillDropdownByLabel("Partner Type", [fields.partnerType], {
          typeQuery: "经销商",
          settleMs: 900,
          selectFirstMatch: true,
        }));
      if (!ok) warnings.push("Partner type 未匹配，请手选");
      await sleep(500);
    }

    await closeOpenDropdowns();
    await sleep(400);

    // 文本 / 单选 / 多选放在下拉之后，避免被浮层打断
    if (fields.companyName) {
      if (!(await fillTextByLabel("Company Name", fields.companyName))) warnings.push("Company Name 未找到输入框");
    }
    if (fields.contactName) {
      // Contact Name 有时是可搜索下拉（显示 Select None）
      const ok =
        (await fillTextByLabel("Contact Name", fields.contactName)) ||
        (await fillDropdownByLabel("Contact Name", [fields.contactName], {
          typeQuery: fields.contactName,
          settleMs: 700,
          selectFirstMatch: true,
          allowTypeOnly: true,
        }));
      if (!ok) warnings.push("Contact Name 未找到输入框");
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
      if (!(await fillPhoneFields(fields))) warnings.push("Phone 未填完整，请手填区号与号码");
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

    await closeOpenDropdowns();

    if (warnings.length) {
      return { ok: true, warning: warnings.join("；") };
    }
    return { ok: true };
  }

  function pickTypeQuery(aliases) {
    const list = (aliases || []).map((a) => String(a || "").trim()).filter(Boolean);
    if (!list.length) return "";
    const withCn = list.filter((a) => /[\u4e00-\u9fff]/.test(a));
    if (withCn.length) {
      const best = withCn.slice().sort((a, b) => a.length - b.length)[0];
      if (best.includes("沙特")) return "沙特";
      if (best.includes("阿联酋") || best.includes("迪拜")) return "阿联酋";
      if (best.length > 6) return best.slice(0, 4);
      return best;
    }
    const short = list.find((a) => a.length <= 4);
    return short || list[0];
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

  /**
   * FineReport 下拉通用：打开 → 输入过滤词 → 等列表 → 选第一个匹配（或过滤后第一项）→ 关闭。
   * opts: { typeQuery, settleMs, selectFirstMatch, allowTypeOnly }
   */
  async function fillDropdownByLabel(label, aliases, opts) {
    const options = typeof opts === "boolean" ? { preferExact: opts } : opts || {};
    const typeQuery = options.typeQuery || pickTypeQuery(aliases) || (aliases && aliases[0]) || "";
    const settleMs = options.settleMs || 800;
    const selectFirstMatch = options.selectFirstMatch !== false;

    await closeOpenDropdowns();
    await sleep(300);

    const labelEl = findLabelCell(label);
    if (!labelEl) return false;
    const valueCell = findValueCellFromLabel(labelEl);
    if (!valueCell) return false;

    const select = valueCell.querySelector("select");
    if (select) {
      const texts = [...select.options].map((o) => o.textContent || "");
      let idx = matchOptionText(texts, aliases, false);
      if (idx == null && selectFirstMatch && texts.length) idx = 0;
      if (idx == null) return false;
      select.selectedIndex = idx;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(settleMs);
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

    // 1) 聚焦并打开
    if (input) {
      input.focus();
      input.click();
      await sleep(200);
    }
    if (arrow) {
      arrow.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      arrow.click();
      await sleep(350);
    } else if (!input) {
      return false;
    }

    // 2) 输入过滤词（国家「沙特」、地区「中东」、销售英文名等）
    if (input && typeQuery) {
      await typeIntoInput(input, typeQuery);
      await sleep(settleMs);
    }

    // 3) 等待下拉项
    let items = await waitFor(
      () => {
        const list = findVisibleDropdownItems();
        return list.length >= 1 ? list : null;
      },
      7000,
      "dropdown",
    ).catch(() => null);

    // 若仍无列表，再点一次箭头重试
    if ((!items || !items.length) && arrow) {
      arrow.click();
      await sleep(500);
      if (input && typeQuery) {
        await typeIntoInput(input, typeQuery);
        await sleep(settleMs);
      }
      items = findVisibleDropdownItems();
    }

    if (!items || !items.length) {
      // 允许仅输入（Contact Name 等）
      if (options.allowTypeOnly && input && typeQuery) {
        await sleep(settleMs);
        await closeOpenDropdowns();
        return Boolean((input.value || "").trim());
      }
      await closeOpenDropdowns();
      return false;
    }

    const texts = items.map((el) => (el.textContent || "").trim());
    let idx = matchOptionText(texts, aliases.length ? aliases : [typeQuery], false);
    // 输入过滤后：优先选第一个匹配；没有精确匹配则选列表第一项
    if (idx == null && selectFirstMatch) idx = 0;
    if (idx == null) {
      await closeOpenDropdowns();
      return false;
    }

    const target = items[idx];
    target.scrollIntoView({ block: "nearest" });
    await sleep(150);
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    target.click();
    await sleep(400);

    // 列表还开着：Enter 确认
    if (findVisibleDropdownItems().length > 0) {
      if (input) {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, keyCode: 13 }));
      }
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, keyCode: 13 }));
      await sleep(300);
    }

    await closeOpenDropdowns();
    await sleep(settleMs);

    if (input) {
      const v = (input.value || "").trim();
      if (!v || /^select\s*none$/i.test(v)) return false;
    }
    return true;
  }

  async function typeIntoInput(input, text) {
    input.focus();
    // 清空
    setNativeValue(input, "");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true }));
    await sleep(50);
    setNativeValue(input, "");
    await sleep(80);

    // 整段写入 + input 事件（FineReport 过滤通常监听 input）
    setNativeValue(input, text);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    input.dispatchEvent(new Event("keyup", { bubbles: true }));
    await sleep(200);

    // 再补一次字符级，兼容只认 keypress 的控件
    if ((input.value || "") !== text) {
      setNativeValue(input, "");
      for (const ch of text) {
        setNativeValue(input, (input.value || "") + ch);
        input.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" }));
        await sleep(40);
      }
    }
  }

  function findVisibleDropdownItems() {
    return queryAll(
      "li, .fr-combo-list-item, .fr-list-item, div[class*='list-item'], tr[class*='list'], div[role='option'], .fr-list-container div, .fr-combo-list div",
    ).filter((el) => {
      if (!isVisible(el)) return false;
      const t = (el.textContent || "").trim();
      // 排除整页大块
      if (!t || t.length > 220) return false;
      const kids = el.querySelectorAll("li, .fr-combo-list-item, .fr-list-item");
      if (kids.length > 2) return false;
      return true;
    });
  }

  async function closeOpenDropdowns() {
    for (let i = 0; i < 4; i++) {
      if (findVisibleDropdownItems().length === 0) break;
      for (const doc of allDocuments()) {
        doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, keyCode: 27 }));
        doc.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true, keyCode: 27 }));
      }
      const body = document.body;
      if (body) {
        body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 4, clientY: 4 }));
      }
      await sleep(220);
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, keyCode: 27 }));
    await sleep(200);
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

    if (inputs.length >= 2) {
      const dialInput = inputs[0];
      const numInput = inputs[1];
      if (dial) {
        await fillDropdownByLabel("Contact phone number", [dial, dial.replace("+", "")], {
          typeQuery: dial,
          settleMs: 700,
          selectFirstMatch: true,
        }).catch(() => false);
        // 若上面按整行填了，再确保号码
        await closeOpenDropdowns();
        if (!(dialInput.value || "").includes(dial.replace("+", "")) && !(dialInput.value || "").includes(dial)) {
          dialInput.focus();
          setNativeValue(dialInput, dial);
        }
      }
      numInput.focus();
      setNativeValue(numInput, local || full.replace(/^\+\d+/, ""));
      await sleep(300);
      return true;
    }

    if (inputs.length === 1) {
      setNativeValue(inputs[0], full);
      return true;
    }

    if (dial) {
      await trySelectInCell(valueCell, [dial, dial.replace("+", "")], true);
      await closeOpenDropdowns();
    }
    const num =
      valueCell.querySelector("input[placeholder*='mobile' i], input[placeholder*='phone' i], input[placeholder*='号码']") ||
      [...valueCell.querySelectorAll("input")].filter(isVisible).pop();
    if (num && (local || full)) {
      setNativeValue(num, local || full.replace(/^\+\d+/, ""));
      return true;
    }
    return Boolean(num);
  }

  async function trySelectInCell(cell, aliases, _preferExact) {
    if (!cell) return false;
    await closeOpenDropdowns();
    const input = cell.querySelector("input:not([type='hidden'])");
    const arrow =
      cell.querySelector("button, .fr-trigger-btn-up, .fr-trigger-center, div[class*='trigger']") ||
      [...cell.querySelectorAll("*")].find((el) => {
        if (!isVisible(el)) return false;
        const r = el.getBoundingClientRect();
        return r.width <= 32 && r.height <= 32 && r.width >= 10;
      });
    if (arrow) arrow.click();
    else if (input) input.click();
    else return false;
    await sleep(400);
    if (input && aliases[0]) await typeIntoInput(input, aliases[0]);
    await sleep(600);
    const items = findVisibleDropdownItems();
    if (!items.length) return false;
    const texts = items.map((el) => (el.textContent || "").trim());
    let idx = matchOptionText(texts, aliases, false);
    if (idx == null) idx = 0;
    items[idx].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    items[idx].click();
    await sleep(250);
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
