# JS 回调 → Java 自定义提交（迁移指南）

给 Fay.Wen / CRM 管理员：把 **JS 设置回调函数** 替换为 **Java 自定义提交**。

参考帆软文档：[自定义提交](https://help.fanruan.com/finereport/doc-view-3703.html)

---

## 推荐方案：设计器内粘贴 Java（无需重启服务器）

代码直接粘进 CPT → 编译 → 保存 → 发布，**不用**把 class 放到服务器，**不用**重启帆软。

| | 设计器粘贴（推荐） | 部署 class 文件 |
|--|-------------------|----------------|
| 重启服务器 | **不需要** | 需要 |
| 改代码 | 改 CPT 重新编译保存 | 替换 class + 重启 |
| 适用 | 当前场景 ✅ | 多模板共用同一 class 时 |

---

## 第一步：改 CPT（每个模板约 5 分钟）

### 1. 打开填报属性

1. 设计器打开 CPT
2. **模板** → **报表填报属性**
3. **保留** 原有「提交入库」（SQL 写 CRM 库）
4. **添加** → **自定义提交** → 点 **编辑**（不是「选择」已有 class）

### 2. 粘贴 Java 代码

1. 打开 `crm-integration/java/designer/PartnerHubLeadNotify.java`（**所有 CPT 共用这一份**）
2. **全文复制** 粘贴到自定义提交编辑框
3. 点 **编译**，显示成功后点 **保存**

### 3. 绑定属性（每个 CPT 绑 3 个，仅 action 不同）

| 属性 | 类型 | 值 |
|------|------|-----|
| `clueId` | **JobValue** | `=$clueid` |
| `callbackSecret` | **String** | 48 位密钥 |
| `action` | **String** | 见下表（字面量） |

| CPT | action |
|-----|--------|
| `cclue_to_public.cpt`（培育） | `toNurture` |
| `cclue_to_public.cpt`（channel） | `toChannel` |
| `clue_edit.cpt` | `edit` |
| `clue_to_company.cpt` | `toCustomer` |
| `clue_shift.cpt` | `shift` |

> **注意**：`cclue_to_public.cpt` 培育版和 channel 版 `action` 不能混用。

### 4. 删除旧 JS 回调

按钮 → 提交入库 → **设置回调函数** → 删掉 `FR.ajax(...camelusai.com...)` 整段。

### 5. 保存并发布 CPT

发布到 CRM 服务器后即生效，无需重启。

---

## 示例：转 channel

**报表填报属性** 应有 2 条：

```
① 提交入库（原有 SQL）     ← 保留
② 自定义提交（粘贴 PartnerHubLeadNotify.java 编译保存）
     clueId         = $clueid   (JobValue)
     callbackSecret = <密钥>     (String)
     action         = toChannel (String)
```

---

## 第二步：验证

1. 用测试线索在 CRM 页面真实提交
2. `fanruan.log` 搜索 `PartnerHub callback`，期望：

```
PartnerHub callback clueId=... action=toChannel http=200 body={"ok":true,"mode":"removed"}
```

3. Partner Hub 线索列表刷新后应同步

---

## 备选方案：部署 class 文件

若设计器编译报错，或希望多 CPT 共用同一个 class，再用此方案：

1. 复制 `dist/com/fr/data/PartnerHubLeadNotifyJob.class` 到 `WEB-INF/classes/com/fr/data/`
2. 重启帆软
3. 自定义提交选 `com.fr.data.PartnerHubLeadNotifyJob`（需绑 `action` 等 5 个属性）

详见 `docs/crm-java-custom-submit.md`。

---

## 迁移检查清单

- [ ] 各 CPT 已粘贴 `PartnerHubLeadNotify.java` 并编译成功
- [ ] 绑定了 `clueId` + `callbackSecret` + `action`（action 与 CPT 场景一致）
- [ ] 保留了原 SQL 提交入库
- [ ] 已删除 JS Partner Hub 回调
- [ ] 测试提交，fanruan.log 有 `http=200`
- [ ] Partner Hub 列表已同步

---

## 相关文件

```
crm-integration/java/designer/
  PartnerHubLeadNotify.java   ← 所有 CPT 共用，仅 action 绑定值不同
```
