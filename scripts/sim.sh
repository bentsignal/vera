#!/usr/bin/env bash
# This worktree's own iOS simulator, for verifying changes and capturing PR
# evidence. One simulator and one Metro port per worktree, so agents in
# different worktrees never share a screen.
#
#   scripts/sim.sh up               build or reuse the dev client, boot, start Metro, open the app
#   scripts/sim.sh signin [user]    dev sign-in by deep link (default: this worktree's test user)
#   scripts/sim.sh seed             bot DMs, a group, and a space for the signed-in account
#   scripts/sim.sh open <path>      go to a route, such as `/settings` or `/conversation/<id>`
#   scripts/sim.sh shot <name>      screenshot to .cache/evidence/<name>.png
#   scripts/sim.sh record <name>    start a video to .cache/evidence/<name>.mp4
#   scripts/sim.sh stop             stop the video
#   scripts/sim.sh reload           reload the JavaScript
#   scripts/sim.sh relaunch         restart the app (clears in-memory state)
#   scripts/sim.sh eval "<js>"      evaluate JavaScript in the running app
#   scripts/sim.sh status           simulator, port, Metro, and backend
#   scripts/sim.sh down             stop Metro and delete the simulator
#
# The dev client (a Debug build with no notification extension) is built once
# per native fingerprint and cached in ~/Library/Caches/vera/dev-client, so
# worktrees only rebuild when native code changed. JavaScript, including the
# account domain from `scripts/backend.sh isolate`, comes from this worktree's
# Metro.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
MOBILE="$ROOT/apps/mobile"
STATE_DIR="$ROOT/.cache/sim"
STATE="$STATE_DIR/state"
EVIDENCE="$ROOT/.cache/evidence"
CACHE="$HOME/Library/Caches/vera/dev-client"
BUNDLE_ID="chat.vera.app"
DEVICE_TYPE="com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro"
mkdir -p "$STATE_DIR" "$EVIDENCE" "$CACHE"

slug() {
  basename "$ROOT" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}
hash_of() { printf '%s' "$1" | cksum | cut -d' ' -f1; }

load() {
  UDID="" PORT="" METRO_PID="" RECORD_PID=""
  # shellcheck disable=SC1090
  [ -f "$STATE" ] && . "$STATE"
  return 0
}
save() {
  printf 'UDID=%s\nPORT=%s\nMETRO_PID=%s\nRECORD_PID=%s\n' \
    "$UDID" "$PORT" "$METRO_PID" "$RECORD_PID" >"$STATE"
}

require_up() {
  load
  if [ -z "$UDID" ]; then
    echo "no simulator yet; run scripts/sim.sh up" >&2
    exit 1
  fi
}

fingerprint() {
  (cd "$MOBILE" && env -u VERA_NOTIFICATION_EXTENSION npx expo-updates fingerprint:generate --platform ios </dev/null) |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).hash))'
}

# Builds the dev client for this fingerprint unless a worktree already did.
ensure_client() {
  local hash app lock
  hash="$(fingerprint)"
  app="$CACHE/$hash/Vera.app"
  CLIENT="$app"
  [ -d "$app" ] && return
  lock="$CACHE/$hash.lock"
  until mkdir "$lock" 2>/dev/null; do
    echo "another worktree is building this dev client; waiting"
    sleep 15
    [ -d "$app" ] && return
  done
  trap 'rmdir "$lock" 2>/dev/null || true' EXIT
  echo "building the dev client for fingerprint $hash (native code changed or first run)"
  (
    cd "$MOBILE"
    env -u VERA_NOTIFICATION_EXTENSION npx expo prebuild --platform ios --clean </dev/null
    xcodebuild -workspace ios/Vera.xcworkspace -scheme Vera -configuration Debug \
      -sdk iphonesimulator -derivedDataPath ios/build CODE_SIGN_IDENTITY=- \
      CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=39K6A9FP99 \
      PROVISIONING_PROFILE_SPECIFIER= -quiet build
  )
  mkdir -p "$CACHE/$hash"
  cp -R "$MOBILE/ios/build/Build/Products/Debug-iphonesimulator/Vera.app" "$app"
  rmdir "$lock"
  trap - EXIT
}

latest_runtime() {
  xcrun simctl list runtimes -j | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const ios=JSON.parse(s).runtimes.filter(r=>r.platform==="iOS"&&r.isAvailable);
      console.log(ios.at(-1).identifier);
    })'
}

ensure_device() {
  local name="Vera $(slug)"
  if [ -n "$UDID" ] && xcrun simctl list devices -j | grep -q "\"$UDID\""; then
    :
  else
    UDID="$(xcrun simctl create "$name" "$DEVICE_TYPE" "$(latest_runtime)")"
    echo "created simulator $name ($UDID)"
  fi
  xcrun simctl bootstatus "$UDID" -b >/dev/null
}

port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

