/**
 * 公共片段 — 浏览器跨域回调请用 body.callbackSecret（勿仅依赖 Header）。
 * 复制 notifyPartnerHub 到各场景回调中即可。
 */
function notifyPartnerHub(payload, successMsg, failPrefix) {
  var CALLBACK_URL = "https://camelusai.com/api/leads/crm-callback";
  var SECRET = "请填写与 Partner Hub 一致的密钥";

  var body = {};
  for (var k in payload) {
    if (payload.hasOwnProperty(k)) body[k] = payload[k];
  }
  body.callbackSecret = SECRET;

  FR.ajax({
    url: CALLBACK_URL,
    type: "POST",
    contentType: "application/json",
    data: JSON.stringify(body),
    success: function (res) {
      if (res && res.ok) {
        FR.Msg.toast(successMsg);
      } else {
        FR.Msg.toast((failPrefix || "Partner Hub 同步失败") + "：" + (res && (res.error || res.reason) ? (res.error || res.reason) : "未知错误"));
      }
    },
    error: function (xhr) {
      var hint = xhr && xhr.responseText ? xhr.responseText.slice(0, 120) : "";
      FR.Msg.toast((failPrefix || "Partner Hub 同步失败") + "（HTTP " + (xhr ? xhr.status : "?") + "）" + hint);
    },
  });
}
