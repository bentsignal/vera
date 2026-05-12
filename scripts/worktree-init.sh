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

# Derive the new deployment URL from CONVEX_DEPLOYMENT
# --select reliably updates CONVEX_DEPLOYMENT but CONVEX_URL may stay stale
# Strip trailing comments/metadata (e.g. "dev:slug # team: X, project: Y")
NEW_DEPLOYMENT="$(grep '^CONVEX_DEPLOYMENT=' packages/db/.env.local | cut -d= -f2- | awk '{print $1}')"
SLUG="${NEW_DEPLOYMENT#*:}"
NEW_URL="https://${SLUG}.convex.cloud"
sed -i '' "s|^CONVEX_DEPLOYMENT=.*|CONVEX_DEPLOYMENT=$NEW_DEPLOYMENT|" .env
sed -i '' "s|^VITE_CONVEX_URL=.*|VITE_CONVEX_URL=$NEW_URL|" .env
echo "updated CONVEX_DEPLOYMENT to $NEW_DEPLOYMENT"
echo "updated VITE_CONVEX_URL to $NEW_URL"

# Push schema and functions to the new deployment, then sync products
pnpm --filter @acme/db run setup
pnpm --filter @acme/db run sync:products
echo "synced products to worktree deployment"
