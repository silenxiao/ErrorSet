#!/usr/bin/env bash
# ErrorSet 服务器一键部署/更新脚本（Ubuntu/Debian，其他 Linux 需先自行装好 Docker）
# 用法：把仓库上传到服务器后，在仓库根目录执行  bash deploy/setup_server.sh
#       HTTPS 域名模式（需域名 A 记录已指向本机、安全组放行 80/443）：
#         bash deploy/setup_server.sh --with-domain example.com [--admin-domain admin.example.com]
# 幂等：重复执行会重新构建镜像并重建容器（短暂停机）

set -euo pipefail

cd "$(dirname "$0")/.."

WEB_DOMAIN="" ADMIN_DOMAIN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --with-domain)   [ $# -ge 2 ] && [ -n "$2" ] || { echo "缺少域名" >&2; exit 1; }; WEB_DOMAIN="$2"; shift 2 ;;
    --admin-domain)  [ $# -ge 2 ] && [ -n "$2" ] || { echo "缺少管理域名" >&2; exit 1; }; ADMIN_DOMAIN="$2"; shift 2 ;;
    *) echo "[失败] 未知参数：$1（用法：bash deploy/setup_server.sh [--with-domain 域名] [--admin-domain 域名]）" >&2; exit 1 ;;
  esac
done
if [ -n "$ADMIN_DOMAIN" ] && [ -z "$WEB_DOMAIN" ]; then
  echo "[失败] --admin-domain 需要与 --with-domain 一起使用" >&2; exit 1
fi
for DOMAIN in "$WEB_DOMAIN" "$ADMIN_DOMAIN"; do
if [ -n "$DOMAIN" ] && ! echo "$DOMAIN" | grep -qE '^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$'; then
  echo "[失败] 域名格式不正确：${DOMAIN}（示例：exam.example.com）" >&2; exit 1
fi

