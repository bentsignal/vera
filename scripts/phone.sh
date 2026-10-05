#!/usr/bin/env bash
# Vera Dev on Shawn's phone: the dev client for this worktree's native code,
# loading JavaScript from this worktree's Metro over the Mac's Wi-Fi (the
# phone has to be on the same network). JavaScript changes hot-reload with no build; a native
# build happens only when this fingerprint has no dev client yet.
#
#   scripts/phone.sh [--android] <command>     (iPhone without --android)
#
#   up       build the dev client if needed, start Metro, print the links
#   link     print the links and QR codes again
#   status   the dev client for this fingerprint, Metro, and the Wi-Fi address
#   down     stop serving the phone; Metro stops unless a simulator uses it
#
# Dev clients are EAS `development` builds (ad hoc, with the notification
# extension), built locally once per fingerprint and cached in
# ~/Library/Caches/vera, so every worktree reuses them. Their install pages
# are on bunny.net (scripts/install-page.sh).
# The phone holds one Vera Dev at a time: an internal build (releases)
# replaces the dev client until it is installed again from its link.
set -euo pipefail

PLATFORM=ios
if [ "${1:-}" = "--android" ]; then
  PLATFORM=android
  shift
fi

ROOT="$(git rev-parse --show-toplevel)"
MOBILE="$ROOT/apps/mobile"
STATE_DIR="$ROOT/.cache/sim"
CACHE="$HOME/Library/Caches/vera/phone-dev-client-$PLATFORM"
RELEASE_XCODE="/Applications/Xcode-27.app/Contents/Developer"
SCHEME="vera-dev"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
mkdir -p "$STATE_DIR" "$CACHE"
# shellcheck source=lib/metro.sh
. "$ROOT/scripts/lib/metro.sh"

# The runtime the `development` profile builds (eas.json sets the dev
# variant, already exported, and the notification extension).
fingerprint() {
  (cd "$MOBILE" && VERA_NOTIFICATION_EXTENSION=1 pnpm exec expo-updates fingerprint:generate --platform "$PLATFORM" </dev/null 2>/dev/null) |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).hash))'
}

# The Mac's address on the local network: the default route's interface,
# else Wi-Fi. A plain private IP, because iOS's App Transport Security
# allows plain HTTP to local network addresses (NSAllowsLocalNetworking) but
# blocks it to tailnet (100.x) ones.
address() {
  local iface ip
  iface="$(route -n get default 2>/dev/null | awk '/interface:/ { print $2 }')"
  ip="$(ipconfig getifaddr "${iface:-en0}" 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || true)"
  if [ -z "$ip" ]; then
    echo "this Mac has no local network address; connect it to the phone's Wi-Fi" >&2
    exit 1
  fi
  echo "$ip"
}

build_ios() {
  # The App Store Connect key signs without an Apple ID (README "Apple
  # credentials"); release Xcode matches the internal and store builds.
  set -a
  # shellcheck disable=SC1091
  . "$HOME/.appstoreconnect/vera.env"
  set +a
  (
    cd "$MOBILE"
    if [ -d "$RELEASE_XCODE" ]; then export DEVELOPER_DIR="$RELEASE_XCODE"; fi
    PATH="/opt/homebrew/bin:$PATH" eas build -p ios --profile development --local \
      --non-interactive --output "$1" </dev/null
  )
}

build_android() {
  (cd "$MOBILE" && JAVA_HOME="$(/usr/libexec/java_home -v 17)" \
    eas build -p android --profile development --local --non-interactive --output "$1" </dev/null)
}

