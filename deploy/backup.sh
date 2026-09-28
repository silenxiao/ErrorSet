#!/usr/bin/env bash
# ErrorSet 数据备份脚本：打包 data/（SQLite + 图片）与 .env 到 backups/
# 用法：bash deploy/backup.sh   （建议在服务器上低峰期执行）
# 注意：包内含 .env 密钥与用户数据，请妥善保管备份文件

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d data ]; then
  echo "[失败] 未找到 data 目录，请在仓库根目录执行" >&2
  exit 1
fi

mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/errorset-${STAMP}.tar.gz"

tar czf "$OUT" data .env

# 只保留最近 10 份
ls -1t backups/errorset-*.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm -f

echo "已备份到 ${OUT}"
echo "恢复方法：解包覆盖 data/ 与 .env 后执行 docker compose up -d"
echo "（提示：后端运行时直接拷贝 SQLite 存在极小的不一致风险，重要备份可先 docker compose stop backend 再执行本脚本）"
