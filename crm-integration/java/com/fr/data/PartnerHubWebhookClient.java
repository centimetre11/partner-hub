package com.fr.data;

import com.fr.log.FineLoggerFactory;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * 向 Partner Hub 发送线索变更 webhook（服务端调用，密钥不出现在浏览器）。
 */
final class PartnerHubWebhookClient {

    private PartnerHubWebhookClient() {}

    /** 默认 Partner Hub 回调地址，可通过 JVM 参数 -Dpartnerhub.webhook.url=... 覆盖 */
    static String webhookUrl() {
        String v = System.getProperty("partnerhub.webhook.url");
        if (v != null && !v.trim().isEmpty()) {
            return v.trim();
        }
        return "https://camelusai.com/api/leads/crm-callback";
    }

    /** 回调密钥，通过 JVM 参数 -Dpartnerhub.webhook.secret=... 注入（推荐） */
    static String webhookSecret() {
        String v = System.getProperty("partnerhub.webhook.secret");
        if (v != null && !v.trim().isEmpty()) {
            return v.trim();
        }
        // 部署前请改为实际密钥，或通过 JVM 参数注入，勿留空
        return "";
    }

    /**
     * @param clueId   线索 ID（clue_id）
     * @param action   动作：toNurture / toChannel / toCustomer / edit / shift
     * @param fullSync 是否触发 Partner Hub 全量同步（少数场景）
     */
    static void notify(String clueId, String action, boolean fullSync) throws Exception {
        if (clueId == null || clueId.trim().isEmpty()) {
            throw new IllegalArgumentException("clueId is required");
        }
        String secret = webhookSecret();
        if (secret.isEmpty()) {
            throw new IllegalStateException(
                    "partnerhub.webhook.secret is not configured. "
                            + "Set JVM option -Dpartnerhub.webhook.secret=YOUR_SECRET on CRM server.");
        }

        String body =
                "{"
                        + "\"clueId\":\""
                        + escapeJson(clueId.trim())
                        + "\","
                        + "\"action\":\""
                        + escapeJson(action == null ? "" : action.trim())
                        + "\","
                        + "\"fullSync\":"
                        + fullSync
                        + "}";

        HttpURLConnection conn = (HttpURLConnection) new URL(webhookUrl()).openConnection();
        conn.setConnectTimeout(15_000);
        conn.setReadTimeout(120_000);
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        conn.setRequestProperty("X-CRM-Callback-Secret", secret);
        conn.setRequestProperty("Accept", "application/json");

        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        conn.setRequestProperty("Content-Length", String.valueOf(bytes.length));
        try (OutputStream os = conn.getOutputStream()) {
            os.write(bytes);
        }

        int code = conn.getResponseCode();
        InputStream stream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
        String resp = readStream(stream);
        conn.disconnect();

        FineLoggerFactory.getLogger()
                .info("[PartnerHub] webhook clueId={} action={} fullSync={} http={} resp={}",
                        clueId, action, fullSync, code, resp);

        if (code < 200 || code >= 300) {
            throw new Exception("Partner Hub webhook failed HTTP " + code + ": " + resp);
        }
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

    private static String escapeJson(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