# Sets CLIENT_DIR to this fingerprint's dev client, building it unless a
# worktree already did. Sets BUILT when this run made it.
ensure_client() {
  local hash lock artifact
  hash="$(fingerprint)"
  CLIENT_DIR="$CACHE/$hash"
  BUILT=""
  if [ -f "$CLIENT_DIR/install-url" ]; then
    # Install pages over 30 days old are deleted (scripts/install-page.sh);
    # upload the cached build again if this one's is gone.
    if ! curl -fsSI "$(cat "$CLIENT_DIR/install-url")" >/dev/null 2>&1; then
      echo "the install page expired; uploading the cached dev client again"
      "$ROOT/scripts/install-page.sh" "$CLIENT_DIR/vera-dev.$([ "$PLATFORM" = ios ] && echo ipa || echo apk)" \
        "dev-client/$PLATFORM/$hash" "Dev client for native fingerprint ${hash:0:12}." >"$CLIENT_DIR/install-url"
    fi
    return
  fi
  lock="$CLIENT_DIR.lock"
  until mkdir "$lock" 2>/dev/null; do
    echo "another worktree is building this dev client; waiting"
    sleep 15
    [ -f "$CLIENT_DIR/install-url" ] && return
  done
  trap 'rmdir "$lock" 2>/dev/null || true' EXIT
  mkdir -p "$CLIENT_DIR.partial"
  artifact="$CLIENT_DIR.partial/vera-dev.$([ "$PLATFORM" = ios ] && echo ipa || echo apk)"
  # EAS writes the artifact only when the build succeeds, so one left by a
  # failed upload is complete.
  if [ ! -f "$artifact" ]; then
    echo "building the $PLATFORM dev client for fingerprint $hash (native code changed, or the first one); about 15 minutes"
    "build_$PLATFORM" "$artifact"
  fi
  "$ROOT/scripts/install-page.sh" "$artifact" "dev-client/$PLATFORM/$hash" \
    "Dev client for native fingerprint ${hash:0:12}." >"$CLIENT_DIR.partial/install-url"
  git -C "$ROOT" rev-parse HEAD >"$CLIENT_DIR.partial/commit"
  rm -rf "$CLIENT_DIR"
  mv "$CLIENT_DIR.partial" "$CLIENT_DIR"
  rmdir "$lock"
  trap - EXIT
  BUILT=1
}

open_url() {
  echo "$SCHEME://expo-development-client/?url=$(node -p 'encodeURIComponent(process.argv[1])' "http://$(address):$PORT")"
}

links() {
  load_metro
  local install open
  install="$(cat "$CLIENT_DIR/install-url")"
  open="$(open_url)"
  "$ROOT/scripts/qr.sh" "$install" "$STATE_DIR/phone-$PLATFORM-install.png" >/dev/null
  "$ROOT/scripts/qr.sh" "$open" "$STATE_DIR/phone-$PLATFORM-open.png" >/dev/null
  echo "install:  $install"
  echo "          $STATE_DIR/phone-$PLATFORM-install.png"
  echo "open:     $open"
  echo "          $STATE_DIR/phone-$PLATFORM-open.png"
}

up() {
  address >/dev/null
  ensure_client
  ensure_metro
  printf 'PLATFORM=%s\n' "$PLATFORM" >"$STATE_DIR/phone-$PLATFORM"
  if [ -n "$BUILT" ]; then
    echo "new dev client: Shawn installs it from the install link first"
  else
    echo "dev client for this fingerprint already exists: if Vera Dev on the phone is that dev client, only the open link is needed; otherwise (an internal build, or an older dev client) install it first"
  fi
  links
}

status() {
  local hash
  hash="$(fingerprint)"
  CLIENT_DIR="$CACHE/$hash"
  echo "fingerprint: $hash"
  if [ -f "$CLIENT_DIR/install-url" ]; then
    echo "dev client: $(cat "$CLIENT_DIR/install-url") (built from $(cut -c1-9 "$CLIENT_DIR/commit"))"
  else
    echo "dev client: none for this fingerprint; up builds one"
  fi
  load_metro
  echo "metro: ${PORT:-none} ($(metro_running && echo running || echo stopped))"
  echo "serving the phone: $([ -f "$STATE_DIR/phone-$PLATFORM" ] && echo yes || echo no)"
  echo "Wi-Fi address: $(address) (the phone must be on the same network)"
  "$ROOT/scripts/backend.sh" status
}

down() {
  rm -f "$STATE_DIR/phone-$PLATFORM"
  echo "stopped serving the $PLATFORM phone"
  release_metro
}

command="${1:-status}"
shift || true
case "$command" in
  up) up ;;
  link)
    CLIENT_DIR="$CACHE/$(fingerprint)"
    [ -f "$CLIENT_DIR/install-url" ] || {
      echo "no dev client for this fingerprint; run scripts/phone.sh up" >&2
      exit 1
    }
    load_metro
    metro_running || {
      echo "Metro is not running; run scripts/phone.sh up" >&2
      exit 1
    }
    links
    ;;
  status) status ;;
  down) down ;;
  *)
    sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
