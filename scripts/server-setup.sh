#!/usr/bin/env bash
# 云服务器首次初始化：Docker、Nginx、Git clone
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/partner-hub}"
DOMAIN="${DOMAIN:-}"
REPO_URL="${REPO_URL:-git@github.com:centimetre11/partner-hub.git}"

echo "==> 更新系统包..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg nginx certbot python3-certbot-nginx git

if ! command -v docker >/dev/null 2>&1; then
  echo "==> 安装 Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
fi

echo "==> 克隆代码仓库..."
mkdir -p "$(dirname "$APP_DIR")"
if [[ -d "$APP_DIR/.git" ]]; then
  cd "$APP_DIR"
  git pull --ff-only
else
  rm -rf "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

if [[ ! -f .env ]]; then
  echo "提示: .env 尚未配置，请在本机运行 deploy.sh --init 上传，或手动创建 $APP_DIR/.env"
fi

echo "==> 配置 Nginx..."
NGINX_SITE="/etc/nginx/sites-available/partner-hub"
SERVER_NAME="${DOMAIN:-_}"

cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
EOF

ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/partner-hub
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx

if [[ -n "$DOMAIN" ]]; then
  echo "==> 申请 HTTPS 证书..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || {
    echo "警告: 证书申请失败，请确认域名已解析到本机后手动运行: certbot --nginx -d $DOMAIN"
  }
fi

echo ""
echo "服务器初始化完成。下一步: 配置 .env 后执行 docker compose up -d --build"
