/**
 * 提交入库成功回调 — 责任转移 (clue_shift.cpt)
 */
var CLUE_ID = "${clueid}";
var CALLBACK_URL = "https://camelusai.com/api/leads/crm-callback";
var SECRET = "请填写与 Partner Hub 一致的密钥";

if (fr_submitinfo.success) {
  FR.ajax({
    url: CALLBACK_URL,
    type: "POST",
    contentType: "application/json",
    headers: { "X-CRM-Callback-Secret": SECRET },
    data: JSON.stringify({ clueId: CLUE_ID, action: "shift" }),
    complete: function () {
      FR.Msg.toast("提交成功，Partner Hub 后台校准中");
    },
  });
} else {
  FR.Msg.toast("提交失败：" + fr_submitinfo.failinfo);
}
