# Partner Hub 浏览器助手（Chrome 扩展）

在 Partner Hub 线索页点击「一键写邮件」，自动打开企业邮写信页并填充**收件人、主题、正文与附件**。

## 安装步骤（约 1 分钟）

1. 从 Hub 下载 `browser-bridge.zip` 并解压到任意固定位置（安装后不要删除该文件夹）
2. Chrome 打开 `chrome://extensions`
3. 打开右上角「**开发者模式**」开关
4. 点击左上角「**加载已解压的扩展程序**」，选择解压出的 `browser-bridge` 文件夹
5. 完成。回到 Partner Hub 线索详情页刷新，发送按钮会变成「一键写邮件」

## 使用前提

- 使用 **Chrome** 浏览器（或 Edge 等 Chromium 内核浏览器）
- 企业邮（exmail.qq.com）已在本浏览器**登录**
- 已登录 Partner Hub（附件下载依赖 Hub 登录态）

## 工作原理

- Hub 网页通过 Chrome 扩展消息通道（`externally_connectable`）向扩展发送指令
- 扩展打开/复用企业邮标签页，在页面内填充收件人、主题、正文
- 附件由扩展后台从 Hub 下载后注入写信页（模拟文件选择/拖拽）
- 邮件仍由你本人在企业邮中确认并发送，扩展**不会代发邮件**

## 常见问题

**按钮没有变成「一键写邮件」？**
刷新 Hub 页面；确认扩展在 `chrome://extensions` 中处于启用状态。

**提示找不到「写信」按钮？**
确认企业邮已登录且能正常打开邮箱界面，再重试。

**附件注入失败？**
内容仍会正常填充，附件请在写信页手动添加（Hub 中可单独下载）。

## 目录说明

```
browser-bridge/
├── manifest.json          # MV3 清单（key 固定扩展 ID）
├── background.js          # Service Worker：接收 Hub 指令、下载附件、调度标签页
├── content/
│   └── exmail-compose.js  # 企业邮写信页适配器（填充 + 附件注入）
├── popup.html             # 扩展弹窗（状态说明）
└── README.md
```

扩展 ID 固定为 `gnmnjdfmcfegdkkgpopoefjpjlcabajl`（由 manifest `key` 派生，所有人加载后一致）。
`key.pem` 为扩展签名私钥，仅保留在管理员本机，**不要**打包分发或提交 Git。
