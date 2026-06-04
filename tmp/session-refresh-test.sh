#!/bin/bash
# Verifies access-token refresh after simulated expiry (cookie session required).
set -euo pipefail
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

ORIGIN="${POS_API_ORIGIN:-http://127.0.0.1:4000}"
LOGIN=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "$ORIGIN/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin","restaurantSlug":"default"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['accessToken'])")
EXPIRES=$(echo "$LOGIN" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['expiresIn'])")
echo "login ok expiresIn=${EXPIRES}s"

# Expired access token should 401
FAKE="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ4IiwicmlkIjoieCIsInJvbGVzIjpbXSwicGVybWlzc2lvbnMiOltdLCJzaWQiOiJ4IiwidHlwIjoiYWNjZXNzIiwiaWF0IjoxLCJleHAiOjJ9.invalid"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" \
  -H "Authorization: Bearer $FAKE" "$ORIGIN/api/v1/tables/layout")
echo "layout with bad token: HTTP $STATUS (expect 401)"

REFRESH=$(curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" -X POST "$ORIGIN/api/v1/auth/refresh" \
  -H "Content-Type: application/json" -d '{}')
NEW=$(echo "$REFRESH" | python3 -c "import json,sys; d=json.load(sys.stdin); print('ok' if d.get('success') else 'fail', d['data']['accessToken'][:20])")
echo "refresh: $NEW"

STATUS2=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" \
  -H "Authorization: Bearer $(echo "$REFRESH" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['accessToken'])")" \
  "$ORIGIN/api/v1/tables/layout")
echo "layout after refresh: HTTP $STATUS2 (expect 200)"
