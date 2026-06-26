/** 新建/转正为正式伙伴时的默认字段（与「转正」逻辑保持一致） */
export const ACTIVE_PARTNER_DEFAULTS = {
  status: "ACTIVE",
  poolFlag: "ADVANCING",
  pipelineStage: 2,
} as const;
