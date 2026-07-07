# CRM 线索填报 → Partner Hub 同步（Java 自定义提交）

给 **CRM / 帆软管理员** 的操作手册。用 Java 在服务端回调 Partner Hub，**不需要写 JS 回调**，不会出现 `fr_submitinfo is not defined`。

Partner Hub 地址：`https://camelusai.com/api/leads/crm-callback`

---

## 一、你需要准备的东西

| 项目 | 说明 |
|------|------|
| 编译好的 class | 仓库内 `crm-integration/dist/com/fr/data/PartnerHubLeadNotifyJob.class` |
| 回调密钥 | 与 Partner Hub 服务器 `.env` 中 `CRM_CALLBACK_SECRET` **完全一致**（48 位，找陈敏索取） |
| 帆软部署目录 | 含 `WEB-INF/classes` 和 `WEB-INF/lib` 的 WebReport 根目录 |
| 需接入的 CPT | 见下方「各模板 action 对照表」 |

---

## 二、部署 class（一次性）

### 2.1 复制文件

将以下文件复制到帆软服务器：

```
源文件（本仓库）:
  crm-integration/dist/com/fr/data/PartnerHubLeadNotifyJob.class

目标路径（帆软服务器）:
  <FR_HOME>/WEB-INF/classes/com/fr/data/PartnerHubLeadNotifyJob.class
```

示例（Linux）：

```bash
# FR_HOME 按实际路径修改，例如 /opt/finereport/WebReport
mkdir -p $FR_HOME/WEB-INF/classes/com/fr/data
cp PartnerHubLeadNotifyJob.class $FR_HOME/WEB-INF/classes/com/fr/data/
```

### 2.2 重启帆软

**必须重启** Tomcat / 帆软报表服务，class 才会生效。

### 2.3 验证 class 已加载

重启后，在设计器打开任意 CPT → **模板** → **报表填报属性** → **添加** → **自定义提交**，类名列表中应出现：

```
com.fr.data.PartnerHubLeadNotifyJob
```

若看不到，检查 class 路径是否正确、是否已重启。

### 2.4 在 CRM 服务器上重新编译（可选）

若需改源码，在 CRM 服务器上：

```bash
cd crm-integration/java
export FR_HOME=/path/to/WebReport   # 帆软根目录
./compile.sh
```

脚本会自动编译并复制到 `WEB-INF/classes`。本地无帆软环境时也可 `./compile.sh`，产物在 `crm-integration/dist/`。

---

## 三、各 CPT 模板配置（核心步骤）

每个需要同步 Partner Hub 的 CPT，都做以下操作。**clue_view.cpt 只读，无需配置。**

### 3.1 打开填报属性

1. 用 FineReport 设计器打开 CPT
2. 菜单 **模板** → **报表填报属性**
3. **保留原有「提交入库」**（写 CRM 数据库，不要删）
4. 点击 **添加** → 选择 **自定义提交**
5. 类名选 **`com.fr.data.PartnerHubLeadNotifyJob`**

### 3.2 绑定属性

在自定义提交的属性绑定里填写：

| 属性名 | 类型 | 绑定值 | 说明 |
|--------|------|--------|------|
| `clueId` | **JobValue** | `=$clueid` 或 clueid 所在单元格 | 线索 UUID，来自 URL 参数 |
| `action` | **String** | 见下表固定字符串 | 每个 CPT 不同 |
| `callbackSecret` | **String** | 填写 48 位密钥 | 与 Partner Hub 一致 |
| `callbackUrl` | **String** | **留空** | 默认 camelusai.com |
| `fullSync` | **String** | **留空** | 仅全量同步时填 `true` |

> **注意**：属性名必须完全一致（区分大小写）。`clueId` 类型选 **JobValue**，不要选 String。

### 3.3 各模板 action 对照表

| CPT 模板 | URL / 场景 | action 固定值 | Partner Hub 行为 |
|----------|------------|---------------|------------------|
| `cclue_to_public.cpt` | `type=培育` | `toNurture` | 状态改为「销售培育中」 |
| `cclue_to_public.cpt` | `type=channel` | `toChannel` | 从列表删除 |
| `clue_edit.cpt` | 基础信息编辑 | `edit` | 后台单条 CRM 校准 |
| `clue_to_company.cpt` | 转客户 | `toCustomer` | 从列表删除 |
| `clue_shift.cpt` | 责任转移 | `shift` | 后台单条校准 |
| `clue_view.cpt` | 只读查看 | — | **无需挂载** |

> 转 channel 与转培育共用 `cclue_to_public.cpt`，仅靠 URL 参数 `type` 区分，**action 切勿写反**。

### 3.4 保存并发布

1. 保存 CPT
2. 按你们现有流程发布到 CRM 报表服务器
3. **无需**在按钮上配置 JS「设置回调函数」

---

## 四、配置示例（转培育）

**模板**：`cclue_to_public.cpt`（`type=培育`）

**报表填报属性** 应有两条提交：

1. **提交入库**（原有 SQL，写 CRM 库）— 保持不变  
2. **自定义提交** `com.fr.data.PartnerHubLeadNotifyJob` — 新增  

自定义提交属性绑定：

