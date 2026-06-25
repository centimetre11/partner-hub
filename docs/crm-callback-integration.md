# CRM 填报成功 → Partner Hub 自动同步

CRM 线索在帆软报表里「提交入库」成功后，通过回调通知 Partner Hub（https://camelusai.com），无需销售再点「完成后刷新此线索」。

参考帆软文档：[JS 实现回调函数中自定义提示](https://help.fanruan.com/finereport/doc-view-1219.html)（`fr_submitinfo.success`）。

---

## 1. 场景一览（6 个操作 + 全量）

| 场景 | CPT 模板 | URL type | action 值 | 是否需要回调 | Partner Hub 行为 |
|------|----------|----------|-----------|--------------|------------------|
| 线索视图 | `clue_view.cpt` | — | — | **否**（只读） | 无 |
| 转培育 | `cclue_to_public.cpt` | `type=培育` | `toNurture` | **是** | 即时改状态为「销售培育中」，后台 CRM 校准 |
| 转 channel | `cclue_to_public.cpt` | `type=channel` | `toChannel` | **是** | 从列表删除，后台 CRM 校准 |
| 基础信息编辑 | `clue_edit.cpt` | — | `edit` | **是** | 后台按 clueId 单条 CRM 校准（约 1 分钟） |
| 转客户 | `clue_to_company.cpt` | — | `toCustomer` | **是** | 从列表删除，后台 CRM 校准 |
| 责任转移 | `clue_shift.cpt` | — | `shift` | **是** | 后台单条校准（更新责任销售等） |
| 全量同步 | — | — | `fullSync: true` | 按需 | 后台全表重拉（约 1 分钟，与每晚定时相同） |

> **注意**：转 channel 与转培育共用 `cclue_to_public.cpt`，仅靠 `type` 区分，回调里的 `action` 切勿写反。

---

## 2. Partner Hub 回调接口

### 2.1 地址

```
POST https://camelusai.com/api/leads/crm-callback
Content-Type: application/json
X-CRM-Callback-Secret: <与 CRM_CALLBACK_SECRET 一致>
```

也支持：`Authorization: Bearer <secret>`

### 2.2 请求体

**单条操作（常见）**

```json
{
  "clueId": "7120c4b1-83f1-4acd-9f21-d661e316f5e9",
  "action": "toNurture"
}
```

**全量同步**

```json
{
  "clueId": "00000000-0000-0000-0000-000000000000",
  "fullSync": true
}
```

`action` 也支持中文别名：`培育`、`转channel`、`转客户`、`编辑`、`责任转移`、`全量同步` 等。

### 2.3 响应

| mode | 含义 |
|------|------|
| `updated` | 本地已更新（如转培育） |
| `removed` | 本地已删除（转 channel / 转客户） |
| `reconcile_started` | 后台开始 CRM 校准（编辑 / 责任转移） |
| `full_sync_started` | 后台开始全量同步 |
| `ignored` | 忽略（如 view） |

### 2.4 Partner Hub 环境变量

在服务器 `.env` 中配置：

```bash
CRM_CALLBACK_SECRET="请生成一串随机密钥"
# 可选：测试页返回示例 clueId，方便 CRM 管理员 dryRun
CRM_CALLBACK_TEST_CLUE_ID="7120c4b1-83f1-4acd-9f21-d661e316f5e9"
```

CRM 侧 Java / JS 回调使用**同一密钥**。未配置时 POST 返回 503。

**不是每个 action 单独一把密钥**——6 个填报场景 + 全量同步，都用 `X-CRM-Callback-Secret` 传这一把。

与线索 pub 数据 API（`LEADS_DATA_URL` 里的 `secret=crm123`）是**另一套**，互不替代。

---

## 2.5 测试链接（给 CRM 管理员）

**浏览器直接打开（无需登录）：**

```
GET https://camelusai.com/api/leads/crm-callback
```

返回 JSON：服务是否就绪、`secretConfigured`、支持的 action、ping/dryRun 示例。

**Step 1 — 验证密钥（不写库）**

```bash
curl -sS -X POST https://camelusai.com/api/leads/crm-callback \
  -H "Content-Type: application/json" \
  -H "X-CRM-Callback-Secret: <密钥>" \
  -d '{"ping":true}'
```

期望：`{"ok":true,"mode":"ping"}`

**Step 2 — 预览某 action 会做什么（不写库）**

```bash
curl -sS -X POST https://camelusai.com/api/leads/crm-callback \
  -H "Content-Type: application/json" \
  -H "X-CRM-Callback-Secret: <密钥>" \
  -d '{"dryRun":true,"clueId":"<线索UUID>","action":"toNurture"}'
```

期望：`{"ok":true,"mode":"dry_run","dryRunDetail":"..."}`

**Step 3 — 真实回调（会写库，调试时用测试线索）**

```bash
curl -sS -X POST https://camelusai.com/api/leads/crm-callback \
  -H "Content-Type: application/json" \
  -H "X-CRM-Callback-Secret: <密钥>" \
  -d '{"clueId":"<线索UUID>","action":"toNurture"}'
```

各 action 与 CPT 对应见第 1 节场景表。

---

## 3. 接入方式（二选一）

### 方式 A：Java 自定义提交（推荐）

**优点**：密钥在 CRM 服务端，无浏览器跨域问题；与「提交入库」可同时存在。

**步骤**

1. 编译并部署 class（见第 4 节）
2. 打开 CPT 模板 → **模板 → 报表填报属性**
3. 保留原有 **提交入库**（写 CRM 数据库）
4. **新增** 一条 **自定义提交** → 类名选 `com.fr.data.PartnerHubLeadNotifyJob`
5. 绑定属性：

| 属性名 | 类型 | 绑定示例 | 说明 |
|--------|------|----------|------|
| `clueId` | JobValue | `=$clueid` 或 clueid 所在单元格 | 线索 ID |
| `action` | String | 见场景表固定值 | 如 `toNurture` |
| `callbackUrl` | String | 留空 | 默认 camelusai.com |
| `callbackSecret` | String | 与 `CRM_CALLBACK_SECRET` 相同 | |
| `fullSync` | String | 留空 | 仅全量场景填 `true` |

6. **重启帆软报表服务**

各模板 `action` 固定值：

- `cclue_to_public.cpt`（培育）→ `toNurture`
- `cclue_to_public.cpt`（channel）→ `toChannel`
- `clue_edit.cpt` → `edit`
- `clue_to_company.cpt` → `toCustomer`
- `clue_shift.cpt` → `shift`

### 方式 B：提交入库 + JS 回调

**优点**：不改 Java，在设计器里「设置回调函数」即可。

**缺点**：浏览器跨域；已在 Partner Hub 接口配置 CORS（`overseas.finereporthelp.com` 等）。密钥会出现在 JS 中，安全性略低。

**步骤**

1. 控件/按钮 → 事件 → **提交入库** → 设置填报属性
2. 点击 **设置回调函数**
3. 粘贴 `crm-integration/js/` 下对应场景的脚本，修改 `CLUE_ID`、`SECRET`

| 场景 | 脚本文件 |
|------|----------|
| 转培育 | `js/callback-toNurture.js` |
| 转 channel | `js/callback-toChannel.js` |
| 基础信息编辑 | `js/callback-edit.js` |
| 转客户 | `js/callback-toCustomer.js` |
| 责任转移 | `js/callback-shift.js` |
| 全量同步 | `js/callback-fullSync.js` |

回调示例（转培育）：

```javascript
if (fr_submitinfo.success) {
  FR.ajax({
    url: "https://camelusai.com/api/leads/crm-callback",
    type: "POST",
    contentType: "application/json",
    headers: { "X-CRM-Callback-Secret": "你的密钥" },
    data: JSON.stringify({
      clueId: "${clueid}",
      action: "toNurture"
    }),
    complete: function () {
      FR.Msg.toast("提交成功，Partner Hub 已同步");
    }
  });
} else {
  FR.Msg.toast("提交失败：" + fr_submitinfo.failinfo);
}
```

---

## 4. 编译与部署 Java class

源码：`crm-integration/java/PartnerHubLeadNotifyJob.java`

### 4.1 前置条件

- JDK 8+
- 帆软安装目录 `FR_HOME`（含 `WEB-INF/lib/*.jar`）

### 4.2 命令行编译

```bash
cd partner-hub/crm-integration/java
export FR_HOME=/opt/finereport/WebReport   # 按实际路径修改
chmod +x compile.sh
./compile.sh
```

脚本会：

1. 使用 `WEB-INF/lib/*` 作为 classpath 编译
2. 将 `com/fr/data/PartnerHubLeadNotifyJob.class` 复制到 `WEB-INF/classes/com/fr/data/`

### 4.3 设计器内编译（可选）

1. 模板 → 报表填报属性 → 自定义提交 → **编辑**
2. 粘贴 `PartnerHubLeadNotifyJob.java` 全文
3. 点击 **编译** → **保存**

### 4.4 生效

修改 class 后 **必须重启帆软报表服务**（或 Tomcat）。

日志：在 `fanruan.log` 中搜索 `PartnerHub callback`。

---

## 5. 何时用单条 vs 全量

| 情况 | 建议 |
|------|------|
| 销售在 CRM 完成转培育/转客户/编辑等 | 单条回调（对应 action） |
| CRM 批量脚本改库、数据大面积不一致 | `fullSync: true` 或服务器 `npm run leads-sync` |
| 每晚定时 | 已有 `LEADS_SYNC` 定时任务，无需回调 |

单条回调仍会在后台拉 CRM pub API 做校准（pub API 无按 clueId 查询，需全量拉取后过滤一条）；接口本身 **立即返回**，不阻塞 CRM 提交。

---

## 6. 测试

```bash
curl -X POST https://camelusai.com/api/leads/crm-callback \
  -H "Content-Type: application/json" \
  -H "X-CRM-Callback-Secret: 你的密钥" \
  -d '{"clueId":"7120c4b1-83f1-4acd-9f21-d661e316f5e9","action":"toNurture"}'
```

期望：`{"ok":true,"mode":"updated"}`

全量：

```bash
curl -X POST https://camelusai.com/api/leads/crm-callback \
  -H "Content-Type: application/json" \
  -H "X-CRM-Callback-Secret: 你的密钥" \
  -d '{"clueId":"x","fullSync":true}'
```

---

## 7. 文件清单

```
crm-integration/
├── java/
│   ├── PartnerHubLeadNotifyJob.java   # 自定义提交类源码
│   └── compile.sh                     # 编译脚本
└── js/
    ├── callback-toNurture.js
    ├── callback-toChannel.js
    ├── callback-edit.js
    ├── callback-toCustomer.js
    ├── callback-shift.js
    └── callback-fullSync.js

src/app/api/leads/crm-callback/route.ts   # Partner Hub 回调 API
src/lib/leads-sync.ts                     # handleCrmLeadCallback 逻辑
```

部署 Partner Hub 后记得设置 `CRM_CALLBACK_SECRET` 并重启容器。
