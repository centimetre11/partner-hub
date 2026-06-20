/** Shared regex for propose-mode intent (assistant dock UI + server routing). Client-safe. */
export const PROPOSE_INTENT_RE =
  /kms\.fineres\.com|pageId=\d+|建档|补全画像|提炼.{0,6}伙伴|录入伙伴|创建伙伴|新公司|丰富.{0,4}档案|完善.{0,4}画像|商务记录|拜访记录|会议纪要|跟进记录|见面记录|记录拜访|记录会议|创建待办|记.{0,4}待办|加.{0,2}待办|帮.{0,8}待办|加待办|添加待办|待办[：:，,]|^事项[是：:]|添加商机|新建商机|加联系人|添加联系人|新联系人|培训计划|认证计划|联合方案|onboard|create partner|new partner|enrich.{0,8}profile|complete.{0,8}profile|business record|meeting log|visit log|log opportunity|add contact|create todo|add todo|log todo|intake/i;
