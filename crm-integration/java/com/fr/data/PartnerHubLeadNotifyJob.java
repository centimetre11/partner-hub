package com.fr.data;

import com.fr.log.FineLoggerFactory;
import com.fr.script.Calculator;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * CRM 填报成功后通知 Partner Hub（camelusai.com）刷新线索。
 *
 * 用法：模板 → 报表填报属性 → 新增「自定义提交」→ 选择本类 → 绑定属性：
 *   - clueId  (JobValue)  → 单元格/公式，值为 URL 参数 clueid
 *   - action  (String)    → 固定字符串，见下方各场景
 *   - callbackUrl (String) → 可选，默认 https://camelusai.com/api/leads/crm-callback
 *   - callbackSecret (String) → 与 Partner Hub 环境变量 CRM_CALLBACK_SECRET 一致
 *   - fullSync (String)   → 可选，"true" 触发全量同步（一般留空）
 *
 * 各 CPT 模板的 action 固定值：
 *   cclue_to_public.cpt + type=培育  → toNurture
 *   cclue_to_public.cpt + type=channel → toChannel
 *   clue_edit.cpt                    → edit
 *   clue_to_company.cpt              → toCustomer
 *   clue_shift.cpt                   → shift
 *   clue_view.cpt                    → 无需挂载（只读）
 */
public class PartnerHubLeadNotifyJob extends TotalSubmitJob {

    private JobValue clueId;
    private String action;
    private String callbackUrl;
    private String callbackSecret;
    private String fullSync;

    @Override
    public void doJob(Calculator calculator) throws Exception {
        String id = readClueId();
        if (id.isEmpty()) {
            throw new Exception("PartnerHub: clueId 为空，请检查填报属性绑定");
        }

        String act = action != null ? action.trim() : "";
        boolean syncAll = "true".equalsIgnoreCase(trim(fullSync));

        String url = trim(callbackUrl);
        if (url.isEmpty()) {
            url = "https://camelusai.com/api/leads/crm-callback";
        }
        String secret = trim(callbackSecret);
        if (secret.isEmpty()) {
            throw new Exception("PartnerHub: callbackSecret 为空，请绑定密钥");
        }

        String json = buildJson(id, act, syncAll, secret);
        int httpCode = postJson(url, secret, json);

        FineLoggerFactory.getLogger().info(
                "PartnerHub callback clueId={} action={} fullSync={} http={}",
                id, act, syncAll, httpCode);

        if (httpCode < 200 || httpCode >= 300) {
            throw new Exception("PartnerHub callback HTTP " + httpCode);
        }
    }

    private String readClueId() {
        if (clueId == null || clueId.getValue() == null) {
            return "";
        }
        return String.valueOf(clueId.getValue()).trim();
    }

    private static String trim(String s) {
        return s != null ? s.trim() : "";
    }

    private static String escapeJson(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String buildJson(String clueId, String action, boolean fullSync, String secret) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"clueId\":\"").append(escapeJson(clueId)).append("\"");
        if (fullSync) {
            sb.append(",\"fullSync\":true");
        } else if (!action.isEmpty()) {
            sb.append(",\"action\":\"").append(escapeJson(action)).append("\"");
        }
        sb.append(",\"callbackSecret\":\"").append(escapeJson(secret)).append("\"");
        sb.append("}");
        return sb.toString();
    }

    private static int postJson(String urlStr, String secret, String json) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        conn.setRequestProperty("X-CRM-Callback-Secret", secret);

        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        conn.setRequestProperty("Content-Length", String.valueOf(bytes.length));

        try (OutputStream os = conn.getOutputStream()) {
            os.write(bytes);
        }

        int code = conn.getResponseCode();
        InputStream stream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        if (stream != null) {
            stream.close();
        }
        conn.disconnect();
        return code;
    }
}
