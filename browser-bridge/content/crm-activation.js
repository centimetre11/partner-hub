// FineReport 海外激活填报表适配器（oversea_activation_single.cpt）
// 按左侧标签文案定位行，填充下拉 / 文本 / 单选；不代点提交。

(() => {
  // 允许扩展升级后重新注入覆盖旧逻辑
  const SCRIPT_VER = "1.1.12";
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

    // Pre-Sales：销售角色 → Zayne.Zhao；售前角色 → 自己
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

    await closeOpenDropdowns();
    await sleep(400);

    // 文本 / 单选 / 多选放在下拉之后，避免被浮层打断
    if (fields.companyName) {
      if (!(await fillTextByLabel("Company Name", fields.companyName))) warnings.push("Company Name 未找到输入框");
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
    // Contact Title / Products / Current demand 放到邮箱之后填（见下）

    // 邮箱
    if (fields.email) {
      const ok =
        (await fillTextByLabel("Email", fields.email)) ||
        (await fillTextByLabel("E-mail", fields.email)) ||
        (await fillTextByLabel("Contact Email", fields.email)) ||
        (await fillTextByLabel("邮箱", fields.email));
      if (!ok) warnings.push("Email 未找到输入框");
      await sleep(300);
    }

    await closeOpenDropdowns();
    await sleep(200);

    // 邮箱之后补单选/多选（电话上弹层会盖住邮箱，电话放到最后）
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

    // 电话最后填：区号上弹选第二项 → 关浮层 → 防呆写号码（多次重试）→ 必要时再修邮箱
    const emailSnapshot = fields.email || "";
    try {
      const ok = await Promise.race([
        fillPhoneWithUpwardDial(fields),
        sleep(16000).then(() => false),
      ]);
      if (!ok) warnings.push("Phone 未填完整，请手选区号并填号码");
    } catch (err) {
      warnings.push(`Phone 填充异常：${String(err && err.message ? err.message : err)}`);
    }
    await closeOpenDropdowns();
    await sleep(200);

    // 仅当邮箱被污染/清空时再回写，避免抢焦点导致号码没写上就结束
    if (emailSnapshot) {
      await restoreEmailIfNeeded(emailSnapshot);
    }


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
   * 电话：区号下拉往上展开。
   * 点开 → 过滤 → 选第二项（跳过 Select None）→ 强制关闭 → 防呆写号码（点击号码框 + 逐字输入 + 校验重试）。
   */
  async function fillPhoneWithUpwardDial(fields) {
    const local =
      (fields.phoneLocal && String(fields.phoneLocal).replace(/\D/g, "")) ||
      "500000000";
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

    // —— 区号：只点左侧箭头 ——
    if (dialInput) {
      try {
        dialInput.focus();
      } catch (_) {}
      await sleep(100);
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

    if (items.length >= 1) {
      const pick = pickSecondDialItem(items, dialCode, dialDigits);
      if (pick) {
        pick.scrollIntoView({ block: "nearest" });
        await sleep(120);
        pick.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        pick.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        pick.click();
        await sleep(400);
      }
    }

    // 关干净上弹层；点电话行右侧空白，不要点上方邮箱
    await closeOpenDropdowns();
    await clickAwayFromEmailNearPhone(valueCell);
    await closeOpenDropdowns();
    try {
      if (dialInput && dialInput.blur) dialInput.blur();
    } catch (_) {}
    await sleep(400);

    // 号码：重新定位 + 最多 3 次防呆写入
    const numOk = await writePhoneLocalRobust(valueCell, local);
    return numOk;
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

  /** 优先用 placeholder 认号码框，避免误写区号 */
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

    const el = inputs[0];
    const r = el.getBoundingClientRect();
    const v = String(el.value || "").trim();
    // 像区号框则放弃
    if (r.width < 120 && /^\+?\d{0,4}$/.test(v)) return null;
    return el;
  }

  function looksLikeDialInput(el) {
    if (!el) return true;
    const r = el.getBoundingClientRect();
    const v = String(el.value || "").trim();
    const ph = (el.getAttribute("placeholder") || "").toLowerCase();
    if (/area code|mobile|only enter|phone num/.test(ph)) return false;
    if (r.width < 120 && /^\+?\d{1,4}$/.test(v)) return true;
    if (/^\+\d{1,4}$/.test(v) && r.width < 160) return true;
    return false;
  }

  /**
   * 号码防呆：重新定位 → 鼠标点进号码框 → 清空 → 逐字输入 → 校验；失败重试 3 次。
   */
  async function writePhoneLocalRobust(valueCell, local) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await closeOpenDropdowns();
      await sleep(180);

      const input = findPhoneNumberInputFresh(valueCell);
      if (!input || looksLikeDialInput(input)) {
        await sleep(200);
        continue;
      }

      // 先 blur 当前焦点（常停在区号/邮箱）
      try {
        const active = document.activeElement;
        if (active && active !== input && active.blur) active.blur();
      } catch (_) {}
      await sleep(80);

      // 点号码框中心，确保焦点真进号码而非邮箱
      const r = input.getBoundingClientRect();
      const x = Math.floor(r.left + Math.min(r.width * 0.4, 80));
      const y = Math.floor(r.top + r.height / 2);
      input.scrollIntoView({ block: "center", inline: "nearest" });
      await sleep(80);
      input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      input.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      input.focus();
      await sleep(150);

      // 焦点仍不在号码框则重试
      if (document.activeElement !== input) {
        input.focus();
        await sleep(120);
      }
      if (looksLikeDialInput(document.activeElement)) {
        continue;
      }

      try {
        input.select && input.select();
      } catch (_) {}

      // 清空
      setNativeValue(input, "");
      await sleep(60);

      // 逐字键入，兼容 FineReport
      let acc = "";
      for (const ch of local) {
        acc += ch;
        input.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
        setNativeValue(input, acc);
        input.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" }));
        input.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
        await sleep(35);
      }
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(200);

      const digits = String(input.value || "").replace(/\D/g, "");
      if (digits.length >= 6) {
        try {
          input.blur && input.blur();
        } catch (_) {}
        await closeOpenDropdowns();
        return true;
      }

      // 整段写入兜底
      setNativeValue(input, local);
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: local, inputType: "insertText" }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(200);
      if (String(input.value || "").replace(/\D/g, "").length >= 6) {
        try {
          input.blur && input.blur();
        } catch (_) {}
        return true;
      }
    }
    return false;
  }

  /** 点电话行右侧空白收起浮层，避免点到上方邮箱 */
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
    const input =
      valueCell.querySelector("input:not([type='hidden']):not([type='radio']):not([type='checkbox'])") ||
      null;
    if (!input) return;
    const v = String(input.value || "").trim();
    const polluted = !v || !v.includes("@") || /^\+?\d/.test(v) || /select\s*none/i.test(v);
    if (!polluted && v === email) return;
    if (!polluted && v.includes("@")) return;
    input.focus();
    setNativeValue(input, email);
    await sleep(120);
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
