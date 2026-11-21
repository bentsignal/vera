#!/usr/bin/env bash
# Prints the dev tools secret: what the dev PDSs (dev.vera.chat and every
# isolated backend) ask of the dev sign-in and the bot actions
# (services/backend/dev-tools.ts). Metro puts it in the bundles it serves to
# Vera Dev (scripts/lib/metro.sh), and scripts/backend.sh copies it to
# isolated backends.
#
#   scripts/dev-tools-secret.sh             print it (cached on this Mac)
#   scripts/dev-tools-secret.sh --refresh   fetch it again, after a rotation
#   scripts/dev-tools-secret.sh --rotate    make a new one on the shared dev
#                                           deployment (then re-run
#                                           scripts/sim.sh up / phone.sh up)
#
# The shared dev deployment's DEV_TOOLS_SECRET is the source of truth; the
# cache is ~/.config/vera/dev-tools-secret, readable only by Shawn.
set -euo pipefail

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
SHARED_DEPLOYMENT="perceptive-magpie-29"
CACHE="${VERA_DEV_TOOLS_SECRET_FILE:-$HOME/.config/vera/dev-tools-secret}"

convex() { (cd "$ROOT/services/backend" && npx convex "$@" </dev/null); }

fetch() {
  local secret
  secret="$(convex env get DEV_TOOLS_SECRET --deployment "$SHARED_DEPLOYMENT" 2>/dev/null || true)"
  if [ "${#secret}" -lt 32 ]; then
    echo "the shared dev deployment has no DEV_TOOLS_SECRET; make one with $0 --rotate" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$CACHE")"
  (umask 077 && printf '%s\n' "$secret" >"$CACHE")
}

case "${1:-}" in
  --rotate)
    convex env set DEV_TOOLS_SECRET "$(openssl rand -hex 32)" --deployment "$SHARED_DEPLOYMENT" >/dev/null
    fetch
    echo "rotated; isolated backends pick it up on their next scripts/backend.sh push" >&2
    exit 0
    ;;
  --refresh) fetch ;;
  "") [ -s "$CACHE" ] || fetch ;;
  *)
    echo "usage: $0 [--refresh|--rotate]" >&2
    exit 2
    ;;
esac
cat "$CACHE"
