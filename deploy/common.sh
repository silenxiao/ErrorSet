#!/usr/bin/env bash
if [ "$(id -u)" = 0 ]; then SUDO=""; else SUDO="sudo"; fi
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose";
elif command -v docker-compose >/dev/null 2>&1; then COMPOSE="docker-compose";
else echo "缺少 Docker Compose" >&2; exit 1; fi
compose() { $SUDO $COMPOSE "$@"; }
