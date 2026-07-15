// FineReport 海外激活填报表适配器（oversea_activation_single.cpt）
// 按左侧标签文案定位行，填充下拉 / 文本 / 单选；不代点提交。

(() => {
  // 允许扩展升级后重新注入覆盖旧逻辑
  const SCRIPT_VER = "1.1.17";
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
    const phoneLocal =
      (fields.phoneLocal && String(fields.phoneLocal).replace(/\D/g, "")) ||
      "500000000";
    const emailSnapshot = fields.email || "";

    // ========== 1) 先填纯文本（与公司名同一套 focus + setNativeValue）==========
    // 号码框也是普通 input，不要跟区号下拉绑在一起搞复杂
    if (fields.companyName) {
      if (!(await fillTextByLabel("Company Name", fields.companyName))) {
        warnings.push("Company Name 未找到输入框");
      }
    }
    if (fields.contactName) {
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
    if (emailSnapshot) {
      const ok =
        (await fillTextByLabel("Contact Email", emailSnapshot)) ||
        (await fillTextByLabel("Email", emailSnapshot)) ||
        (await fillTextByLabel("E-mail", emailSnapshot)) ||
        (await fillTextByLabel("邮箱", emailSnapshot));
      if (!ok) warnings.push("Email 未找到输入框");
    }
    // 号码放到区号选完之后再写（未选区号时框可能拒写）

    // ========== 2) 再处理下拉 ==========
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

    if (fields.preSales) {
      const ok = await fillDropdownByLabel("Pre-Sales", [fields.preSales], {
        typeQuery: fields.preSales,
        settleMs: 900,
        selectFirstMatch: true,
      });
      if (!ok) warnings.push(`Pre-Sales「${fields.preSales}」未匹配，请手选`);
      await sleep(700);
    }

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

    if (fields.customerSource) {
      const ok =
        (await fillDropdownByLabel("Customer Source", [fields.customerSource, "partner_referral", "Partner/Customer introduction"], {
          typeQuery: "partner_referral",
          settleMs: 900,
          selectFirstMatch: true,
        })) ||
        (await fillDropdownByLabel("Customer source", [fields.customerSource, "partner_referral"], {
          typeQuery: "partner_referral",
          settleMs: 900,
          selectFirstMatch: true,
        }));
      if (!ok) warnings.push("Customer Source 未匹配，请手选");
      await sleep(500);
    }

    await closeOpenDropdowns();
    await sleep(300);

    // ========== 3) 单选 / 多选 ==========
    if (fields.contactTitle) {
      const ok =
        (await fillRadioByLabel("Contact Title", fields.contactTitle)) ||
        (await fillRadioByLabel("Job Title", fields.contactTitle)) ||
        (await fillRadioByLabel("Title", fields.contactTitle)) ||
        (await clickOptionByText(fields.contactTitle));
      if (!ok) warnings.push(`Contact Title「${fields.contactTitle}」未选中，请手选`);
    }
    if (fields.productsOfInterest) {
      const ok =
        (await fillCheckboxByLabel("Products of interest", fields.productsOfInterest)) ||
        (await fillCheckboxByLabel("Product of interest", fields.productsOfInterest)) ||
        (await clickOptionByText(fields.productsOfInterest));
      if (!ok) warnings.push(`Products「${fields.productsOfInterest}」未勾选，请手选`);
    }
    if (fields.currentDemand) {
      const ok =
        (await fillRadioByLabel("Current demand", fields.currentDemand)) ||
        (await clickOptionByText(fields.currentDemand, { prefixLen: 40 }));
      if (!ok) warnings.push("Current demand 未选中，请手选");
    }

    // ========== 4) 区号下拉（上弹、选第二项）；与号码写入拆开 ==========
    try {
      const dialOk = await fillDialCodeOnly(fields);
      if (!dialOk) warnings.push("电话区号未选中，请手选");
    } catch (err) {
      warnings.push(`区号异常：${String(err && err.message ? err.message : err)}`);
    }
    await closeOpenDropdowns();
    await sleep(400);

    // ========== 5) 区号选完后写号码：按 placeholder 全局定位（不依赖单元格）==========
    await sleep(500);
    let numOk = await fillPhoneLocalLikeText(phoneLocal);
    if (!numOk) {
      await sleep(500);
      numOk = await fillPhoneLocalLikeText(phoneLocal);
    }
    if (!numOk) {
      await sleep(400);
      numOk = await fillPhoneLocalLikeText(phoneLocal);
    }
    if (!numOk) warnings.push("Phone 号码未写入，请手填");

    await closeOpenDropdowns();
    if (emailSnapshot) await restoreEmailIfNeeded(emailSnapshot);

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

  /** 只改 value + input，不 blur（中途 blur 会导致 FineReport 用空模型盖掉显示值） */
  function setNativeValue(input, value) {
    const win = input.ownerDocument.defaultView;
    const proto =
      input.tagName === "TEXTAREA"
        ? win.HTMLTextAreaElement.prototype
        : win.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    try {
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: String(value), inputType: "insertText" }));
    } catch (_) {}
  }

  /**
   * FineReport 文本框要真正进模型：点击进入 → 写入 → change → 再 blur。
   * 原先只 set value 再立刻 blur，看起来有字，一点击就被控件用空值刷掉。
   */
  async function commitTextInput(input, value) {
    if (!input || value == null) return false;
    const text = String(value);

    input.scrollIntoView({ block: "center", inline: "nearest" });
    await sleep(60);

    const r = input.getBoundingClientRect();
    const x = Math.floor(r.left + Math.min(Math.max(r.width * 0.45, 16), Math.max(r.width - 12, 16)));
    const y = Math.floor(r.top + r.height / 2);
    const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
    input.dispatchEvent(new MouseEvent("mousedown", opts));
    input.dispatchEvent(new MouseEvent("mouseup", opts));
    input.dispatchEvent(new MouseEvent("click", opts));
    input.focus();
    await sleep(100);

    try {
      input.select && input.select();
    } catch (_) {}
    setNativeValue(input, "");
    await sleep(50);

    let committed = false;
    try {
      if (document.execCommand && document.execCommand("insertText", false, text)) {
        const v = String(input.value || "");
        committed = v === text || (text.length >= 4 && v.includes(text.slice(0, 4)));
      }
    } catch (_) {}

    if (!committed) {
      setNativeValue(input, text);
      await sleep(80);
      committed = String(input.value || "") === text;
    }

    if (!committed || String(input.value || "") !== text) {
      setNativeValue(input, "");
      let acc = "";
      for (const ch of text) {
        acc += ch;
        input.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
        setNativeValue(input, acc);
        try {
          input.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" }));
        } catch (_) {}
        input.dispatchEvent(new KeyboardEvent("keypress", { key: ch, bubbles: true, charCode: ch.charCodeAt(0) }));
        input.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
        await sleep(20);
      }
    }

    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(120);
    try {
      input.blur && input.blur();
    } catch (_) {}
    input.dispatchEvent(new Event("blur", { bubbles: true }));
    await sleep(150);

    // blur 后值仍在，才算真正写入模型
    const final = String(input.value || "").trim();
    return final === text.trim() || (text.trim().length >= 4 && final.includes(text.trim().slice(0, 4)));
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

    return await commitTextInput(input, value);
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

  /**
   * 号码写入：与公司名同属普通文本，但定位必须用 placeholder（「only enter…」），
   * 不能只靠标签右侧单元格（FineReport 常把区号/号码拆在不同控件里）。
   */
  async function fillPhoneLocalLikeText(local) {
    await closeOpenDropdowns();
    await sleep(100);

    const input = findPhoneNumberInputGlobal();
    if (!input) return false;

    // 解锁（区号未选时可能 readonly）
    try {
      input.removeAttribute("readonly");
      input.removeAttribute("disabled");
      input.readOnly = false;
      input.disabled = false;
    } catch (_) {}

    input.scrollIntoView({ block: "center", inline: "nearest" });
    await sleep(80);

    // 号码框很宽：点「右半区中心」，远离左侧区号箭头，避免点偏
    // x ≈ 左 + 70% 宽度；再兜底 60%、80% 各点一次
    await clickSafeInsidePhoneNumberBox(input);
    input.focus();
    await sleep(150);

    // 与公司名相同：原生 value setter + input/change（先不 blur，写完再 blur）
    setNativeValueNoBlur(input, local);
    await sleep(150);

    if (String(input.value || "").replace(/\D/g, "").length < 6) {
      // 同下拉过滤的逐字写入
      await typeIntoInput(input, local);
      await sleep(150);
    }

    if (String(input.value || "").replace(/\D/g, "").length < 6) {
      try {
        input.select && input.select();
        if (document.execCommand) document.execCommand("insertText", false, local);
      } catch (_) {}
      await sleep(100);
    }

    // 最后再 blur + change，对齐公司名收尾
    input.dispatchEvent(new Event("change", { bubbles: true }));
    try {
      input.blur && input.blur();
    } catch (_) {}
    await sleep(100);

    return String(input.value || "").replace(/\D/g, "").length >= 6;
  }

  function setNativeValueNoBlur(input, value) {
    setNativeValue(input, value);
  }

  /** 在宽号码框内点更靠右的安全点（躲开左侧区号） */
  async function clickSafeInsidePhoneNumberBox(input) {
    const r = input.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;

    // 优先点右半侧：70% / 60% / 80% 宽度处，垂直居中
    const ratios = [0.7, 0.6, 0.8];
    for (const ratio of ratios) {
      const x = Math.floor(r.left + r.width * ratio);
      const y = Math.floor(r.top + r.height * 0.5);
      // 用 elementFromPoint 确认点到的是号码框或其子节点，而不是区号箭头
      let hit = null;
      try {
        hit = document.elementFromPoint(x, y);
      } catch (_) {}
      const hitOk =
        hit &&
        (hit === input ||
          input.contains(hit) ||
          (hit.closest && hit.closest("input, textarea") === input) ||
          /only enter|mobile phone/i.test((hit.getAttribute && hit.getAttribute("placeholder")) || ""));

      const target = hitOk && hit ? hit : input;
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
      target.dispatchEvent(new MouseEvent("mousemove", opts));
      target.dispatchEvent(new MouseEvent("mousedown", opts));
      target.dispatchEvent(new MouseEvent("mouseup", opts));
      target.dispatchEvent(new MouseEvent("click", opts));
      await sleep(80);

      // 焦点已进入号码相关控件即可
      const active = document.activeElement;
      if (active === input || (active && input.contains(active))) break;
      if (active && /only enter|mobile phone/i.test(active.getAttribute("placeholder") || "")) break;
    }
  }

  /** 全局按 placeholder 找号码框（截图像：…only enter the mobile phone num…） */
  function findPhoneNumberInputGlobal() {
    const all = queryAll(
      "input:not([type='hidden']):not([type='radio']):not([type='checkbox']), textarea",
    ).filter(isVisible);

    // 1) 最稳：placeholder 含 only enter（区号框不会有这句）
    let el = all.find((i) => /only enter/i.test(i.getAttribute("placeholder") || ""));
    if (el) return el;

    // 2) mobile phone / 手机号
    el = all.find((i) => /mobile phone|手机号|only enter the mobile/i.test(i.getAttribute("placeholder") || ""));
    if (el) return el;

    // 3) 电话标签所在行：取最宽、且不像 +966 的 input
    const labelEl =
      findLabelCell("Contact phone number") ||
      findLabelCell("Phone") ||
      findLabelCell("Mobile") ||
      findLabelCell("电话") ||
      findLabelCell("手机");
    if (labelEl) {
      const td = labelEl.closest("td, th") || labelEl;
      const tr = td.closest("tr");
      const scope = tr || (labelEl.parentElement && labelEl.parentElement.parentElement) || document.body;
      const rowInputs = [...scope.querySelectorAll(
        "input:not([type='hidden']):not([type='radio']):not([type='checkbox'])",
      )].filter(isVisible);
      const ranked = rowInputs
        .filter((i) => !looksLikeDialInput(i))
        .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
      if (ranked[0]) return ranked[0];
      // 同行最右
      if (rowInputs.length >= 2) {
        return rowInputs.slice().sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0];
      }
    }

    // 4) 退回 valueCell 旧逻辑
    if (labelEl) {
      const valueCell = findValueCellFromLabel(labelEl);
      if (valueCell) {
        const fromCell = findPhoneNumberInputFresh(valueCell);
        if (fromCell && !looksLikeDialInput(fromCell)) return fromCell;
      }
    }
    return null;
  }

  /**
   * 只选区号：上弹下拉 → 过滤 → 选第二项（跳过 Select None）→ 关闭。
   * 不写号码。
   */
  async function fillDialCodeOnly(fields) {
    const dialCode = (fields.phoneDialCode && String(fields.phoneDialCode).trim()) || "+966";
    const dialDigits = dialCode.replace(/\D/g, "") || "966";

    const labelEl =
      findLabelCell("Contact phone number") ||
      findLabelCell("Phone") ||
      findLabelCell("Mobile") ||
      findLabelCell("电话") ||
      findLabelCell("手机");
    if (!labelEl) return false;
    const valueCell = findValueCellFromLabel(labelEl);
    if (!valueCell) return false;

    await closeOpenDropdowns();
    await sleep(200);

    const { dialInput, dialArrow } = resolvePhoneParts(valueCell);
    if (!dialInput && !dialArrow) return false;

    // 若区号已是目标值，跳过
    if (dialInput) {
      const cur = String(dialInput.value || "").trim();
      if (cur === dialCode || cur.replace(/\D/g, "") === dialDigits) {
        return true;
      }
    }

    if (dialInput) {
      try {
        dialInput.focus();
      } catch (_) {}
      await sleep(80);
    }
    if (dialArrow) {
      dialArrow.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      dialArrow.click();
    } else if (dialInput) {
      dialInput.click();
    }
    await sleep(450);

    if (dialInput) {
      await typeIntoInput(dialInput, dialDigits);
      await sleep(700);
    }

    let items = findDropdownItemsNear(dialInput || dialArrow || valueCell);
    if (items.length < 1) items = findVisibleDropdownItems();
    if (items.length < 1) {
      await closeOpenDropdowns();
      return Boolean(dialInput && /^\+?\d{1,4}/.test(String(dialInput.value || "").trim()));
    }

    const pick = pickSecondDialItem(items, dialCode, dialDigits);
    if (pick) {
      pick.scrollIntoView({ block: "nearest" });
      await sleep(100);
      pick.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      pick.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      pick.click();
      await sleep(350);
    }

    await closeOpenDropdowns();
    await clickAwayFromEmailNearPhone(valueCell);
    await closeOpenDropdowns();
    try {
      if (dialInput && dialInput.blur) dialInput.blur();
    } catch (_) {}
    await sleep(200);

    if (dialInput) {
      const cur = String(dialInput.value || "").trim();
      return Boolean(cur && !/select\s*none/i.test(cur));
    }
    return true;
  }

  function pickSecondDialItem(items, dialCode, dialDigits) {
    if (!items || !items.length) return null;
    const texts = items.map((el) => (el.textContent || "").trim());
    const real = [];
    for (let i = 0; i < items.length; i++) {
      if (/select\s*none/i.test(texts[i])) continue;
      if (!texts[i]) continue;
      real.push(items[i]);
    }
    for (const el of real) {
      const t = (el.textContent || "").trim();
      if (t === dialCode || t.replace(/\D/g, "") === dialDigits) return el;
    }
    if (real.length >= 2) return real[1];
    if (real.length === 1) return real[0];
    if (items.length >= 2) return items[1];
    return items[0];
  }

  function findDropdownItemsNear(anchorEl) {
    if (!anchorEl || !anchorEl.getBoundingClientRect) return findVisibleDropdownItems();
    const ar = anchorEl.getBoundingClientRect();
    const near = findVisibleDropdownItems().filter((el) => {
      const r = el.getBoundingClientRect();
      const horiz = r.left < ar.right + 80 && r.right > ar.left - 80;
      const above = r.bottom <= ar.bottom + 30 && r.top >= ar.top - 480;
      const below = r.top >= ar.top - 30 && r.top <= ar.bottom + 480;
      return horiz && (above || below);
    });
    near.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return near.length ? near : findVisibleDropdownItems();
  }

  function resolvePhoneParts(valueCell) {
    const inputs = [...valueCell.querySelectorAll(
      "input:not([type='hidden']):not([type='radio']):not([type='checkbox'])",
    )].filter(isVisible);
    const byLeft = inputs
      .slice()
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

    let dialInput = null;
    let numInput = null;
    if (byLeft.length >= 2) {
      dialInput = byLeft[0];
      numInput = byLeft[byLeft.length - 1];
    } else if (byLeft.length === 1) {
      const el = byLeft[0];
      const ph = (el.getAttribute("placeholder") || "").toLowerCase();
      if (/area code|mobile|only enter|phone num|号码/.test(ph) || el.getBoundingClientRect().width >= 140) {
        numInput = el;
      } else {
        dialInput = el;
      }
    }

    let dialArrow = null;
    const scope = dialInput ? dialInput.parentElement || valueCell : valueCell;
    const candidates = [...(scope.querySelectorAll(
      "button, .fr-trigger-btn-up, .fr-trigger-btn-down, .fr-trigger-center, span[class*='arrow'], div[class*='trigger']",
    ) || [])].filter(isVisible);
    if (dialInput) {
      const dr = dialInput.getBoundingClientRect();
      dialArrow =
        candidates.find((el) => {
          const r = el.getBoundingClientRect();
          return r.width <= 36 && r.height <= 36 && Math.abs(r.left - dr.right) < 40 && Math.abs(r.top - dr.top) < 30;
        }) || null;
    }
    if (!dialArrow) {
      dialArrow =
        candidates.find((el) => {
          const r = el.getBoundingClientRect();
          return r.width <= 36 && r.height <= 36 && r.width >= 8;
        }) || null;
    }
    if (!dialArrow) {
      dialArrow =
        [...valueCell.querySelectorAll("*")].find((el) => {
          if (!isVisible(el)) return false;
          const r = el.getBoundingClientRect();
          const cellLeft = valueCell.getBoundingClientRect().left;
          return r.width <= 32 && r.height <= 32 && r.width >= 10 && r.left < cellLeft + 120;
        }) || null;
    }

    return { dialInput, numInput, dialArrow };
  }

  function findPhoneNumberInputFresh(valueCell) {
    const inputs = [...valueCell.querySelectorAll(
      "input:not([type='hidden']):not([type='radio']):not([type='checkbox'])",
    )].filter(isVisible);
    if (!inputs.length) return null;

    const byPh = inputs.find((el) =>
      /area code|mobile|only enter|phone num|手机号|号码/i.test(el.getAttribute("placeholder") || ""),
    );
    if (byPh) return byPh;

    if (inputs.length >= 2) {
      return inputs
        .slice()
        .sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return rb.width - ra.width || rb.left - ra.left;
        })[0];
    }
    return inputs[0];
  }

  function looksLikeDialInput(el) {
    if (!el) return true;
    const r = el.getBoundingClientRect();
    const v = String(el.value || "").trim();
    const ph = (el.getAttribute("placeholder") || "").toLowerCase();
    // 号码框 placeholder 含 only enter / mobile phone
    if (/only enter|mobile phone|手机号/.test(ph)) return false;
    // 窄框 + 像区号的值
    if (r.width < 130 && /^\+?\d{0,4}$/.test(v)) return true;
    if (/^\+\d{1,4}$/.test(v) && r.width < 160 && !/only enter/.test(ph)) return true;
    // 无长 placeholder 的窄框，倾向区号
    if (r.width < 100 && ph.length < 8) return true;
    return false;
  }

  async function clickAwayFromEmailNearPhone(valueCell) {
    try {
      const r = valueCell.getBoundingClientRect();
      const x = Math.min(window.innerWidth - 8, Math.floor(r.right + 24));
      const y = Math.floor(r.top + r.height / 2);
      const el = document.elementFromPoint(x, y) || document.body;
      if (el) {
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y }));
        el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: x, clientY: y }));
      }
    } catch (_) {}
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, keyCode: 27 }));
    await sleep(200);
  }

  async function restoreEmailIfNeeded(email) {
    const labelEl =
      findLabelCell("Contact Email") ||
      findLabelCell("Email") ||
      findLabelCell("E-mail") ||
      findLabelCell("邮箱");
    if (!labelEl) return;
    const valueCell = findValueCellFromLabel(labelEl);
    if (!valueCell) return;
    const input = valueCell.querySelector(
      "input:not([type='hidden']):not([type='radio']):not([type='checkbox'])",
    );
    if (!input) return;
    const v = String(input.value || "").trim();
    const polluted = !v || !v.includes("@") || /^\+?\d/.test(v) || /select\s*none/i.test(v);
    if (!polluted) return;
    input.focus();
    setNativeValue(input, email);
    await sleep(100);
    try {
      input.blur && input.blur();
    } catch (_) {}
  }

  /** 按可见文案点击单选/多选选项（无左侧标签时兜底） */
  async function clickOptionByText(optionText, opts) {
    const options = opts || {};
    const target = normalizeLabel(optionText);
    if (!target) return false;
    const prefixLen = options.prefixLen || Math.min(40, target.length);
    const targetPrefix = target.slice(0, prefixLen);

    const nodes = queryAll("label, span, div, td, li, a").filter(isVisible);
    for (const el of nodes) {
      const raw = (el.textContent || "").trim();
      if (!raw || raw.length > 220) continue;
      const t = normalizeLabel(raw);
      if (t === target || (targetPrefix.length >= 8 && (t === targetPrefix || t.startsWith(targetPrefix)))) {
        // 优先点内部的 input
        const input = el.querySelector && el.querySelector('input[type="radio"], input[type="checkbox"]');
        if (input) {
          input.click();
          input.checked = true;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          el.click();
        }
        await sleep(150);
        return true;
      }
    }
    return false;
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
    await sleep(500);
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
