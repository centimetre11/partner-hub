// FineReport 海外激活填报表适配器（oversea_activation_single.cpt）
// 按左侧标签文案定位行，填充下拉 / 文本 / 单选；不代点提交。

(() => {
  // 允许扩展升级后重新注入覆盖旧逻辑
  const SCRIPT_VER = "1.1.5";
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

    // 单选/多选先于电话，避免电话区号卡住导致后面全空
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

    // 电话：区号随便选一项 + 编造本地号码；失败不阻塞收尾
    try {
      const ok = await Promise.race([
        fillPhoneFields(fields),
        sleep(12000).then(() => false),
      ]);
      if (!ok) warnings.push("Phone 未填完整，请手选区号并填号码");
    } catch (err) {
      warnings.push(`Phone 填充异常：${String(err && err.message ? err.message : err)}`);
      await closeOpenDropdowns();
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

  /**
   * 电话：左侧窄框=区号（只点下拉选第一项，绝不输入长号码）；
   * 右侧宽框=手机号（只写入本地号码）。
   */
  async function fillPhoneFields(fields) {
    const local =
      (fields.phoneLocal && String(fields.phoneLocal).replace(/\D/g, "")) ||
      "500000000";

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

    let { dialInput, numInput } = resolvePhoneInputs(valueCell);

    // 1) 区号：只点箭头 + 选第一项，绝不往区号框敲长数字
    const dialOk = await pickFirstDialCode(valueCell, dialInput);
    await closeOpenDropdowns();
    await sleep(350);

    // 选完区号后 DOM 可能重建，重新定位
    ({ dialInput, numInput } = resolvePhoneInputs(valueCell));

    // 若区号框里被误填了长号码，清掉
    if (dialInput) {
      const dv = String(dialInput.value || "").replace(/\s/g, "");
      if (/\d{6,}/.test(dv)) {
        setNativeValue(dialInput, "");
      }
    }

    // 2) 号码：只写入右侧宽输入框
    if (!numInput) {
      // 只有区号没有号码框时，不把号码塞进区号
      return dialOk;
    }

    // 确保不是同一个节点
    if (dialInput && numInput === dialInput) {
      const inputs = listPhoneInputs(valueCell);
      numInput = inputs.length >= 2 ? inputs[inputs.length - 1] : null;
      dialInput = inputs.length >= 2 ? inputs[0] : dialInput;
    }
    if (!numInput || (dialInput && numInput === dialInput)) {
      return dialOk;
    }

    numInput.blur && numInput.blur();
    await sleep(80);
    numInput.focus();
    await sleep(120);
    setNativeValue(numInput, local);
    numInput.dispatchEvent(new InputEvent("input", { bubbles: true, data: local, inputType: "insertText" }));
    numInput.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(250);

    // 再检查：号码不应出现在区号框
    if (dialInput) {
      const dv = String(dialInput.value || "").replace(/\s/g, "");
      if (dv.includes(local) || /\d{6,}/.test(dv)) {
        setNativeValue(dialInput, dv.replace(local, "").replace(/\d{6,}/g, "") || "+966");
      }
    }

    return Boolean((numInput.value || "").trim()) || dialOk;
  }

  function listPhoneInputs(valueCell) {
    return [...valueCell.querySelectorAll("input:not([type='hidden']):not([type='radio']):not([type='checkbox'])")].filter(isVisible);
  }

  /** 按位置/宽度区分：左边窄=区号，右边宽=号码 */
  function resolvePhoneInputs(valueCell) {
    const inputs = listPhoneInputs(valueCell);
    if (!inputs.length) return { dialInput: null, numInput: null };

    if (inputs.length === 1) {
      const el = inputs[0];
      const r = el.getBoundingClientRect();
      const ph = (el.getAttribute("placeholder") || "").toLowerCase();
      // 宽框或带「只填手机号」提示 → 号码；窄框 → 区号
      if (r.width >= 140 || /mobile|only enter|手机号|号码/.test(ph)) {
        return { dialInput: null, numInput: el };
      }
      if (r.width < 140) return { dialInput: el, numInput: null };
      return { dialInput: null, numInput: el };
    }

    const byLeft = inputs.slice().sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    const dialInput = byLeft[0];
    const numInput = byLeft[byLeft.length - 1];
    return { dialInput, numInput };
  }

  async function pickFirstDialCode(valueCell, dialInput) {
    // 只点左侧区号旁的小箭头，不要 typeIntoInput
    const arrowCandidates = [...valueCell.querySelectorAll("button, .fr-trigger-btn-up, .fr-trigger-btn-down, .fr-trigger-center, div[class*='trigger'], span")].filter(
      (el) => {
        if (!isVisible(el)) return false;
        const r = el.getBoundingClientRect();
        return r.width >= 8 && r.width <= 40 && r.height >= 8 && r.height <= 40;
      },
    );

    let arrow = null;
    if (dialInput && arrowCandidates.length) {
      const dr = dialInput.getBoundingClientRect();
      arrow = arrowCandidates
        .map((el) => {
          const er = el.getBoundingClientRect();
          // 紧挨区号框右侧的箭头
          return { el, score: Math.abs(er.left - dr.right) + Math.abs(er.top - dr.top) };
        })
        .sort((a, b) => a.score - b.score)[0]?.el;
    }
    if (!arrow && arrowCandidates.length) {
      // 取最靠左的小箭头（区号在左侧）
      arrow = arrowCandidates.slice().sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0];
    }

    // 打开下拉：优先点箭头；不要往区号框输入任何长文本
    if (arrow) {
      arrow.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      arrow.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      arrow.click();
      await sleep(500);
    } else if (dialInput) {
      dialInput.focus();
      dialInput.click();
      await sleep(400);
    } else {
      return false;
    }

    let items = [];
    const start = Date.now();
    while (Date.now() - start < 2500) {
      items = findVisibleDropdownItems().filter((el) => {
        const t = (el.textContent || "").trim();
        return t.length > 0 && t.length < 40 && (/^\+?\d/.test(t) || /\+\d/.test(t));
      });
      if (items.length) break;
      items = findVisibleDropdownItems().filter((el) => {
        const t = (el.textContent || "").trim();
        return t.length > 0 && t.length < 24;
      });
      if (items.length) break;
      await sleep(200);
    }

    if (!items.length) {
      // 仅在完全点不出列表时，往区号框写短区号（绝不是本地手机号）
      if (dialInput) {
        setNativeValue(dialInput, "+966");
        dialInput.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      return false;
    }

    const target = items[0];
    target.scrollIntoView({ block: "nearest" });
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    target.click();
    await sleep(400);

    if (findVisibleDropdownItems().length > 0) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, keyCode: 13 }));
      await sleep(200);
    }
    // 关掉列表，避免焦点留在区号
    await closeOpenDropdowns();
    if (dialInput && dialInput.blur) dialInput.blur();
    return true;
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
