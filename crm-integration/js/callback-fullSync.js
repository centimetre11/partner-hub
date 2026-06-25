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
  headers: { "X-CRM-Callback-Secret": SECRET },
  data: JSON.stringify({ fullSync: true }),
  complete: function () {
    FR.Msg.toast("已触发 Partner Hub 全量同步（后台执行，约 1 分钟）");
  },
});
