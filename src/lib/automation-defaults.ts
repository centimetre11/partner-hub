export { buildScheduledPushTaskMd as buildDueTodosTaskMd } from "./automation-push";

/** @deprecated Use buildDueTodosTaskMd — kept for imports that expect a string constant */
export const DEFAULT_TASK_MD = `---
name: partner-due-todos-monitor
description: 到期待办监控
---

# 任务目标
见 automation-due-todos 模板。
`;
