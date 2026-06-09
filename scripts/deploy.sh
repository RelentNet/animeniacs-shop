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

echo "==> Pushing main…"
git push origin main

echo "==> Waiting for Coolify to register the push…"
sleep 5

echo "==> Forcing deploy…"
curl -fsS "$COOLIFY_BASE/api/v1/deploy?uuid=$APP_UUID&force=true" \
  -H "Authorization: Bearer $TOKEN"
echo
echo "==> Deploy queued."
