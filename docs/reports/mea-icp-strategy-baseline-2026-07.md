# [基线] 中东运营模式与细分客群洞察

> **版本**：v1.0 · 2026-07-19  
> **类型**：策略基线报告（供后续季度/年底对比）  
> **关联系统**：Partner Hub `/segments` · 客户 segment 字段 · 报告中心  
> **撰写说明**：整合三轮讨论——（1）年底要验证什么；（2）经营与系统 P0 改动；（3）参考材料（区域国企体系图 + 泛企业战略矩阵）如何构建。

---

## 0. 本报告用途（如何做多期对比）

| 对比维度 | 本版基线（2026-07） | 下一版建议更新时点 |
|----------|---------------------|-------------------|
| 运营模式是否走通 | 框架 + 判据已定义，链路尚在验证 | 2026-Q3 末 / Q4 中 |
| 细分客群是否洞察清楚 | taxonomy + 看板已上线，标签覆盖待提升 | 每月看 `/segments` |
| 战略矩阵是否可运营 | 方案已设计，SegmentStrategy 待建 | Phase 1 上线后 |
| 客群地图是否可视化 | 方案已设计，层级/地图待建 | Phase 2 上线后 |

**建议**：每季度复制本报告为新文档（标题加日期），在文末「量化快照」表填当期数字，与基线并列查看。

---

# 第一篇：年底要回答的两个核心问题

## 1.1 新运营模式是否走通？

**模式定义（中东）**：伙伴驱动 + 分层经营（Tier A/B/C）+ 补贴换首批交付 + 产品/产研陪跑，而非直销打单。

走通 ≠ 签了多少伙伴，而是 **漏斗 + 闭环** 同时成立：

| 层级 | 走通信号 | 未走通信号 |
|------|----------|------------|
| **伙伴层** | Tier A 有 2–3 家进入 pipelineStage ≥ 2（实质推进），且有专职 headcount | 大量候选停在「已联络」；valuePattern / playbook 空白 |
| **商机层** | 通过伙伴带出的终端客户商机 ≥ 5 个，且 stage 能推进到 P50+ | 商机挂在帆软直销名下，伙伴仅为「介绍人」 |
| **交付层** | ≥1–2 个补贴项目完成 POC→签约→交付 | 三单补贴发了但无闭环案例 |
| **模式层** | 能说出「哪类伙伴 × 哪类终端客户 × 哪条 valuePattern」可复制 | 每家打法 ad hoc，无法复盘 |

### 年底量化验收（模式）

| 指标 | 目标 |
|------|------|
| Tier A 闭环 | ≥2 家完成「带单→补贴项目→交付」 |
| 可对外案例 | ≥1 篇（含 segment + 场景 + 产品组合） |
| 可复制表述 | 至少 1 条「伙伴类型 × 客户 segment × valuePattern」链路写进战略矩阵 |

---

## 1.2 细分客群是否洞察清楚？

「洞察清楚」≠ 有一份 Excel，而是能稳定回答：

1. **主攻哪 3–5 个终端客群**（如：沙特政府/NDMO 合规、金融/银行、大型零售/地产、能源、教育）
2. **每个客群的购买触发点**（合规、Tableau/PBI 迁移、复杂报表、数据主权）
3. **每个客群的最佳进入路径**（哪类伙伴、什么切入方案、典型周期）
4. **每个客群的 win/loss 规律**（为什么赢、为什么丢）

研究材料（五类伙伴 × 终端客户清单）是起点，需升级为 **可运营、可统计、可复盘** 的经营资产。

### 年底量化验收（客群）

| 指标 | 目标 |
|------|------|
| 主攻 segment | 明确 3–5 个，各有代表客户、最佳伙伴类型、切入方案、≥3 条赢/输样本 |
| 数据质量 | ≥80% 活跃 Customer 有 segment；≥70% 活跃 Opportunity 同时挂 customer + partner |
| 系统可用 | `/segments` 可出 segment × country × stage；Review/周报带 segment 维度 |

---

