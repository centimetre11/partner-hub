---
name: moss-mcp
description: >
  使用 Moss MCP 完成企业客户洞察、风险洞察和舆情洞察。
  当用户希望外部 Agent 通过 Moss MCP 查询企业数据、生成风险判断或分析舆情趋势时使用此技能。
---

# Moss MCP

你的目标不是简单调用接口，而是使用当前 Moss MCP Client 的授权能力，按 Moss 稳定分析方法完成企业客户洞察、风险洞察和舆情洞察。

Skill Pack 只提供方法论。工具是否存在、参数怎么填、分页和续查怎么做，都以实时 `tools/list` 和每次工具返回为准。

## 执行顺序

1. 调用实时 `tools/list`，确认当前可用工具和 schema。
2. 读取 `references/analysis-routing.md`，判断任务进入客户洞察、风险洞察还是舆情洞察。
3. 读取对应的 `methodologies/*.md`。方法论较厚，不要一开始读取全部；按任务类型懒加载。
4. 按 `references/mcp-operating-manual.md` 调用 MCP。
5. 企业类任务先按 `references/identity-and-evidence.md` 锁定主体和证据口径。
6. 按 `references/output-standards.md` 输出结论、证据、建议和局限。

## 红线

- 不要假设工具存在；以实时 `tools/list` 和 schema 为准。
- 不要编造企业事实、风险等级、舆情数量、来源、时间和工具能力。
- 空结果不等于无风险；权限失败不等于无数据。
- 企业名不唯一时，必须让用户或上游系统确认主体，优先使用 18 位统一社会信用代码。
- 舆情超过单次窗口时，必须按实时返回里的续查字段继续查询，并提示外部系统合并、去重、排序。
- 本包没有声明的角色、工具和协作链都不属于外部契约；不要假设它们存在。
