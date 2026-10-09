#!/usr/bin/env bash
# Stop all backend writers for a consistent SQLite/WAL and image snapshot.
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/common.sh
[ -d data ] && [ -f .env ] || { echo "缺少 data/ 或 .env" >&2; exit 1; }
umask 077
mkdir -p backups
STAGE="$(mktemp -d)"
OUT="backups/errorset-$(date +%Y%m%d-%H%M%S)-$$.tar.gz"
RESTART=0
COMPLETE=0
cleanup() {
  local result=$?
  trap - EXIT
  rm -rf "$STAGE"
  if [ "$RESTART" = 1 ]; then compose start backend || result=1; fi
  [ "$COMPLETE" = 1 ] || rm -f "$OUT"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
RUNNING="$(compose ps --status running -q backend)"
if [ -n "$RUNNING" ]; then
  RESTART=1
  compose stop backend
fi
git rev-parse HEAD > "$STAGE/deployment-revision.txt"
$SUDO tar czf - data .env -C "$STAGE" deployment-revision.txt > "$OUT"
tar tzf "$OUT" >/dev/null
COMPLETE=1
ls -1t backups/errorset-*.tar.gz | tail -n +11 | xargs -r rm -f
echo "已备份到 $OUT（数据、配置、Git 版本；退出时恢复后端原运行状态）"