```
clueId         = $clueid          （JobValue）
action         = toNurture        （String，字面量）
callbackSecret = xxxxxxxxxxxxxxxx  （String，48位密钥）
callbackUrl    = （留空）
fullSync       = （留空）
```

---

## 五、测试

### 5.1 先测 Partner Hub 接口（Postman / curl）

```bash
curl -sS -X POST https://camelusai.com/api/leads/crm-callback \
  -H "Content-Type: application/json" \
  -d '{"ping":true,"callbackSecret":"<你的48位密钥>"}'
```

期望：`{"ok":true,"mode":"ping"}`

预览某 action（不写库）：

```bash
curl -sS -X POST https://camelusai.com/api/leads/crm-callback \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true,"callbackSecret":"<密钥>","clueId":"<测试线索UUID>","action":"toNurture"}'
```

期望：`{"ok":true,"mode":"dry_run",...}`

浏览器测试页（无需登录）：  
https://camelusai.com/api/leads/crm-callback

### 5.2 再在 CRM 里真实提交

1. 用**测试线索**打开对应 CPT
2. 完成填报并提交
3. CRM 应提示提交成功（若 Partner Hub 回调失败，会抛异常并提示失败）
4. 到 Partner Hub 线索列表确认状态已更新

### 5.3 查日志

帆软日志 `fanruan.log` 中搜索：

```
PartnerHub callback
```

成功示例：

```
PartnerHub callback clueId=7120c4b1-... action=toNurture fullSync=false http=200
```

失败常见原因：

| 日志 / 现象 | 原因 | 处理 |
|-------------|------|------|
| `clueId 为空` | clueId 未绑定或单元格无值 | 检查 `=$clueid` 绑定 |
| `callbackSecret 为空` | 未填密钥 | 绑定 callbackSecret |
| `HTTP 401` | 密钥错误 | 核对 48 位密钥 |
| `HTTP 503` | Partner Hub 未配置密钥 | 联系陈敏 |
| `HTTP 400` HTML（nginx） | 网络层拦截 | Java 服务端一般无此问题；检查 CRM 服务器能否访问 camelusai.com |

---

## 六、与 JS 回调的区别

| | Java 自定义提交（推荐） | JS 回调 |
|--|------------------------|---------|
| 执行位置 | CRM 服务端 | 浏览器 |
| 密钥 | 绑在模板属性，不出现在浏览器 | 写在 JS 里，可被看到 |
| 跨域 | 无 | 需 CORS |
| fr_submitinfo | **不需要** | 必须写在「设置回调函数」里 |
| 配置位置 | 报表填报属性 → 自定义提交 | 按钮 → 提交入库 → 设置回调函数 |

**若已改用 Java，请删除 CPT 里之前粘贴的 Partner Hub JS 回调脚本**，避免重复通知。

---

## 七、常见问题

**Q：自定义提交和 SQL 提交入库的执行顺序？**  
A：两者并列配置；CRM 入库成功后，Java 类会向 Partner Hub 发 HTTP POST。Partner Hub 回调失败时，自定义提交会抛异常（销售会看到提交失败）。

**Q：能否只配 Java、不配 SQL 提交入库？**  
A：不行。Java 类只负责通知 Partner Hub，不写 CRM 数据库；SQL 提交入库仍需保留。

**Q：全量同步怎么用？**  
A：一般不需要。若 CRM 批量改库后需触发 Partner Hub 全表重拉，可单独建一个 CPT 或在某次提交里设 `fullSync=true`（`clueId` 可填任意 UUID）。

**Q：密钥存在哪里？**  
A：绑在每个 CPT 的 `callbackSecret` 属性上。也可后续改为 JVM 参数注入（需改源码），当前版本以模板绑定为准。

---

## 八、文件清单

```
crm-integration/
├── dist/
│   └── com/fr/data/
│       └── PartnerHubLeadNotifyJob.class   ← 部署此文件
├── java/
│   ├── com/fr/data/PartnerHubLeadNotifyJob.java
│   ├── stubs/                             ← 仅本地编译用
│   └── compile.sh
└── js/                                    ← JS 方式备用，可不使用
```

相关 Partner Hub 代码：`src/app/api/leads/crm-callback/route.ts`

---

## 九、接入检查清单

给 Fay.Wen / CRM 管理员逐项勾选：

- [ ] `PartnerHubLeadNotifyJob.class` 已放到 `WEB-INF/classes/com/fr/data/`
- [ ] 帆软服务已重启
- [ ] 设计器里能选到 `com.fr.data.PartnerHubLeadNotifyJob`
- [ ] 各 CPT 已添加自定义提交，且 **保留** 原 SQL 提交入库
- [ ] `clueId` 绑定为 JobValue（`=$clueid`）
- [ ] `action` 与 CPT 场景一致（见第三节对照表）
- [ ] `callbackSecret` 已填写且与 Partner Hub 一致
- [ ] 已删除旧的 Partner Hub JS 回调（如有）
- [ ] curl ping 测试通过
- [ ] 用测试线索真实提交，Partner Hub 列表已更新
- [ ] fanruan.log 有 `PartnerHub callback ... http=200`