ensure_metro() {
  if [ -n "$METRO_PID" ] && kill -0 "$METRO_PID" 2>/dev/null &&
    curl -fsS "http://127.0.0.1:$PORT/status" 2>/dev/null | grep -q running; then
    return
  fi
  PORT=$((8100 + $(hash_of "$ROOT") % 800))
  while port_in_use "$PORT"; do PORT=$((PORT + 1)); done
  (
    cd "$MOBILE"
    nohup npx expo start --dev-client --port "$PORT" </dev/null >"$STATE_DIR/metro.log" 2>&1 &
    echo $! >"$STATE_DIR/metro.pid"
  )
  METRO_PID="$(cat "$STATE_DIR/metro.pid")"
  for _ in $(seq 1 60); do
    curl -fsS "http://127.0.0.1:$PORT/status" 2>/dev/null | grep -q running && return
    sleep 1
  done
  echo "Metro did not start; see $STATE_DIR/metro.log" >&2
  exit 1
}

stop_metro() {
  if [ -n "$METRO_PID" ] && kill -0 "$METRO_PID" 2>/dev/null; then
    # Only the Metro this script started, and its children.
    pkill -TERM -P "$METRO_PID" 2>/dev/null || true
    kill -TERM "$METRO_PID" 2>/dev/null || true
  fi
  METRO_PID=""
}

# Moves the app to a route through the dev-only `veraDev` hook over Metro's
# debugger connection. `simctl openurl` would work too, but iOS asks
# "Open in Vera?" before every link, which scripts cannot answer.
open_path() {
  local path="/${1#/}"
  node "$ROOT/scripts/sim-eval.mjs" "$PORT" \
    "globalThis.veraDev.open($(node -p 'JSON.stringify(process.argv[1])' "$path"))" >/dev/null
  echo "opened $path"
}

launch() {
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" 2>/dev/null || true
  xcrun simctl launch "$UDID" "$BUNDLE_ID" --initialUrl "http://127.0.0.1:$PORT" >/dev/null
  for _ in $(seq 1 90); do
    node "$ROOT/scripts/sim-eval.mjs" "$PORT" "typeof globalThis.veraDev" 2>/dev/null |
      grep -q object && return
    sleep 1
  done
  echo "the app did not finish loading; see $STATE_DIR/metro.log" >&2
  exit 1
}

up() {
  load
  ensure_client
  ensure_device
  xcrun simctl install "$UDID" "$CLIENT"
  # No dev menu tour or floating tools button in screenshots; the dev menu
  # still opens with Cmd-Ctrl-Z or a shake.
  xcrun simctl spawn "$UDID" defaults write "$BUNDLE_ID" EXDevMenuIsOnboardingFinished -bool YES
  xcrun simctl spawn "$UDID" defaults write "$BUNDLE_ID" EXDevMenuShowFloatingActionButton -bool NO
  # A backend switch changes inlined env, so start Metro fresh each time.
  stop_metro
  ensure_metro
  save
  launch
  open -ga Simulator
  status
  echo "watch it in T3 Code: device_open with deviceId $UDID"
}

default_user() { echo "wt$(hash_of "$ROOT" | cut -c1-6)"; }

status() {
  load
  echo "simulator: ${UDID:-none}"
  echo "metro: ${PORT:-none} ($(
    [ -n "$METRO_PID" ] && kill -0 "$METRO_PID" 2>/dev/null && echo running || echo stopped
  ))"
  echo "test user: $(default_user)"
  "$ROOT/scripts/backend.sh" status
}

record() {
  require_up
  local file="$EVIDENCE/$1.mp4"
  xcrun simctl io "$UDID" recordVideo --codec h264 --force "$file" >/dev/null 2>&1 &
  RECORD_PID=$!
  save
  sleep 1
  echo "recording to $file; scripts/sim.sh stop when done"
}

stop() {
  require_up
  if [ -n "$RECORD_PID" ]; then
    kill -INT "$RECORD_PID" 2>/dev/null || true
    while kill -0 "$RECORD_PID" 2>/dev/null; do sleep 0.2; done
  fi
  RECORD_PID=""
  save
  ls -1t "$EVIDENCE"/*.mp4 2>/dev/null | head -1
}

down() {
  load
  [ -n "$RECORD_PID" ] && kill -INT "$RECORD_PID" 2>/dev/null || true
  stop_metro
  if [ -n "$UDID" ]; then
    xcrun simctl shutdown "$UDID" 2>/dev/null || true
    xcrun simctl delete "$UDID" 2>/dev/null || true
  fi
  rm -f "$STATE"
  echo "simulator and Metro stopped"
}

command="${1:-status}"
shift || true
case "$command" in
  up) up ;;
  signin) require_up && open_path "/dev-sign-in?username=${1:-$(default_user)}" ;;
  seed) require_up && open_path "/dev-seed" ;;
  open) require_up && open_path "${1:?path}" ;;
  eval) require_up && node "$ROOT/scripts/sim-eval.mjs" "$PORT" "${1:?expression}" ;;
  relaunch) require_up && launch && echo "relaunched" ;;
  shot)
    require_up
    xcrun simctl io "$UDID" screenshot "$EVIDENCE/${1:?name}.png" >/dev/null
    echo "$EVIDENCE/$1.png"
    ;;
  record) record "${1:?name}" ;;
  stop) stop ;;
  reload) require_up && node "$ROOT/scripts/sim-eval.mjs" "$PORT" "globalThis.veraDev.reload()" ;;
  status) status ;;
  down) down ;;
  *)
    sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
