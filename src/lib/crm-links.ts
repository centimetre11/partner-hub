// CRM 网页操作入口链接构造。
// 注意：viewlet 查询串里的 international%252Fclue%252F... 是 CRM 实际使用的双重编码
//（%252F 解码后才是 %2F → /），请逐字保留，不要「修正」成 %2F，否则链接会失效。

const CRM_WEB_BASE = "https://overseas.finereporthelp.com/WebReport/decision/view/report";
const REF_C = "bf1af4e5-5bdc-4b27-b8d1-8694ad13d046";

export type CrmLeadLinks = {
  /** 线索视图（只读查看） */
  view: string;
  /** 转 channel（与转培育同一 viewlet，仅 type 不同） */
  toChannel: string;
  /** 转培育（与转 channel 同一 viewlet，仅 type 不同） */
  toNurture: string;
  /** 基础信息编辑 */
  edit: string;
  /** 转客户 */
  toCustomer: string;
  /** 责任转移 */
  shift: string;
};

export function buildCrmLeadLinks(clueId: string): CrmLeadLinks {
  const cid = encodeURIComponent(clueId);

  return {
    view: `${CRM_WEB_BASE}?op=view&ref_c=${REF_C}&viewlet=international%252Fclue%252Fclue_view.cpt&ref_t=design&clueid=${cid}`,
    // 转 channel 与 转培育：同一 viewlet cclue_to_public.cpt，靠 type 区分，切勿写反。
    toChannel: `${CRM_WEB_BASE}?viewlet=international%252Fclue%252Fcclue_to_public.cpt&ref_t=design&op=write&ref_c=${REF_C}&type=channel&clueid=${cid}`,
    toNurture: `${CRM_WEB_BASE}?viewlet=international%252Fclue%252Fcclue_to_public.cpt&ref_t=design&op=write&ref_c=${REF_C}&type=${encodeURIComponent(
      "培育",
    )}&clueid=${cid}`,
    edit: `${CRM_WEB_BASE}?viewlet=international%252Fclue%252Fclue_edit.cpt&ref_t=design&op=write&ref_c=${REF_C}&clueid=${cid}`,
    toCustomer: `${CRM_WEB_BASE}?viewlet=international%252Fclue%252Fclue_to_company.cpt&ref_t=design&op=write&ref_c=${REF_C}&clueid=${cid}`,
    shift: `${CRM_WEB_BASE}?viewlet=international%252Fclue%252Fclue_shift.cpt&ref_t=design&op=write&ref_c=${REF_C}&clueid=${cid}`,
  };
}
