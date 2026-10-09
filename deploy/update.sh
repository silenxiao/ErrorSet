#!/usr/bin/env bash
# ErrorSet 一键安全更新脚本：备份 → 拉新代码 → 重建部署
# 用法：在服务器仓库根目录执行  bash deploy/update.sh
# 数据安全：所有持久化数据在宿主机 ./data/（bind mount），重建镜像/重启容器不触碰；
#          本脚本在更新前自动备份一份，若新版本迁移逻辑异常可用备份回滚。

set -euo pipefail

cd "$(dirname "$0")/.."

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m[失败]\033[0m %s\n' "$*" >&2; exit 1; }

if [ "$(id -u)" = "0" ]; then
  SUDO=""
elif command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  SUDO=""
fi

[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "有已跟踪文件的本地改动，请先处理"
git rev-parse --verify '@{u}' >/dev/null 2>&1 || fail "没有配置上游分支"

# ---------- 1. 更新前备份（失败则中止，不带风险更新） ----------
log "第 1 步：备份当前数据（data/ + .env）"
bash deploy/backup.sh

# ---------- 2. 拉取新代码 ----------
log "第 2 步：拉取最新代码"
if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  git pull --ff-only || fail "git pull 失败（如有本地改动请先处理），已中止更新，数据未受影响"
else
  fail "当前仓库没有配置上游分支（git remote / upstream），无法自动拉取；请手动更新代码后重试"
fi

# ---------- 3. 重建容器（短暂停机）（setup_server.sh 幂等，不覆盖 .env、不触碰 data/） ----------
log "第 3 步：重新构建镜像并重建容器"
if ! bash deploy/setup_server.sh; then
  LATEST="$(ls -1t backups/errorset-*.tar.gz 2>/dev/null | head -n 1 || true)"
  cat >&2 <<EOF

[失败] 更新部署未通过健康检查，服务可能处于异常状态。
回滚方法（数据回到更新前状态）：
  bash deploy/rollback.sh ${LATEST:-<备份路径>}
排查日志：$SUDO docker compose logs -f backend
EOF
  exit 1
fi

log "更新完成：代码已升级，数据保持不变（更新前备份保留在 backups/）"
