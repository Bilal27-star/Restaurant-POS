#!/usr/bin/env bash
# Wait until Postgres accepts TCP connections on localhost:5432 (used by `pnpm run db:wait`).
set -euo pipefail
host="${PGHOST:-127.0.0.1}"
port="${PGPORT:-5432}"
max="${1:-90}"
for ((i = 1; i <= max; i++)); do
  if (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1; then
    echo "Postgres is up on $host:$port"
    exit 0
  fi
  sleep 1
done
echo "Timeout waiting for Postgres on $host:$port" >&2
exit 1
