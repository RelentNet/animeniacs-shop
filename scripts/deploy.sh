#!/usr/bin/env bash
# Canonical deploy path for animeniacs-shop.
# Pushes main, then forces a Coolify deploy (the GitHub push webhook is not
# reliably wired, and force defeats Coolify's stale-build-cache problem).
#
# Reads COOLIFY_API_TOKEN_ANIMANIACS_TEAM from .env.local. No secret is
# stored in this file.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"
COOLIFY_BASE="https://empower.relentnet.com"
APP_UUID="h4400cg04wg8www84ggks4sg"
APP_FQDN="dev.animeniacs.shop"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: .env.local not found at $ENV_FILE" >&2
  exit 1
fi

# Extract the token without sourcing the whole env file.
TOKEN="$(grep -E '^COOLIFY_API_TOKEN_ANIMANIACS_TEAM=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
TOKEN="${TOKEN%\"}"; TOKEN="${TOKEN#\"}"
if [[ -z "${TOKEN:-}" ]]; then
  echo "error: COOLIFY_API_TOKEN_ANIMANIACS_TEAM missing from .env.local" >&2
  exit 1
fi

# CRON_SECRET authorizes the post-deploy revalidate ping (warms the ISR pages
# so they don't serve an empty shell for ~5 min after deploy). Non-fatal if absent.
CRON_SECRET_VAL="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
CRON_SECRET_VAL="${CRON_SECRET_VAL%\"}"; CRON_SECRET_VAL="${CRON_SECRET_VAL#\"}"

echo "==> Pushing main…"
git push origin main

echo "==> Waiting for Coolify to register the push…"
sleep 5

echo "==> Forcing deploy…"
DEPLOY_RESP="$(curl -fsS "$COOLIFY_BASE/api/v1/deploy?uuid=$APP_UUID&force=true" \
  -H "Authorization: Bearer $TOKEN")"
echo "$DEPLOY_RESP"
DEPLOY_UUID="$(printf '%s' "$DEPLOY_RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['deployments'][0]['deployment_uuid'])" 2>/dev/null || true)"
if [[ -z "${DEPLOY_UUID:-}" ]]; then
  echo "==> Deploy queued (could not parse deployment uuid; skipping auto-revalidate)."
  exit 0
fi

echo "==> Deploy queued ($DEPLOY_UUID). Waiting for it to finish…"
STATUS=""
for _ in $(seq 1 80); do
  sleep 15
  STATUS="$(curl -fsS "$COOLIFY_BASE/api/v1/deployments/$DEPLOY_UUID" \
    -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo '')"
  if [[ "$STATUS" != "in_progress" && "$STATUS" != "queued" ]]; then break; fi
done
echo "==> Deploy status: ${STATUS:-unknown}"

if [[ "$STATUS" != "finished" ]]; then
  echo "==> Not finished cleanly — skipping revalidate." >&2
  exit 1
fi

if [[ -n "${CRON_SECRET_VAL:-}" ]]; then
  echo "==> Warming ISR pages (POST /api/revalidate)…"
  curl -fsS -X POST "https://$APP_FQDN/api/revalidate" -H "x-cron-secret: $CRON_SECRET_VAL" || \
    echo "==> revalidate ping failed (non-fatal)."
  echo
else
  echo "==> CRON_SECRET not in .env.local — skipping revalidate warm."
fi
echo "==> Done."
