#!/usr/bin/env bash
set -euo pipefail

NEW_WT="$PWD"
MAIN_REPO="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)")"
if [ -n "$MAIN_REPO" ] && [ "$MAIN_REPO" != "$NEW_WT" ]; then
  cd "$MAIN_REPO"
  for f in $(find . \( -name ".env" -o -name ".env.local" \) -not -path "*/node_modules/*" -not -path "*/.git/*"); do
    rel="${f#./}"
    dest="$NEW_WT/$rel"
    mkdir -p "$(dirname "$dest")"
    cp "$f" "$dest"
    echo "copied $rel"
  done
  cd "$NEW_WT"
fi

ni
pnpm --filter @acme/db run setup

# Create a worktree-specific Convex deployment
WT_NAME="$(basename "$NEW_WT" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/^-*//;s/-*$//')"
PORTLESS_WORKTREE_ID="$(printf '%s\n' "$WT_NAME" | sed -E 's/^.*-([a-f0-9]{8})$/\1/')"

if grep -q '^VITE_WORKTREE_ID=' .env; then
  sed -i '' "s|^VITE_WORKTREE_ID=.*|VITE_WORKTREE_ID=$PORTLESS_WORKTREE_ID|" .env
else
  printf '\nVITE_WORKTREE_ID=%s\n' "$PORTLESS_WORKTREE_ID" >> .env
fi
echo "updated VITE_WORKTREE_ID to $PORTLESS_WORKTREE_ID"

cd "$NEW_WT/packages/db"

# Pull env vars from the main deployment before switching
TEMP_ENV=$(mktemp)
nlx convex env list > "$TEMP_ENV"

nlx convex deployment create "dev/$WT_NAME" --select --expiration "in 7 days" --type dev < /dev/null
nlx convex deployment token create "$WT_NAME" --save-env < /dev/null

# Push env vars to the new deployment
if [ -s "$TEMP_ENV" ]; then
  nlx convex env set --from-file "$TEMP_ENV" < /dev/null
  echo "copied environment variables to new deployment"
fi
rm -f "$TEMP_ENV"

cd "$NEW_WT"

# Propagate all Convex env vars from packages/db/.env.local to root .env
# The apps load server-side vars (CONVEX_DEPLOYMENT, CONVEX_DEPLOY_KEY) from root .env via with-env
update_root_env() {
  local key="$1" val="$2" target_key="${3:-$1}"
  if [ -z "$val" ]; then return; fi
  if grep -q "^${target_key}=" .env; then
    sed -i '' "s|^${target_key}=.*|${target_key}=${val}|" .env
  else
    printf '%s=%s\n' "$target_key" "$val" >> .env
  fi
  echo "updated $target_key"
}

NEW_URL="$(grep '^CONVEX_URL=' packages/db/.env.local | cut -d= -f2-)"
NEW_DEPLOYMENT="$(grep '^CONVEX_DEPLOYMENT=' packages/db/.env.local | cut -d= -f2-)"
NEW_DEPLOY_KEY="$(grep '^CONVEX_DEPLOY_KEY=' packages/db/.env.local | cut -d= -f2-)"

update_root_env CONVEX_URL "$NEW_URL" VITE_CONVEX_URL
update_root_env CONVEX_DEPLOYMENT "$NEW_DEPLOYMENT"
update_root_env CONVEX_DEPLOY_KEY "$NEW_DEPLOY_KEY"

if [ -z "$NEW_URL" ] && [ -z "$NEW_DEPLOYMENT" ]; then
  echo "WARNING: Could not find CONVEX_URL or CONVEX_DEPLOYMENT in packages/db/.env.local" >&2
fi

# Sync products to the new deployment's database
pnpm --filter @acme/db run sync:products
echo "synced products to worktree deployment"
