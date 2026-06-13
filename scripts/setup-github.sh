#!/usr/bin/env bash
# 一次性配置 Mac ↔ GitHub（centimetre11/partner-hub）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
REPO="centimetre11/partner-hub"

echo "==> 1/4 检查 SSH 密钥..."
mkdir -p ~/.ssh && chmod 700 ~/.ssh
if [[ ! -f ~/.ssh/id_ed25519 ]]; then
  ssh-keygen -t ed25519 -C "centimetre11@github" -f ~/.ssh/id_ed25519 -N ""
fi
ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null || true

echo ""
echo "==> 2/4 请把下面这把公钥添加到 GitHub："
echo "    https://github.com/settings/ssh/new"
echo ""
cat ~/.ssh/id_ed25519.pub
echo ""
read -r -p "添加完成后按回车继续..."

echo "==> 3/4 登录 GitHub CLI 并创建私有仓库..."
if ! gh auth status >/dev/null 2>&1; then
  gh auth login -h github.com -p ssh -w
fi

if gh repo view "$REPO" >/dev/null 2>&1; then
  echo "仓库已存在: https://github.com/$REPO"
else
  gh repo create "$REPO" --private --source=. --remote=origin --description "帆软中东伙伴管理系统 Partner Hub"
fi

git remote set-url origin "git@github.com:${REPO}.git" 2>/dev/null || git remote add origin "git@github.com:${REPO}.git"

echo "==> 4/4 推送代码..."
git push -u origin main

echo ""
echo "完成！仓库地址: https://github.com/$REPO"
echo "手机 Cursor：登录 GitHub 后打开该仓库即可。"