done

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[注意]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[失败]\033[0m %s\n' "$*" >&2; exit 1; }

# 在 .env 中更新（或追加）一个 KEY=VALUE
upsert_env() {
  local key="$1" val="$2"
  if grep -qE "^${key}=" .env; then
    if sed --version >/dev/null 2>&1; then
      sed -i "s|^${key}=.*|${key}=${val}|" .env
    else
      sed -i '' "s|^${key}=.*|${key}=${val}|" .env
    fi
  else
    printf '\n# 部署脚本维护的配置\n%s=%s\n' "$key" "$val" >> .env
  fi
}

# ---------- sudo 处理（root 下直接执行） ----------
if [ "$(id -u)" = "0" ]; then
  SUDO=""
elif command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  SUDO=""
fi

# ---------- 1. Docker 环境 ----------
if ! command -v docker >/dev/null 2>&1; then
  log "未检测到 Docker，尝试安装"
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update -y && $SUDO apt-get install -y docker.io docker-compose-v2 || true
  fi
  if ! command -v docker >/dev/null 2>&1; then
    warn "apt 安装失败，改用 Docker 官方脚本安装（境内服务器较慢可改用：curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun）"
    curl -fsSL https://get.docker.com | $SUDO sh
  fi
  $SUDO systemctl enable --now docker 2>/dev/null || true
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  fail "缺少 Docker Compose 插件，请执行：$SUDO apt-get install -y docker-compose-v2"
fi

if ! docker info >/dev/null 2>&1; then
  warn "当前用户无 docker 权限，以下命令将借助 sudo；也可先执行 $SUDO usermod -aG docker $USER 后重新登录"
fi

# ---------- 2. 初始化 .env ----------
if [ ! -f .env ]; then
  log "生成生产环境配置 .env"
  umask 077
  cp .env.example .env
  SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  if sed --version >/dev/null 2>&1; then
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${SECRET}|" .env
  else
    sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=${SECRET}|" .env
  fi
  ADMIN_SECRET="$(openssl rand -hex 16)"
  upsert_env SEED_ADMIN_PASSWORD "$ADMIN_SECRET"
  warn ".env 已生成，AI API Key（QWEN_API_KEY 等）默认为空，请编辑 .env 填入后重新执行本脚本"
else
  log "已存在 .env，沿用现有配置"
fi

if ! grep -qE '^(QWEN_API_KEY|OPENAI_API_KEY|GEMINI_API_KEY|ZHIPU_API_KEY|AMD_API_KEY)=..+' .env; then
  warn "未检测到任何 AI API Key，试卷识别功能将不可用；请编辑 .env 填入后重新执行本脚本"
fi

# Validate secrets without printing their contents. Existing weak JWT secrets must
# be explicitly rotated by the operator (rotation invalidates existing tokens).
env_value() { sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r'; }
JWT_VALUE="$(env_value JWT_SECRET)"
[ ${#JWT_VALUE} -ge 32 ] && [ "$JWT_VALUE" != errorset-dev-secret-change-me ] || fail "JWT_SECRET 缺失或不安全，请在 .env 设置至少 32 字符的随机密钥"
ADMIN_VALUE="$(env_value SEED_ADMIN_PASSWORD)"
if [ ! -s data/app.db ]; then
  [ ${#ADMIN_VALUE} -ge 12 ] && [ ${#ADMIN_VALUE} -le 72 ] && [ "$ADMIN_VALUE" != 123456 ] || fail "首次部署请设置 SEED_ADMIN_PASSWORD（12–72 字符）"
fi
# Static addresses keep the trust boundary stable across container recreation.
PREFIX="$(env_value PROXY_NETWORK_PREFIX)"
PREFIX="${PREFIX:-172.30.86}"
[[ "$PREFIX" =~ ^([0-9]{1,3}\.){2}[0-9]{1,3}$ ]] || fail "PROXY_NETWORK_PREFIX 格式错误"
IFS=. read -r OCTET1 OCTET2 OCTET3 <<< "$PREFIX"
for OCTET in "$OCTET1" "$OCTET2" "$OCTET3"; do
  [ "$((10#$OCTET))" -le 255 ] || fail "网络地址超出范围"
done
upsert_env TRUSTED_PROXY_CIDRS "[\"${PREFIX}.1/32\",\"${PREFIX}.3/32\",\"${PREFIX}.4/32\"]"
chmod 600 .env

# ---------- 3. 数据目录 ----------
mkdir -p data

# ---------- 3.5 HTTPS 域名模式：容器端口收回回环，80/443 让给宿主 nginx ----------
# 写在 .env（不进 git），update.sh 拉新代码不会与此配置冲突
if [ -n "$WEB_DOMAIN" ]; then
  log "域名模式：容器端口改为回环监听（TLS 由宿主机 nginx 终止）"
  upsert_env WEB_PUBLISH "127.0.0.1:8080:80"
  upsert_env ADMIN_PUBLISH "127.0.0.1:8082:80"
fi

# Upgrade the old malformed/domain-mode mappings on existing installations.
[ "$(env_value WEB_PUBLISH)" != "127.0.0.1:8080" ] || upsert_env WEB_PUBLISH "127.0.0.1:8080:80"
case "$(env_value ADMIN_PUBLISH)" in
  127.0.0.1:8081|127.0.0.1:8081:80) upsert_env ADMIN_PUBLISH "127.0.0.1:8082:80" ;;
esac

# Existing domain deployments are also migrated during update.sh (no domain args).
if [ "$(env_value ADMIN_PUBLISH)" = "127.0.0.1:8082:80" ]; then
  for EXISTING_SITE in /etc/nginx/sites-available/errorset /etc/nginx/conf.d/errorset.conf; do
    if [ -f "$EXISTING_SITE" ] && grep -q 'proxy_pass http://127.0.0.1:8081;' "$EXISTING_SITE"; then
      $SUDO cp "$EXISTING_SITE" "${EXISTING_SITE}.bak.$(date +%Y%m%d-%H%M%S)"
      $SUDO sed -i -e 's|proxy_pass http://127.0.0.1:8081;|proxy_pass http://127.0.0.1:8082;|g' \
        -e 's|proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;|proxy_set_header X-Forwarded-For $remote_addr;|g' "$EXISTING_SITE"
      $SUDO nginx -t
      $SUDO systemctl reload nginx 2>/dev/null || $SUDO nginx -s reload
    fi
  done
fi

# ---------- 4. 构建并启动 ----------
log "构建镜像并启动（首次构建需几分钟）"
$SUDO $COMPOSE config --quiet
$SUDO $COMPOSE build
$SUDO $COMPOSE up -d

# ---------- 5. 等待后端就绪 ----------
log "等待后端就绪……"
READY=0
for _ in $(seq 1 30); do
  if $SUDO docker exec errorset-backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/docs', timeout=3)" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 2
done
if [ "$READY" != "1" ]; then
  warn "后端 60 秒内未就绪，请查看日志排查：$SUDO $COMPOSE logs -f backend"
  exit 1
fi

# ---------- 5.5 HTTPS 域名模式：宿主 nginx 反代 + certbot 签发证书 ----------
DOMAIN_OK=0
if [ -n "$WEB_DOMAIN" ]; then
  log "配置宿主机 nginx 入口与 TLS 证书"
  if ! command -v nginx >/dev/null 2>&1 || ! command -v certbot >/dev/null 2>&1; then
    $SUDO apt-get update -y
    $SUDO apt-get install -y nginx certbot python3-certbot-nginx
  fi

  # certbot --nginx 会直接改写已启用的站点文件，因此本文件只在不存在时渲染一次
  if [ -d /etc/nginx/sites-enabled ]; then
    SITE_DST="/etc/nginx/sites-available/errorset"
    LINK="/etc/nginx/sites-enabled/errorset"
  else
    SITE_DST="/etc/nginx/conf.d/errorset.conf"
    LINK=""
  fi
  if [ -f "$SITE_DST" ]; then
    warn "已存在 ${SITE_DST}，保留证书段并迁移旧管理后台代理端口/转发头"
    $SUDO cp "$SITE_DST" "${SITE_DST}.bak.$(date +%Y%m%d-%H%M%S)"
    $SUDO sed -i -e 's|proxy_pass http://127.0.0.1:8081;|proxy_pass http://127.0.0.1:8082;|g' \
      -e 's|proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;|proxy_set_header X-Forwarded-For $remote_addr;|g' "$SITE_DST"
  else
    sed -e "s/__WEB_DOMAIN__/${WEB_DOMAIN}/g" -e "s/__ADMIN_DOMAIN__/${ADMIN_DOMAIN}/g" \
      deploy/nginx-errorset.conf.template > /tmp/errorset-nginx.conf
    if [ -z "$ADMIN_DOMAIN" ]; then
      sed -i '/^# BEGIN ADMIN/,/^# END ADMIN/d' /tmp/errorset-nginx.conf
    fi
    $SUDO cp /tmp/errorset-nginx.conf "$SITE_DST"
    rm -f /tmp/errorset-nginx.conf
  fi
  if [ -n "$LINK" ] && [ ! -e "$LINK" ]; then
    $SUDO ln -s "$SITE_DST" "$LINK"
  fi
  # 发行版自带默认站点（/var/www/html 占位页）也声明了 80 端口的 default_server，
  # 与我们的 IP 兜底块冲突（nginx -t 报 duplicate default server），移除之
  if [ -n "$LINK" ] && [ -e /etc/nginx/sites-enabled/default ]; then
    $SUDO rm -f /etc/nginx/sites-enabled/default
  fi
  $SUDO nginx -t
  $SUDO systemctl reload nginx 2>/dev/null || $SUDO nginx -s reload

  # 非交互 + 幂等：已有证书不重复签发；邮箱可通过环境变量 CERTBOT_EMAIL 提供
  CERT_ARGS="-d ${WEB_DOMAIN}"
  [ -n "$ADMIN_DOMAIN" ] && CERT_ARGS="${CERT_ARGS} -d ${ADMIN_DOMAIN}"
  if [ -n "${CERTBOT_EMAIL:-}" ]; then
    EMAIL_ARGS="-m ${CERTBOT_EMAIL} --no-eff-email"
  else
    EMAIL_ARGS="--register-unsafely-without-email"
  fi
  if $SUDO certbot --nginx $CERT_ARGS -n --agree-tos --keep-until-expiring --redirect $EMAIL_ARGS; then
    DOMAIN_OK=1
  else
    warn "证书签发失败，当前仍为 HTTP。请检查：① 域名 A 记录已指向本机并已生效 ② 安全组放行 80/443"
    warn "排除后手动重试：$SUDO certbot --nginx $CERT_ARGS --redirect"
  fi
fi

# ---------- 6. 完成 ----------
SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
[ -z "${SERVER_IP}" ] && SERVER_IP="<服务器IP>"
if [ -n "$WEB_DOMAIN" ]; then
  SCHEME="http"; [ "$DOMAIN_OK" = "1" ] && SCHEME="https"
  log "部署完成（域名模式，${SCHEME}）"
  cat <<EOF

  Web 前端    ${SCHEME}://${WEB_DOMAIN}/   （API 同源：${SCHEME}://${WEB_DOMAIN}/api）
  IP 直连     http://${SERVER_IP}/         （无证书走 HTTP，HTTPS 请用域名）
EOF
  if [ -n "$ADMIN_DOMAIN" ]; then
    cat <<EOF
  管理后台    ${SCHEME}://${ADMIN_DOMAIN}/ 或 http://${SERVER_IP}:8081/
EOF
  else
    cat <<EOF
  管理后台    http://${SERVER_IP}:8081/（或重跑本脚本加 --admin-domain 换成域名）
EOF
  fi
  cat <<EOF

  初始管理员  见 .env 的 SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD（仅空库创建）
  数据目录    $(pwd)/data （SQLite + 图片，迁移/备份即拷贝此目录）

  常用命令    $SUDO $COMPOSE logs -f backend   # 看日志
              $SUDO $COMPOSE restart backend   # 重启后端
              bash deploy/backup.sh            # 备份数据

  小程序合法域名配置为 ${SCHEME}://${WEB_DOMAIN}（request/uploadFile/downloadFile 三处都要配）
EOF
else
  log "部署完成"
  cat <<EOF

  Web 前端    http://${SERVER_IP}/
  管理后台    http://${SERVER_IP}:8081/

  初始管理员  见 .env 的 SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD（仅空库创建）
  数据目录    $(pwd)/data （SQLite + 图片，迁移/备份即拷贝此目录）

  常用命令    $SUDO $COMPOSE logs -f backend   # 看日志
              $SUDO $COMPOSE restart backend   # 重启后端
              bash deploy/backup.sh            # 备份数据

  小程序/App 上线前需配置 HTTPS 域名，见 DEPLOY.md「HTTPS 与域名」章节。
EOF
fi
