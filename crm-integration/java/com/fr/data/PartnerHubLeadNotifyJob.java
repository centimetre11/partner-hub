package com.fr.data;

import com.fr.script.Calculator;

/**
 * 帆软「自定义提交」：CRM 填报入库成功后，通知 Partner Hub 刷新对应线索。
 *
 * <p>在模板「报表填报属性」中与 SQL 提交入库并列添加本类；或在「控件自定义提交」插件中选择。
 *
 * <p>绑定属性（名称须与字段一致）：
 * <ul>
 *   <li>clueId — JobValue，绑定线索 ID 单元格或公式（如 =$clueid）</li>
 *   <li>action — String，本模板固定动作：toNurture / toChannel / toCustomer / edit / shift</li>
 *   <li>fullSync — String，可选，"true" 时触发 Partner Hub 全量同步（默认 false）</li>
 * </ul>
 *
 * <p>各模板 action 建议：
 * <ul>
 *   <li>clue_edit.cpt → edit</li>
 *   <li>cclue_to_public.cpt（type=channel）→ toChannel</li>
 *   <li>cclue_to_public.cpt（type=培育）→ toNurture</li>
 *   <li>clue_to_company.cpt → toCustomer</li>
 *   <li>clue_shift.cpt → shift</li>
 * </ul>
 */
public class PartnerHubLeadNotifyJob extends TotalSubmitJob {

    /** 线索 ID（clue_id） */
    private JobValue clueId;

    /** 动作类型，每个 cpt 模板填固定字符串 */
    private String action;

    /** 是否全量同步：填 "true" 或留空 */
    private String fullSync;

    @Override
    public void doJob(Calculator calculator) throws Exception {
        if (clueId == null || clueId.getValue() == null) {
            throw new Exception("clueId is empty");
        }
        String clueIdVal = String.valueOf(clueId.getValue()).trim();
        if (clueIdVal.isEmpty()) {
            throw new Exception("clueId is empty");
        }

        String actionVal = action == null ? "" : action.trim();
        boolean syncAll = "true".equalsIgnoreCase(fullSync == null ? "" : fullSync.trim());

        PartnerHubWebhookClient.notify(clueIdVal, actionVal, syncAll);
    }
}
