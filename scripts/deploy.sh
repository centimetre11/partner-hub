#!/usr/bin/env bash
# 从 Git 拉取最新代码并在云服务器上重建部署
set -euo pipefail

REPO_URL="${REPO_URL:-git@github.com:centimetre11/partner-hub.git}"
APP_DIR="${APP_DIR:-/opt/partner-hub}"

usage() {
  cat <<EOF
用法:
  ./scripts/deploy.sh user@host [--domain your.domain.com] [--init]

  --init   服务器首次部署（安装 Docker/Nginx、clone 仓库、上传 .env）
  默认     已有环境时 git pull + docker compose up -d --build

环境变量:
  REPO_URL   Git 仓库地址（默认 ${REPO_URL}）
  SSH_PASS   密码登录时配合 sshpass

示例:
  ./scripts/deploy.sh ubuntu@1.2.3.4 --domain app.example.com --init
  ./scripts/deploy.sh ubuntu@1.2.3.4
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

TARGET="$1"
shift
DOMAIN=""
INIT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --init)
      INIT=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数: $1"
      usage
      exit 1
      ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

remote() {
  if [[ -n "${SSH_PASS:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=accept-new "$TARGET" "$@"
  else
    ssh -o StrictHostKeyChecking=accept-new "$TARGET" "$@"
  fi
}

scp_to_remote() {
  local src="$1" dest="$2"
  if [[ -n "${SSH_PASS:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    sshpass -p "$SSH_PASS" scp -o StrictHostKeyChecking=accept-new "$src" "$TARGET:$dest"
  else
    scp -o StrictHostKeyChecking=accept-new "$src" "$TARGET:$dest"
  fi
}

echo "==> 测试 SSH: $TARGET"
remote "echo ok"

if [[ "$INIT" -eq 1 ]]; then
  if [[ ! -f "$ROOT/.env" ]]; then
    echo "错误: 本地缺少 .env，请先 cp .env.example .env 并填写生产配置"
    exit 1
  fi

  echo "==> 同步 server-setup.sh 并首次安装..."
  scp_to_remote "$ROOT/scripts/server-setup.sh" "/tmp/partner-hub-server-setup.sh"
  remote "chmod +x /tmp/partner-hub-server-setup.sh && sudo REPO_URL='$REPO_URL' APP_DIR='$APP_DIR' DOMAIN='$DOMAIN' bash /tmp/partner-hub-server-setup.sh"

  echo "==> 上传生产 .env（不会进入 Git）..."
  remote "sudo mkdir -p '$APP_DIR' && sudo chown -R \$(whoami):\$(whoami) '$APP_DIR'"
  scp_to_remote "$ROOT/.env" "$APP_DIR/.env"

  echo "==> 启动应用..."
  remote "cd '$APP_DIR' && docker compose up -d --build"
else
  echo "==> 拉取最新代码并重建..."
  remote "cd '$APP_DIR' && git pull --ff-only && docker compose up -d --build"
fi

echo ""
echo "部署完成。仓库: $REPO_URL"
