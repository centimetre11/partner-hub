/**
 * 全量同步（无 clueId 或批量修复后手动触发）
 * 也可在 Java 自定义提交中设置 fullSync=true
 */
var CALLBACK_URL = "https://camelusai.com/api/leads/crm-callback";
var SECRET = "请填写与 Partner Hub 一致的密钥";

FR.ajax({
  url: CALLBACK_URL,
  type: "POST",
  contentType: "application/json",
  data: JSON.stringify({ fullSync: true, callbackSecret: SECRET }),
  success: function (res) {
    if (res && res.ok) {
      FR.Msg.toast("已触发 Partner Hub 全量同步（后台执行，约 1 分钟）");
    } else {
      FR.Msg.toast("Partner Hub 全量同步失败：" + (res && (res.error || res.reason) ? (res.error || res.reason) : "未知"));
    }
  },
  error: function (xhr) {
    FR.Msg.toast("Partner Hub 全量同步失败（HTTP " + (xhr ? xhr.status : "?") + "）");
  },
});
