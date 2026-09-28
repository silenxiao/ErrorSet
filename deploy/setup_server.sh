#!/usr/bin/env bash
# ErrorSet 服务器一键部署/更新脚本（Ubuntu/Debian，其他 Linux 需先自行装好 Docker）
# 用法：把仓库上传到服务器后，在仓库根目录执行  bash deploy/setup_server.sh
# 幂等：重复执行即为"更新部署"（重新构建镜像并滚动重启）

set -euo pipefail

cd "$(dirname "$0")/.."

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[注意]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[失败]\033[0m %s\n' "$*" >&2; exit 1; }

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
  cp .env.example .env
  SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  if sed --version >/dev/null 2>&1; then
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${SECRET}|" .env
  else
    sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=${SECRET}|" .env
  fi
  warn ".env 已生成，AI API Key（QWEN_API_KEY 等）默认为空，请编辑 .env 填入后重新执行本脚本"
else
  log "已存在 .env，沿用现有配置"
fi

if ! grep -qE '^(QWEN_API_KEY|OPENAI_API_KEY|GEMINI_API_KEY|ZHIPU_API_KEY|AMD_API_KEY)=..+' .env; then
  warn "未检测到任何 AI API Key，试卷识别功能将不可用；请编辑 .env 填入后重新执行本脚本"
fi

# ---------- 3. 数据目录 ----------
mkdir -p data

# ---------- 4. 构建并启动 ----------
log "构建镜像并启动（首次构建需几分钟）"
$SUDO $COMPOSE up -d --build

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

# ---------- 6. 完成 ----------
SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
[ -z "${SERVER_IP}" ] && SERVER_IP="<服务器IP>"
log "部署完成"
cat <<EOF

  Web 前端    http://${SERVER_IP}/
  管理后台    http://${SERVER_IP}:8081/

  默认管理员  xiaohui / 123456  —— 登录后请立即修改密码！
  数据目录    $(pwd)/data （SQLite + 图片，迁移/备份即拷贝此目录）

  常用命令    $SUDO $COMPOSE logs -f backend   # 看日志
              $SUDO $COMPOSE restart backend   # 重启后端
              bash deploy/backup.sh            # 备份数据

  小程序/App 上线前需配置 HTTPS 域名，见 DEPLOY.md「HTTPS 与域名」章节。
EOF