# 第二篇：经营过程与系统改动（P0 已落地摘要）

## 2.1 经营侧：从拓伙伴 → 跑通可复制链路

**Q3–Q4 资源聚焦 1 条完整链路**（示例）：

```
Tier A 伙伴（Beinex / TechMantra / DataPlus 类）
  → 明确 valuePattern（BI_COMPLEMENT / GOV_BID）
  → 带出 2–3 个终端客户
  → 补贴项目 POC
  → 赢单 + 案例沉淀
  → 复盘「伙伴类型 × 客户 segment × 打法」
```

**强制动作**：

- Partner Review：本季度目标 segment、knownClients 更新、下一单路径
- 活跃商机：必须 customer + partner，填 dealType
- 赢单/丢单：简短复盘（segment、阻力、下次怎么改）
- Hub 与 CRM：Hub 为经营真相源，商务记录带 CRM KPI 字段

**录入纪律（最小集）**：

1. 每个 PROSPECT：至少 `customerSegment` + `country`；有伙伴则 `entryPath`
2. 每个 Tier A Review：更新 knownClients → 使用「导入已知客户」
3. 每次 WON/LOST：填 segment 快照 + winFactor / lossReason

---

## 2.2 系统侧：P0 能力清单（2026-07-19 已部署）

| 能力 | 说明 | 入口 |
|------|------|------|
| 终端客户 segmentation | customerSegment / buyingTrigger / entryPath / icpTier | 客户资料、维度库 |
| 客群洞察看板 | 矩阵统计、ICP 分布、赢丢因素 | `/segments`、经营看板摘要 |
| knownClients 导入 | 伙伴已知客户 → PROSPECT 终端客户 | 伙伴详情 |
| 赢丢复盘 | Opportunity：customerSegment、winFactor、lossReason | 客户商机表单 |

**P1/P2 待建（见第三篇）**：SegmentStrategy 战略矩阵、parentCustomer 层级、地理地图、假设验证日志。

---

## 2.3 落地节奏（经营日历）

| 时间 | 动作 |
|------|------|
| 7–8 月 | 定 segment taxonomy；回填历史客户；新商机强制挂 segment |
| 9 月 | 跑通 1 条 Tier A 全链路；首次月度 segment 复盘 |
| 10–11 月 | 扩展 2–3 条链路；赢丢复盘机制常态化 |
| 12 月 | 《中东细分客群洞察报告》+ 2027 ICP 与资源分配 |

---

# 第三篇：参考材料 → 中东客群体系如何构建

## 3.1 两张参考图各自解决什么

| 参考 | 核心能力 | 中东等价物 |
|------|----------|------------|
| **图1：区域大型国企体系洞察** | 地理分布 + 组织层级树 + 按城市聚合 | 国家/城市地图 + 主权/集团/BU/法人层级 + 伙伴触达通道 |
| **图2：泛企业细分战略矩阵** | 基本盘/成长盘/机会盘 × 行业列 × 客群/产品/路径/机会/TAM | ICP 三层 × segment 列 × 五行动态矩阵 |

图1 回答：**客群在哪、结构怎样**  
图2 回答：**每个客群怎么打、怎么验**

---

## 3.2 图1 → 中东「终端客群体系地图」

**组织层级（替代中国行政国企层级）**：

```
L1 主权/国家级 — PIF、SDAIA、NDMO、Vision 2030 项目主体
L2 大型集团   — 银行、能源 NOC、地产/零售头部
L3 区域/BU    — 集团事业部、自贸区实体、合资 SPV
L4 采购法人   — 实际发 RFP、签单的实体
```

**地理维度**：KSA（Riyadh/Jeddah/Dammam）、UAE（Dubai/Abu Dhabi）、Qatar、Bahrain…

**触达通道（中东特有）**：Tier A 伙伴 × valuePattern × entryPath

**系统缺口 → Phase 2**：`parentCustomerId`、`orgLevel`、`groupName` + `/segments/map` 地图页

---

## 3.3 图2 → 中东「ICP 战略矩阵」

