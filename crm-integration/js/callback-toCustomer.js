/**
 * 提交入库成功回调 — 转客户 (clue_to_company.cpt)
 */
var CLUE_ID = "${clueid}";
var CALLBACK_URL = "https://camelusai.com/api/leads/crm-callback";
var SECRET = "请填写与 Partner Hub 一致的密钥";

if (fr_submitinfo.success) {
  FR.ajax({
    url: CALLBACK_URL,
    type: "POST",
    contentType: "application/json",
    data: JSON.stringify({ clueId: CLUE_ID, action: "toCustomer", callbackSecret: SECRET }),
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
