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

在 `.env` 中配置 OpenAI 兼容接口（Kimi / DeepSeek / 通义 / OpenAI 均可）：

```env
AI_BASE_URL="https://api.moonshot.cn/v1"
AI_API_KEY="sk-..."
AI_MODEL="kimi-k2-0711-preview"
```

不配置 Key 时系统其他功能正常，AI 功能会提示未配置。

## 团队部署（Docker）

```bash
AI_API_KEY=sk-xxx SESSION_SECRET=$(openssl rand -hex 32) docker compose up -d --build
```

数据持久化在 `partner-data` 卷中；首次启动自动建表并导入种子数据。

## 技术栈

Next.js 16（App Router）· Prisma + SQLite · Tailwind CSS · 自实现 Cookie 会话认证（bcrypt + JWT）