| 参考盘 | icpTier | 建议 segment 示例 |
|--------|---------|-------------------|
| 基本盘 | PRIMARY | GOV_COMPLIANCE、FINANCE、ENERGY |
| 成长盘 | NURTURE | RETAIL、REAL_ESTATE、LOGISTICS |
| 机会盘 | WATCH | EDUCATION、HEALTHCARE、MANUFACTURING |

**每个 segment 列固定五行**（对标图2）：

| 行 | 内容 | 当前数据来源 |
|----|------|--------------|
| 重点客群 | 画像、规模、决策链 | Customer + q5 + Moss |
| 核心产品 | FR / FBI / FDL 组合 | Know-how、Solution |
| 关键路径 | 伙伴类型 + valuePattern | Partner + entryPath |
| 重点机会 | buyingTrigger | 客户/商机字段 |
| 量化指标 | 客户数、商机、赢单、伙伴覆盖 | `/segments`；TAM/SAM 待填 |

**系统缺口 → Phase 1**：`SegmentStrategy` 模型 + `/segments/strategy` 可编辑矩阵，底部自动对比目标 vs 实际。

---

## 3.4 三期构建路径

```
P0（已完成）  Customer segment 字段 · /segments 看板 · 赢丢复盘 · knownClients 导入
     ↓
Phase 1（2–3 周） SegmentStrategy 战略矩阵页 · 填好 3 个 PRIMARY segment 完整一行
     ↓
Phase 2（3–4 周） parentCustomer + orgLevel · 中东地图 · 层级树
     ↓
Phase 3（持续）  假设验证日志 · 季度报告自动生成 · 与矩阵/地图联动
```

**中东早期代理指标**（替代 TAM/SAM 真空期）：

- 标签覆盖率、伙伴覆盖率、Pipeline 深度（P50+ 数）
- 假设验证条数（成立/推翻）
- 赢丢复盘完整度

---

# 附录 A：量化快照（填数对比用）

> 每季度复制下表到新报告版本，与基线对照。

| 指标 | 基线 2026-07-19 | 当季实际 | 备注 |
|------|------------------|----------|------|
| 终端客户总数 | _待填_ | | `/segments` |
| segment 标签覆盖率 | _待填_ | | |
| PRIMARY ICP 客户数 | _待填_ | | |
| Tier A 实质推进（stage≥2） | _待填_ | | 伙伴看板 |
| 伙伴带出进行中商机 | _待填_ | | |
| 补贴项目闭环数 | _待填_ | | |
| WON 且填 winFactor 比例 | _待填_ | | |
| LOST 且填 lossReason 比例 | _待填_ | | |
| 可对外案例数 | 0 | | |

---

# 附录 B：主攻 segment 假设（待验证）

| segment | icpTier | 主攻国家 | 最佳伙伴类型 | valuePattern | 状态 |
|---------|---------|----------|--------------|--------------|------|
| GOV_COMPLIANCE | PRIMARY | KSA | 纯数据咨询 / GOV 关系强 | GOV_BID | 假设 |
| FINANCE | PRIMARY | UAE/KSA | Power BI / Tableau 互补 | BI_COMPLEMENT | 假设 |
| ENERGY | PRIMARY | UAE/KSA | IT 集成 / 大型 SI | BI_COMPLEMENT | 假设 |
| RETAIL | NURTURE | UAE | Power BI 伙伴 | BI_COMPLEMENT | 假设 |
| REAL_ESTATE | NURTURE | UAE/KSA | 大型 SI | APP_REPORT | 假设 |

**状态枚举**：假设 → 验证中 → 已验证 → 停用

---

# 附录 C：相关系统入口

- 客群洞察看板：`/segments`
- 报告中心（本文档）：`/documents`
- 客户列表（按 segment 筛选）：`/customers?segment=…`
- 维度库（segment 枚举）：`/taxonomy?dim=CUSTOMER_SEGMENT`
- 经营看板摘要：工作台 → 经营看板

---

*本文档为策略基线，不替代动态数据；以 Partner Hub 实时看板为准。*
