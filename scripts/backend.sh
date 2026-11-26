#!/usr/bin/env bash
# Which Convex backend this worktree's app and functions use.
#
#   scripts/backend.sh status     the deployment, account domain, and sign-in links
#   scripts/backend.sh isolate    give this worktree its own dev deployment
#   scripts/backend.sh push       push Convex functions to it again
#   scripts/backend.sh teardown   delete it and go back to the shared dev PDS
#
# An isolated backend is a named Convex dev deployment (`dev/<branch>`) with
# the shared dev deployment's settings, its own account domain
# `<branch>.dev.vera.chat`, and a real `_pds` DNS record (Vercel DNS) for that
# domain, so the app and other PDSs discover it like any other. The app finds
# the domain in `apps/mobile/.env.local`. Deployments expire after 14 days.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
BACKEND="$ROOT/services/backend"
MOBILE_ENV="$ROOT/apps/mobile/.env.local"
STATE="$BACKEND/.isolated-backend"
SHARED_DOMAIN="dev.vera.chat"
EXPIRATION="in 14 days"
# Settings an isolated backend keeps in step with the shared dev deployment.
DEV_SETTINGS=(
  DEV_TOOLS_SECRET
  BUNNY_CDN_URL BUNNY_S3_ENDPOINT BUNNY_S3_REGION BUNNY_S3_SECRET BUNNY_STORAGE_ZONE
  GITHUB_REPOSITORY GITHUB_TOKEN
  PARALLEL_API_KEY
)

slug() {
  git -C "$ROOT" branch --show-current | sed 's|^t3code/||' |
    tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' |
    cut -c1-40 | sed -E 's/-+$//'
}

convex() { (cd "$BACKEND" && npx convex "$@" </dev/null); }

env_value() { grep -E "^$1=" "$2" | tail -1 | cut -d= -f2- | sed -E 's/[[:space:]]*#.*$//'; }

dns_record_id() {
  vercel dns ls vera.chat 2>/dev/null |
    awk -v name="$1" '$2 == name && $3 == "TXT" { print $1 }'
}

wait_for_discovery() {
  local domain="$1" want="$2"
  for _ in $(seq 1 30); do
    if curl -fsS "https://dns.google/resolve?name=_pds.$domain&type=TXT" |
      grep -q "$want"; then
      return 0
    fi
    sleep 4
  done
  echo "warning: _pds.$domain did not resolve yet; discovery may fail for a minute" >&2
}

status() {
  if [ -f "$STATE" ]; then
    # shellcheck disable=SC1090
    . "$STATE"
    echo "isolated: dev/$SLUG ($DEPLOYMENT), accounts @$DOMAIN"
    echo "site: $SITE_URL"
    # One throwaway account per phone, so Shawn can test on both without
    # saving a passkey. He pastes each link into that phone's browser, and
    # the page opens Vera Dev's dev sign-in (convex/devSignInPage.ts).
    echo "iPhone sign-in (ios@$DOMAIN): $SITE_URL/dev/sign-in?username=ios"
    echo "Android sign-in (android@$DOMAIN): $SITE_URL/dev/sign-in?username=android"
  else
    echo "shared: $(env_value CONVEX_DEPLOYMENT "$BACKEND/.env.local"), accounts @$SHARED_DOMAIN"
  fi
}

