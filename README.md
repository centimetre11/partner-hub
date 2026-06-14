# 帆软中东伙伴管理系统（Partner Hub）

AI 原生的中东区合作伙伴管理系统，为帆软软件 MEA BD 团队打造。基于《中东BI合作伙伴》研究材料构建：候选池预置 67 家伙伴（Tier A/B/C 作战分级、关键联系人、打法话术），并导入 12 周行动时间线作为初始待办。

## 核心功能

| 模块 | 说明 |
|------|------|
| 候选池 | 67 家候选伙伴，筛选/标记（推进/观察/放弃），确认后一键转正式伙伴 |
| 正式伙伴 | 八大模块档案：画像、权力地图、商机 Pipeline（十阶段）、培训认证、动态时间线 |
| 信息完整度 | 按字段权重自动评分，列出缺失项，看板有待提升排行 |
| 待办管理 | 关联伙伴与负责人，逾期标红，停滞超 30 天伙伴预警 |
| 经营看板 | 候选转化漏斗、Pipeline 分布、Tier/国家分布 |

## AI 能力（AI 原生设计）

所有 AI 写入都经过 **diff 人工确认** 后才入库，并在时间线留审计记录。

- **会议模式**：开会时左边速记，右边权力地图/商机/承诺事项实时刷新；结束自动生成纪要归档
- **AI 信息投喂**：粘贴聊天记录（WhatsApp/微信）、邮件、新闻，AI 自动判断归属伙伴并抽取联系人/商机/待办
- **全局 AI 助手**（右下角浮窗）：自然语言查询（"哪些 Tier A 超 2 周没跟进？"）、自然语言操作（"把 DataPlus 推到 POC 阶段"）、跨伙伴对比分析
- **补全助手**：基于档案缺口生成"下次接触该问什么"
- **动态摘要 / 经营周报**：一键生成伙伴近况摘要和本周经营周报

## Agent 框架（自定义 + 共享 + 定时推送）

「Agent 中心」让任何成员组装自己的自动化 Agent：**一段指令 + 勾选技能 + 触发方式 + 作用域**。

- **技能库**（Agent 与全局助手共用）：查/读/改伙伴档案、建/查待办、`web_search` 联网搜索、`fetch_url` 读网页、写伙伴时间线
- **触发**：手动运行，或定时调度（每小时/每天/每周，内置每分钟调度器，无需外部队列）
- **推送**：运行简报进系统收件箱（侧边栏未读角标 + 工作台卡片），可配 Webhook 推到飞书/企微/钉钉/Slack 群机器人
- **安全边界**：Agent 修改档案字段一律生成提案，收件箱里人工确认后才入库；写时间线和建待办直接执行并留工具调用审计日志
- **共享**：Agent 默认团队共享，可一键克隆改造
- **模板库**（开箱即用）：领英/外部动态监测（定时·每周）、停滞伙伴唤醒（定时·每天）、竞品信号雷达（定时·每周）、候选伙伴发现（手动）、会前简报（手动·绑定伙伴）

联网搜索配置：`.env` 里填 `BOCHA_API_KEY`（[博查开放平台](https://open.bocha.cn)）；不配且 AI 用的是 Kimi（moonshot）时自动改用 Kimi 内置 `$web_search`。

## 本地启动

```bash
npm install
npx prisma db push          # 初始化数据库
npx tsx prisma/seed.ts      # 导入 67 家伙伴 + 初始待办
cp .env.example .env        # 配置环境变量（见下）
npm run dev                 # http://localhost:3000
```

首次打开会要求创建管理员账号；之后可在「团队设置」中添加成员。

## AI 配置

推荐登录后在「团队设置 → 大模型管理中心」添加一个或多个 OpenAI 兼容接口（Kimi / DeepSeek / 通义 / OpenAI 均可），可设置默认 API，并在同页查看各 API 每日 Token 用量与最近调用记录。

也可以继续在 `.env` 中配置一个兜底接口：

```env
AI_BASE_URL="https://api.moonshot.cn/v1"
AI_API_KEY="sk-..."
AI_MODEL="kimi-k2-0711-preview"
```

不配置数据库 API 且不配置 Key 时系统其他功能正常，AI 功能会提示未配置。

## Git 仓库（Mac / 手机 Cursor 共用）

源码托管在 GitHub：**https://github.com/centimetre11/partner-hub**（私有仓库）

```bash
# Mac 日常开发
git add .
git commit -m "your message"
git push

# 手机 Cursor：登录同一 GitHub 账号，打开 centimetre11/partner-hub 即可
```

`.env`、本地数据库、上传文件已在 `.gitignore` 中，**不会**被推送到 GitHub。

## 团队部署（Git + Docker）

**首次**在云服务器上（需已配置 SSH 密钥访问 GitHub，见下方）：

```bash
# 在 Mac 上执行（把 ubuntu@你的IP 和域名换成实际值）
chmod +x scripts/deploy.sh
./scripts/deploy.sh ubuntu@你的公网IP --domain app.你的域名.com --init
```

**日常更新**（Mac push 代码后）：

```bash
./scripts/deploy.sh ubuntu@你的公网IP
```

服务器上 `.env` 单独维护，不会随 `git pull` 覆盖。生产环境示例：

```env
SESSION_SECRET="用 openssl rand -hex 32 生成"
AI_API_KEY="sk-..."
AI_BASE_URL="https://api.moonshot.cn/v1"
AI_MODEL="kimi-k2-0711-preview"
```

数据持久化在 Docker 卷中；首次启动自动建表并导入种子数据。

### 服务器访问私有 GitHub 仓库

在服务器上生成 Deploy Key（只读即可）：

```bash
ssh-keygen -t ed25519 -C "partner-hub-deploy" -f ~/.ssh/partner_hub_deploy -N ""
cat ~/.ssh/partner_hub_deploy.pub   # 复制到 GitHub → 仓库 Settings → Deploy keys
```

并在 `~/.ssh/config` 中配置：

```
Host github.com
  IdentityFile ~/.ssh/partner_hub_deploy
  IdentitiesOnly yes
```

## 技术栈

Next.js 16（App Router）· Prisma + SQLite · Tailwind CSS · 自实现 Cookie 会话认证（bcrypt + JWT）
