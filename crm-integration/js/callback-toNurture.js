/**
 * 提交入库成功回调 — 转培育 (cclue_to_public.cpt, type=培育)
 * 参考: https://help.fanruan.com/finereport/doc-view-1219.html
 *
 * 在「提交入库」事件 → 「设置回调函数」中粘贴。
 * 将 CLUE_ID 改为模板中 clueid 参数/单元格；SECRET 与 Partner Hub CRM_CALLBACK_SECRET 一致。
 */
var CLUE_ID = "${clueid}"; // 或改为单元格，如 =$clueid
var CALLBACK_URL = "https://camelusai.com/api/leads/crm-callback";
var SECRET = "请填写与 Partner Hub 一致的密钥";

// fr_submitinfo 仅在「提交入库 → 设置回调函数」中可用，勿放在按钮普通 JS 点击事件里
if (typeof fr_submitinfo === "undefined") {
  FR.Msg.toast("回调位置错误：请在「提交入库→设置回调函数」中粘贴本脚本");
} else if (fr_submitinfo.success) {
  FR.ajax({
    url: CALLBACK_URL,
    type: "POST",
    contentType: "application/json",
    data: JSON.stringify({ clueId: CLUE_ID, action: "toNurture", callbackSecret: SECRET }),
    success: function (res) {
      if (res && res.ok) {
        FR.Msg.toast("提交成功，Partner Hub 已同步");
      } else {
        FR.Msg.toast("Partner Hub 同步失败：" + (res && (res.error || res.reason) ? (res.error || res.reason) : "未知"));
      }
    },
    error: function (xhr) {
      FR.Msg.toast("Partner Hub 同步失败（HTTP " + (xhr ? xhr.status : "?") + "），请检查密钥或联系管理员");
    },
  });
} else {
  FR.Msg.toast("提交失败：" + fr_submitinfo.failinfo);
}