isolate() {
  if [ -f "$STATE" ]; then
    echo "already isolated; pushing functions"
    push
    status
    return
  fi
  local name domain settings
  name="$(slug)"
  if [ -z "$name" ] || [ "$name" = main ]; then
    echo "isolate needs a feature branch" >&2
    exit 1
  fi
  domain="$name.dev.vera.chat"
  settings="$(mktemp)"
  chmod 600 "$settings"
  trap 'rm -f "$settings"' RETURN

  # Copy the shared dev deployment's settings before switching away from it.
  convex env list >"$settings"
  convex deployment create "dev/$name" --type dev --select --expiration "$EXPIRATION"

  {
    grep -vE '^(FEDERATION_DOMAIN|SITE_URL|BUNNY_PATH_PREFIX|DEV_TOOLS)=' "$settings"
    echo "FEDERATION_DOMAIN=$domain"
    echo "SITE_URL=https://$domain"
    echo "BUNNY_PATH_PREFIX=dev/$name"
    echo "DEV_TOOLS=true"
  } >"$settings.new"
  mv "$settings.new" "$settings"
  convex env set --from-file "$settings"
  convex dev --once

  local deployment site manifest
  deployment="$(env_value CONVEX_DEPLOYMENT "$BACKEND/.env.local")"
  deployment="${deployment#*:}"
  site="$(env_value CONVEX_SITE_URL "$BACKEND/.env.local")"
  manifest="$site/.well-known/decentralized-convex"
  curl -fsS "$manifest" | grep -q "\"accountDomain\":\"$domain\"" || {
    echo "the new deployment's manifest does not list $domain" >&2
    exit 1
  }
  vercel dns add vera.chat "_pds.$name.dev" TXT "v=pds1;url=$manifest" >/dev/null

  printf 'EXPO_PUBLIC_VERA_DOMAIN=%s\n' "$domain" >"$MOBILE_ENV"
  printf 'SLUG=%s\nDEPLOYMENT=%s\nDOMAIN=%s\nSITE_URL=%s\n' \
    "$name" "$deployment" "$domain" "$site" >"$STATE"
  wait_for_discovery "$domain" "$deployment"
  status
  echo "restart Metro (scripts/sim.sh up) so the app picks up @$domain"
}

main_checkout() {
  dirname "$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)"
}

shared_deployment() {
  local deployment
  deployment="$(env_value CONVEX_DEPLOYMENT "$(main_checkout)/services/backend/.env.local")"
  echo "${deployment#*:}"
}

# Copies DEV_SETTINGS from the shared dev deployment to this isolated one:
# sets what differs, removes what the shared one no longer has.
sync_dev_settings() {
  local shared mine changes name want have
  shared="$(mktemp)" mine="$(mktemp)" changes="$(mktemp)"
  chmod 600 "$shared" "$mine" "$changes"
  convex env list --deployment "$(shared_deployment)" >"$shared"
  convex env list >"$mine"
  for name in "${DEV_SETTINGS[@]}"; do
    want="$(grep -E "^$name=" "$shared" | tail -1 | cut -d= -f2- || true)"
    have="$(grep -E "^$name=" "$mine" | tail -1 | cut -d= -f2- || true)"
    [ "$want" = "$have" ] && continue
    if [ -z "$want" ]; then
      convex env remove "$name" >/dev/null
      echo "removed $name (the shared dev deployment has none)"
    else
      printf '%s=%s\n' "$name" "$want" >>"$changes"
      echo "updated $name from the shared dev deployment"
    fi
  done
  if [ -s "$changes" ]; then convex env set --from-file "$changes" --force >/dev/null; fi
  rm -f "$shared" "$mine" "$changes"
}

push() {
  if [ -f "$STATE" ]; then sync_dev_settings; fi
  convex dev --once
}

teardown() {
  if [ ! -f "$STATE" ]; then
    echo "not isolated"
    return
  fi
  # shellcheck disable=SC1090
  . "$STATE"
  local record
  record="$(dns_record_id "_pds.$SLUG.dev")"
  if [ -n "$record" ]; then
    vercel dns rm "$record" --yes >/dev/null
  fi
  local token
  token="$(node -p 'require(process.env.HOME + "/.convex/config.json").accessToken')"
  curl -fsS -X POST -H "Authorization: Bearer $token" \
    "https://api.convex.dev/v1/deployments/$DEPLOYMENT/delete" >/dev/null ||
    echo "warning: could not delete $DEPLOYMENT; it expires on its own" >&2

  cp "$(main_checkout)/services/backend/.env.local" "$BACKEND/.env.local"
  rm -f "$STATE" "$MOBILE_ENV"
  status
  # Vera Dev keeps one account list for every worktree, so an account on
  # this domain left on Shawn's phone now points at nothing.
  echo "accounts @$DOMAIN no longer exist: if Shawn still has one in Vera Dev, he removes it (Settings > Accounts)" >&2
}

case "${1:-status}" in
  status) status ;;
  isolate) isolate ;;
  push) push ;;
  teardown) teardown ;;
  *)
    echo "usage: scripts/backend.sh status|isolate|push|teardown" >&2
    exit 2
    ;;
esac
