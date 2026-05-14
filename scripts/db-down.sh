#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v docker >/dev/null 2>&1; then
  exec docker compose down
fi
if command -v podman >/dev/null 2>&1; then
  exec podman compose down
fi
echo "No docker/podman; nothing to stop." >&2
exit 0
