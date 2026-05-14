#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v docker >/dev/null 2>&1; then
  docker compose down -v
elif command -v podman >/dev/null 2>&1; then
  podman compose down -v
else
  echo "docker/podman not found; skipping compose down -v (remove volumes manually if needed)." >&2
fi
exec bash scripts/db-up.sh
