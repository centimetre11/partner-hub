package com.fr.data;

import com.fr.log.FineLoggerFactory;
import com.fr.script.Calculator;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * 设计器粘贴版 — 通用 Partner Hub 回调（所有 CPT 共用一份代码）
 *
 * 用法：
 * 1. 模板 → 报表填报属性 → 添加 → 自定义提交 → 编辑
 * 2. 粘贴本文件全文 → 编译 → 保存
 * 3. 绑定属性（每个 CPT 仅 action 不同）：
 *      clueId(JobValue)        = $clueid
 *      callbackSecret(String)  = 密钥
 *      action(String)          = toNurture / toChannel / toCustomer / edit / shift
 * 4. 保留原 SQL 提交入库；删除按钮 JS 回调
 *
 * 参考：https://help.fanruan.com/finereport/doc-view-3703.html
 */
public class PartnerHubLeadNotify extends DefinedSubmitJob {

    private JobValue clueId;
    private String callbackSecret;
    private String action;

    public String getJobType() {
        return "PartnerHub";
    }

    public void doJob(Calculator calculator) throws Exception {
        final String callbackUrl = "https://camelusai.com/api/leads/crm-callback";

        String id = readClueId();
        if (id.isEmpty()) {
            throw new Exception("PartnerHub: clueId 为空，请绑定 clueId=$clueid");
        }
        String secret = trim(callbackSecret);
        if (secret.isEmpty()) {
            throw new Exception("PartnerHub: callbackSecret 为空");
        }
        String act = trim(action);
        if (act.isEmpty()) {
            throw new Exception("PartnerHub: action 为空");
        }

        String json = buildJson(id, act, secret);
        int code = postJson(callbackUrl, secret, json);
        String body = readLastResponse();

        FineLoggerFactory.getLogger().info(
                "PartnerHub callback clueId={} action={} http={} body={}",
                id, act, code, body);

        if (code < 200 || code >= 300) {
            throw new Exception("PartnerHub callback HTTP " + code + ": " + body);
        }
    }

    private static String lastResponse = "";

    private String readClueId() {
        if (clueId == null || clueId.getValue() == null) return "";
        return String.valueOf(clueId.getValue()).trim();
    }

    private static String trim(String s) {
        return s != null ? s.trim() : "";
    }

    private static String escapeJson(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String buildJson(String clueId, String action, String secret) {
        return "{\"clueId\":\""
                + escapeJson(clueId)
                + "\",\"action\":\""
                + escapeJson(action)
                + "\",\"callbackSecret\":\""
                + escapeJson(secret)
                + "\"}";
    }

    private static int postJson(String urlStr, String secret, String json) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        conn.setRequestProperty("X-CRM-Callback-Secret", secret);
        conn.setRequestProperty("Accept", "application/json");

        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(bytes);
        }

        int code = conn.getResponseCode();
        InputStream stream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        lastResponse = readStream(stream);
        conn.disconnect();
        return code;
    }

    private static String readLastResponse() {
        return lastResponse;
    }

    private static String readStream(InputStream in) throws Exception {
        if (in == null) return "";
        try (InputStream stream = in) {
            byte[] buf = new byte[4096];
            StringBuilder sb = new StringBuilder();
            int n;
            while ((n = stream.read(buf)) >= 0) {
                sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
            }
            return sb.toString();
        }
    }
}
