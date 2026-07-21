// 企业邮写信页适配器：点击写信 → 填充收件人/主题/正文 → 注入附件。
// 关键设计：先定位正文编辑器（QMEditor iframe / contenteditable），以其所在文档为
// 「写信表单文档」，收件人/主题/附件均只在该文档内查找，避免误填顶层搜索框等无关输入。

(() => {
  const SCRIPT_VER = "1.1.29";
  if (window.__phBridgeComposeVer === SCRIPT_VER) return;
  window.__phBridgeComposeVer = SCRIPT_VER;

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

  async function runFillCompose({ to, cc, subject, body, bodyHtml, files, mode, startAt, endAt, timeZone, startLocal, endLocal }) {
    const isMeeting = mode === "meeting";
    const problems = [];

    // 1. 写信表单未打开时，点击「写信」入口
    if (!findEditorBody()) {
      const btn = await waitFor(() => findComposeButton(), 15000, "找不到「写信」按钮，请确认已登录企业邮");
      btn.click();
      await sleep(800);
    }

    // 2. 等待写信表单（以正文编辑器出现为准）
    let editorBody = await waitFor(() => findEditorBody(), 20000, "写信表单未出现（找不到正文编辑器）");

    // 2b. 会议邀约：等 Tab 栏出现后切到「会议」（勿在普通邮件里填）
    if (isMeeting) {
      await waitFor(
        () => findComposeTabBar() || findTimeRow(findComposeDocument() || document),
        12000,
        "找不到写信 Tab 栏",
      ).catch(() => null);
      const switched = await switchToMeetingTab();
      if (!switched) {
        problems.push("未能切换到「会议」选项卡，已按普通邮件填充（请手动切到会议核对时间）");
        await sleep(400);
      } else {
        await sleep(900);
        editorBody = (await waitFor(() => findEditorBody(), 10000, "").catch(() => null)) || editorBody;
      }
    }

    // 写信表单文档：编辑器 iframe 所在的文档（经典版），或编辑器自身所在文档（新版）
    const composeDoc = editorBody.__phComposeDoc || editorBody.ownerDocument;

    // 收件人：会议模式将抄送合并进收件人（无抄送时仅填客户邮箱）
    const recipientList = isMeeting ? mergeRecipients(to, cc || "") : to;
    const emailOnlyRecipients = filterEmailRecipients(recipientList);

    // 3. 收件人（最先填，避免正文抢焦点；经典版需模拟真实输入 + Tab/Enter 确认）
    if (emailOnlyRecipients) {
      const recipientField = findRecipientField(composeDoc, isMeeting);
      if (recipientField) {
        const filled = await fillRecipient(recipientField, emailOnlyRecipients);
        if (!filled) problems.push("收件人填充失败");
        else await sleep(200);
      } else {
        problems.push("收件人输入框未找到");
      }
    }

    if (!isMeeting && cc) {
      const ccField = findCcField(composeDoc);
      if (ccField) {
        const filled = await fillRecipient(ccField, cc);
        if (!filled) problems.push("抄送人填充失败");
      } else {
        problems.push("抄送输入框未找到");
      }
    }

    // 4. 主题（仅在写信表单文档内查找；会议模式可能没有独立主题行）
    if (subject) {
      const subjectField = findSubjectField(composeDoc, isMeeting);
      if (subjectField) {
        subjectField.focus();
        setNativeValue(subjectField, subject);
      } else if (!isMeeting) {
        problems.push("主题输入框未找到");
      }
    }

    // 4b. 会议模式：尝试填充时间；地点 deliberately 不填
    if (isMeeting && (startLocal || startAt) && (endLocal || endAt)) {
      const timeOk = await fillMeetingTime(composeDoc, startAt, endAt, timeZone, startLocal, endLocal);
      if (!timeOk) problems.push("会议时间未能自动填充，请手动核对");
    }

    // 5. 正文 / 备注（优先 HTML 富文本）
    if (body || bodyHtml) fillBody(editorBody, body, bodyHtml);

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
        `toSel=${doc.querySelectorAll("#toAreaCtrl .addr_text input, #toAreaCtrl input").length}`,
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

  function elementLabel(el) {
    if (!el) return "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        return node.textContent.trim();
      }
    }
    return (el.textContent || "").trim();
  }

  function composeRoots() {
    const roots = [];
    const composeDoc = findComposeDocument();
    if (composeDoc) roots.push(composeDoc);
    const editor = findEditorBody();
    if (editor?.__phComposeDoc && !roots.includes(editor.__phComposeDoc)) {
      roots.push(editor.__phComposeDoc);
    }
    if (!roots.includes(document)) roots.push(document);
    return roots;
  }

  /** 写信页 Tab 栏：含「普通邮件」+「会议」的紧凑容器 */
  function findComposeTabBar() {
    for (const root of composeRoots()) {
      const toArea = root.querySelector("#toAreaCtrl");
      if (toArea) {
        let ancestor = toArea.parentElement;
        for (let depth = 0; depth < 25 && ancestor; depth++) {
          for (const el of ancestor.querySelectorAll("ul, ol, nav, div, tr, p, span, a")) {
            if (!isVisible(el)) continue;
            const compact = (el.textContent || "").replace(/\s+/g, "");
            if (
              compact.includes("普通邮件") &&
              compact.includes("会议") &&
              compact.length <= 48
            ) {
              return { root, bar: el };
            }
          }
          ancestor = ancestor.parentElement;
        }
      }

      for (const sel of [
        "#meetingtab",
        "#tab_meeting",
        "#meeting_tab",
        "#meetingTab",
        "[data-type='meeting']",
        "a[href*='meeting']",
      ]) {
        const hit = root.querySelector(sel);
        if (hit && isVisible(hit)) {
          return { root, bar: hit.parentElement || hit, meetingEl: hit };
        }
      }
    }
    return null;
  }

  function findMeetingTabInBar(bar) {
    if (!bar) return null;
    const nodes = bar.querySelectorAll("a, button, span, div, li, label, [role='tab']");
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      const label = elementLabel(el);
      if (label === "会议" || label === "Meeting") return el;
      if ((el.textContent || "").trim() === "会议") return el;
    }
    return null;
  }

  function isMeetingComposeActive() {
    for (const root of composeRoots()) {
      if (findTimeRow(root)) return true;
      for (const el of root.querySelectorAll(".active, .selected, .current, .on, .cur")) {
        const t = (el.textContent || "").trim();
        if (t === "会议" || t.startsWith("会议")) return true;
      }
    }
    return false;
  }

  async function clickTabElement(el) {
    const target = el.closest("a, button, [role='tab'], li") || el;
    try {
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch {
      // ignore
    }
    const win = target.ownerDocument.defaultView;
    for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: win }));
    }
    target.click();
    await sleep(700);
  }

  async function switchToMeetingTab() {
    if (isMeetingComposeActive()) return true;

    for (let attempt = 0; attempt < 4; attempt++) {
      const found = findComposeTabBar();
      if (found?.meetingEl) {
        await clickTabElement(found.meetingEl);
        if (isMeetingComposeActive()) return true;
      }
      if (found?.bar) {
        const tab = findMeetingTabInBar(found.bar);
        if (tab) {
          await clickTabElement(tab);
          if (isMeetingComposeActive()) return true;
        }
      }

      for (const root of composeRoots()) {
        for (const el of root.querySelectorAll("a, button, span, div, li, label, [role='tab']")) {
          if (!isVisible(el)) continue;
          const label = elementLabel(el);
          if (label !== "会议" && label !== "Meeting") continue;
          const parent = el.parentElement;
          const ctx = parent ? parent.textContent || "" : "";
          if (!ctx.includes("普通邮件") && !ctx.includes("Normal")) continue;
          await clickTabElement(el);
          if (isMeetingComposeActive()) return true;
        }
      }

      await sleep(450);
    }

    return isMeetingComposeActive();
  }

  function findComposeDocument() {
    const to = document.querySelector("#toAreaCtrl");
    if (to) {
      const doc = to.ownerDocument;
      return doc;
    }
    const editor = findEditorBody();
    return editor?.__phComposeDoc || null;
  }

  function mergeRecipients(to, cc) {
    const parts = String(to || "")
      .split(/[,;|]/)
      .concat(
        String(cc || "")
          .split(/[,;|]/)
          .map((s) => s.trim()),
      )
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const p of parts) {
      const key = p.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(p);
      }
    }
    return out.join(", ");
  }

  /** 只保留像邮箱的片段，避免日期等误入收件人 */
  function filterEmailRecipients(raw) {
    return String(raw || "")
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter((s) => s.includes("@") && !looksLikeDateTime(s))
      .join(", ");
  }

  function looksLikeDateTime(s) {
    return (
      /^\d{4}[/-]\d{1,2}[/-]\d{1,2}/.test(s) ||
      /^\d{1,2}:\d{2}/.test(s) ||
      /^\d{4}-\d{2}-\d{2}T/.test(s)
    );
  }

  function isInRecipientArea(el) {
    return Boolean(el.closest("#toAreaCtrl, #ccAreaCtrl, .addr_area"));
  }

  function findTimeRow(doc) {
    for (const el of doc.querySelectorAll("label, td, th, span")) {
      const t = (el.textContent || "").trim();
      if (t !== "时间" && !/^时\s*间[:：]?$/.test(t)) continue;
      const row =
        el.closest("tr") ||
        el.closest(".compose_field, .field, .form_item, li");
      if (!row || !row.querySelector("select, input")) continue;
      const head = (row.textContent || "").trim().slice(0, 8);
      if (/^时\s*间/.test(head)) return row;
    }
    for (const input of doc.querySelectorAll("input[type='text'], input:not([type='hidden'])")) {
      if (!isVisible(input) || isInRecipientArea(input)) continue;
      const row = input.closest("tr, .compose_field, .field, li");
      if (row && /^时\s*间/.test((row.textContent || "").trim().slice(0, 12))) return row;
    }
    return null;
  }

  function classifySelect(select) {
    const nums = [...select.options]
      .map((o) => Number(String(o.value).trim()))
      .filter((n) => Number.isFinite(n));
    if (!nums.length) return "unknown";
    const max = Math.max(...nums);
    const min = Math.min(...nums);
    if (max >= 1900) return "year";
    if (max <= 23 && min >= 0) return "hour";
    if (max <= 59 && min >= 0) return "minute";
    return "unknown";
  }

  function isDateLikeInput(input) {
    if (!input || input.tagName !== "INPUT") return false;
    const v = String(input.value || "").trim();
    if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}/.test(v) || /星期/.test(v)) return true;
    const rect = input.getBoundingClientRect();
    return rect.width >= 96;
  }

  function findMeetingTimeControls(timeRow) {
    const selects = sortByPosition(Array.from(timeRow.querySelectorAll("select")).filter(isVisible));
    const hours = selects.filter((s) => classifySelect(s) === "hour");
    const minutes = selects.filter((s) => classifySelect(s) === "minute");

    let dateInputs = sortByPosition(
      Array.from(
        timeRow.querySelectorAll("input[type='text'], input:not([type='hidden']):not([type='checkbox'])"),
      )
        .filter(isVisible)
        .filter((el) => !isInRecipientArea(el))
        .filter(isDateLikeInput),
    );

    if (dateInputs.length < 2) {
      const wideInputs = sortByPosition(
        Array.from(
          timeRow.querySelectorAll("input[type='text'], input:not([type='hidden']):not([type='checkbox'])"),
        )
          .filter(isVisible)
          .filter((el) => !isInRecipientArea(el))
          .filter((el) => el.getBoundingClientRect().width >= 96),
      );
      if (wideInputs.length >= 2) dateInputs = wideInputs.slice(0, 2);
    }

    return { dateInputs, hours, minutes };
  }

  function formatExmailFromLocal(local) {
    if (!local) return null;
    const m = String(local).trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return null;
    return `${Number(m[1])}/${Number(m[2])}/${Number(m[3])} ${m[4]}:${m[5]}`;
  }

  function formatExmailDateTime(iso, timeZone) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      const tz =
        timeZone && String(timeZone).trim()
          ? String(timeZone).trim()
          : Intl.DateTimeFormat().resolvedOptions().timeZone;
      const dtf = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const parts = Object.fromEntries(
        dtf.formatToParts(d).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
      );
      const hour = parts.hour === "24" ? "0" : parts.hour;
      return `${parts.year}/${parts.month}/${parts.day} ${hour}:${parts.minute}`;
    } catch {
      return null;
    }
  }

  function parseLocalParts(local) {
    const m = String(local || "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return null;
    return {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: Number(m[4]),
      minute: Number(m[5]),
    };
  }

  function parseIsoToParts(iso, timeZone) {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      const tz =
        timeZone && String(timeZone).trim()
          ? String(timeZone).trim()
          : Intl.DateTimeFormat().resolvedOptions().timeZone;
      const dtf = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const parts = Object.fromEntries(
        dtf.formatToParts(d).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
      );
      return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour === "24" ? "0" : parts.hour),
        minute: Number(parts.minute),
      };
    } catch {
      return null;
    }
  }

  function exmailDateOnly(parts) {
    return `${parts.year}/${parts.month}/${parts.day}`;
  }

  function sortByPosition(elements) {
    return elements.slice().sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      if (Math.abs(ra.top - rb.top) > 10) return ra.top - rb.top;
      return ra.left - rb.left;
    });
  }

  function setSelectByNumber(select, num, kind) {
    if (kind === "hour" && (num < 0 || num > 23)) return false;
    if (kind === "minute" && (num < 0 || num > 59)) return false;
    const candidates = [String(num), String(num).padStart(2, "0")];
    for (const c of candidates) {
      for (const opt of select.options) {
        const ov = String(opt.value).trim();
        const ot = String(opt.text).trim();
        if (ov === c || ot === c || Number(ov) === num || Number(ot) === num) {
          if (select.value !== opt.value) {
            select.value = opt.value;
            select.dispatchEvent(new Event("input", { bubbles: true }));
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return true;
        }
      }
    }
    return false;
  }

  async function fillDateInput(input, parts) {
    if (!isDateLikeInput(input) && input.getBoundingClientRect().width < 96) return false;
    const dateStr = exmailDateOnly(parts);
    input.focus();
    try {
      input.select();
    } catch {
      // ignore
    }
    setNativeValue(input, dateStr);
    dispatchInputText(input, dateStr);
    input.dispatchEvent(new Event("blur", { bubbles: true }));
    await sleep(120);
    if (!dateInputMatches(input, parts)) {
      input.click();
      await sleep(150);
      try {
        input.select();
      } catch {
        // ignore
      }
      setNativeValue(input, dateStr);
      pressKey(input, "Enter", 13);
      await sleep(120);
    }
    return dateInputMatches(input, parts);
  }

  function dateInputMatches(input, parts) {
    const v = String(input.value || "");
    if (!v.includes(String(parts.year))) return false;
    const m = parts.month;
    const d = parts.day;
    return (
      v.includes(`${parts.year}/${m}/${d}`) ||
      v.includes(`${parts.year}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`)
    );
  }

  function verifyMeetingTime(timeRow, startParts, endParts) {
    const { dateInputs, hours, minutes } = findMeetingTimeControls(timeRow);
    let ok = true;
    if (hours.length >= 2 && minutes.length >= 2) {
      ok =
        Number(hours[0].value) === startParts.hour &&
        Number(minutes[0].value) === startParts.minute &&
        Number(hours[1].value) === endParts.hour &&
        Number(minutes[1].value) === endParts.minute;
    }
    if (dateInputs.length >= 2) {
      ok = ok && dateInputMatches(dateInputs[0], startParts) && dateInputMatches(dateInputs[1], endParts);
    } else if (dateInputs.length === 1) {
      ok = ok && dateInputMatches(dateInputs[0], startParts);
    }
    return ok;
  }

  async function fillMeetingTime(doc, startIso, endIso, timeZone, startLocal, endLocal) {
    const startParts = parseLocalParts(startLocal) || parseIsoToParts(startIso, timeZone);
    const endParts = parseLocalParts(endLocal) || parseIsoToParts(endIso, timeZone);
    if (!startParts || !endParts) return false;

    const timeRow = findTimeRow(doc);
    if (!timeRow) return false;

    const { dateInputs, hours, minutes } = findMeetingTimeControls(timeRow);

    if (hours.length >= 2 && minutes.length >= 2) {
      if (dateInputs.length >= 2) {
        await fillDateInput(dateInputs[0], startParts);
        await fillDateInput(dateInputs[1], endParts);
      } else if (dateInputs.length === 1) {
        await fillDateInput(dateInputs[0], startParts);
      }
      setSelectByNumber(hours[0], startParts.hour, "hour");
      setSelectByNumber(minutes[0], startParts.minute, "minute");
      setSelectByNumber(hours[1], endParts.hour, "hour");
      setSelectByNumber(minutes[1], endParts.minute, "minute");
      await sleep(250);
      return verifyMeetingTime(timeRow, startParts, endParts);
    }

    // 旧版：两个整段 datetime 文本框（无时分下拉时）
    const inputs = sortByPosition(
      Array.from(
        timeRow.querySelectorAll("input[type='text'], input:not([type='hidden']):not([type='checkbox'])"),
      )
        .filter(isVisible)
        .filter((el) => !isInRecipientArea(el))
        .filter((el) => el.getBoundingClientRect().width >= 120),
    );
    const startStr = formatExmailFromLocal(startLocal) || formatExmailDateTime(startIso, timeZone);
    const endStr = formatExmailFromLocal(endLocal) || formatExmailDateTime(endIso, timeZone);
    if (!startStr || !endStr || inputs.length < 2) return false;

    setNativeValue(inputs[0], startStr);
    setNativeValue(inputs[1], endStr);
    return true;
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

  function findRecipientField(doc, isMeeting = false) {
    const strategies = [
      () => doc.querySelector("#toAreaCtrl .addr_text input"),
      () => doc.querySelector("#toAreaCtrl .addr_input input"),
      () => doc.querySelector("#toAreaCtrl input:not([type='hidden'])"),
      () => doc.querySelector("#toAreaCtrl textarea"),
      () => doc.querySelector("#to"),
      () => doc.querySelector("textarea[name='to']"),
      () => Array.from(doc.querySelectorAll("#toAreaCtrl input")).find(isVisible),
      () =>
        Array.from(doc.querySelectorAll(".addr_area .addr_text input, .addr_area input.addr_text")).find(
          isVisible,
        ),
      () => Array.from(doc.querySelectorAll("input[name='to']")).find(isVisible),
      () =>
        Array.from(doc.querySelectorAll("#toAreaCtrl [contenteditable='true']")).find(isVisible),
      () => Array.from(doc.querySelectorAll("input[placeholder*='收件人']")).find(isVisible),
    ];
    if (!isMeeting) {
      strategies.push(
        () => findInputBeforeSubject(doc),
        () => findInputByRowLabel(doc, /^收件人/),
      );
    }
    for (const s of strategies) {
      const el = s();
      if (el && isVisible(el) && !looksLikeDateTime(el.value || "")) return el;
    }
    return null;
  }

  function findCcField(doc) {
    const strategies = [
      () => doc.querySelector("#ccAreaCtrl .addr_text input"),
      () => doc.querySelector("#ccAreaCtrl .addr_input input"),
      () => doc.querySelector("#ccAreaCtrl input:not([type='hidden'])"),
      () => doc.querySelector("#ccAreaCtrl textarea"),
      () => doc.querySelector("#cc"),
      () => doc.querySelector("textarea[name='cc']"),
      () => Array.from(doc.querySelectorAll("#ccAreaCtrl input")).find(isVisible),
      () => findInputByRowLabel(doc, /^抄\s*送/),
      () => Array.from(doc.querySelectorAll("input[placeholder*='抄送']")).find(isVisible),
    ];
    for (const s of strategies) {
      const el = s();
      if (el && isVisible(el)) return el;
    }
    return null;
  }

  /** 主题字段之前的第一个可见输入框，通常是收件人。 */
  function findInputBeforeSubject(doc) {
    const subject = findSubjectField(doc);
    if (!subject) return null;
    const candidates = Array.from(
      doc.querySelectorAll("input[type='text'], input:not([type]), textarea, [contenteditable='true']"),
    ).filter(isVisible);
    const idx = candidates.indexOf(subject);
    if (idx > 0) return candidates[idx - 1];
    return null;
  }

  function findSubjectField(doc, isMeeting = false) {
    const strategies = [
      () => Array.from(doc.querySelectorAll("input[name='subject']")).find(isVisible),
      () => (isVisible(doc.querySelector("#subject")) ? doc.querySelector("#subject") : null),
      () => Array.from(doc.querySelectorAll("input[placeholder*='主题']")).find(isVisible),
      () => findInputByRowLabel(doc, /^主\s*题/),
    ];
    for (const s of strategies) {
      const el = s();
      if (el && !isInRecipientArea(el) && !(isMeeting && isInTimeRow(el))) return el;
    }
    return null;
  }

  function isInTimeRow(el) {
    const row = el.closest("tr, .compose_field, .field, li, div");
    return Boolean(row && /^时\s*间/.test((row.textContent || "").trim().slice(0, 12)));
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

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function dispatchInputText(el, text) {
    const win = el.ownerDocument.defaultView;
    el.focus();
    el.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: text,
      }),
    );
    if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
      el.textContent = text;
    } else if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      if (el.ownerDocument.execCommand("insertText", false, text)) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        setNativeValue(el, text);
      }
    }
    el.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }),
    );
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function fillRecipient(field, to) {
    const area = field.closest("#toAreaCtrl, .addr_area");
    if (area) area.click();
    field.focus();
    await sleep(80);

    // 清空后写入
    if (field.tagName === "INPUT" || field.tagName === "TEXTAREA") {
      setNativeValue(field, "");
    } else {
      field.textContent = "";
    }
    await sleep(50);
    dispatchInputText(field, to);
    await sleep(120);

    // 经典企业邮：Tab 或 Enter 将地址解析为 chip
    for (const [key, code] of [
      ["Tab", 9],
      ["Enter", 13],
    ]) {
      pressKey(field, key, code);
      await sleep(250);
      if (recipientLooksFilled(field, to)) return true;
    }

    // 再试逗号 / 分号分隔
    dispatchInputText(field, to + ",");
    pressKey(field, "Enter", 13);
    await sleep(250);
    if (recipientLooksFilled(field, to)) return true;

    // 逐字模拟输入（企业邮地址组件常只响应真实按键序列）
    if (field.tagName === "INPUT" || field.tagName === "TEXTAREA") {
      setNativeValue(field, "");
      field.focus();
      for (const ch of to) {
        pressKey(field, ch, ch.charCodeAt(0));
        setNativeValue(field, (field.value || "") + ch);
        field.dispatchEvent(
          new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" }),
        );
        await sleep(15);
      }
      pressKey(field, "Tab", 9);
      await sleep(200);
      pressKey(field, "Enter", 13);
      await sleep(200);
      if (recipientLooksFilled(field, to)) return true;
    }

    // 兜底：保留输入框中的邮箱文本（即使未生成 chip 也可手动确认）
    if (field.tagName === "INPUT" || field.tagName === "TEXTAREA") {
      if (!field.value || !field.value.includes("@")) setNativeValue(field, to);
      return Boolean(field.value && field.value.includes("@"));
    }
    return recipientLooksFilled(field, to);
  }

  function recipientLooksFilled(field, to) {
    if (hasAddressChip(field)) return true;
    const val =
      field.tagName === "INPUT" || field.tagName === "TEXTAREA"
        ? field.value
        : field.textContent || "";
    return val.includes("@") || val.includes(to.split("@")[0] || "");
  }

  function hasAddressChip(field) {
    const area = field.closest("#toAreaCtrl, .addr_area");
    if (!area) return false;
    return Boolean(
      area.querySelector(
        ".addr_base:not(.addr_input), .addr_normal, .addr_item, .addr_chip, .addr_name",
      ),
    );
  }

  function fillBody(editorBody, body, bodyHtml) {
    editorBody.focus();
    const html = bodyHtml && bodyHtml.trim()
      ? bodyHtml
      : body
          .replace(/\\\r?\n/g, "\n")
          .replace(/\\$/gm, "")
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
