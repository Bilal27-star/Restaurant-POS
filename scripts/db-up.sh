#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v docker >/dev/null 2>&1; then
  exec docker compose up -d postgres
fi
if command -v podman >/dev/null 2>&1; then
  exec podman compose up -d postgres
fi
echo "Neither docker nor podman was found. Install Docker Desktop (or Podman), or run PostgreSQL on port 5432" >&2
echo "with database pos_dev and credentials matching DATABASE_URL in apps/api/.env." >&2
exit 1
