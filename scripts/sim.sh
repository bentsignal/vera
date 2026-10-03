#!/usr/bin/env bash
# This worktree's own iOS simulator and Android emulator, for verifying
# changes and capturing PR evidence. One device per platform and one Metro
# port per worktree, so agents in different worktrees never share a screen.
#
#   scripts/sim.sh [--android] <command>     (iOS without --android)
#
#   up               build or reuse the dev client, boot, start Metro, open the app
#   signin [user]    dev sign-in (default: this worktree's test user)
#   seed             bot DMs, a group, and a space for the signed-in account
#   open <path>      go to a route, such as `/settings` or `/conversation/<id>`
#   shot <name>      screenshot to .cache/evidence/<name>.png
#   record <name>    start a video to .cache/evidence/<name>.mp4
#   stop             stop the video
#   reload           reload the JavaScript
#   relaunch         restart the app (clears in-memory state)
#   eval "<js>"      evaluate JavaScript in the running app
#   status           devices, port, Metro, and backend
#   down             delete this platform's device; stops Metro when no device is left
#
# Each dev client (a Debug build with no notification extension) is built
# once per native fingerprint and cached in ~/Library/Caches/vera, so
# worktrees only rebuild when native code changed. JavaScript, including the
# account domain from `scripts/backend.sh isolate`, comes from this worktree's
# Metro, which both platforms share.
set -euo pipefail

PLATFORM=ios
if [ "${1:-}" = "--android" ]; then
  PLATFORM=android
  shift
fi

ROOT="$(git rev-parse --show-toplevel)"
MOBILE="$ROOT/apps/mobile"
STATE_DIR="$ROOT/.cache/sim"
EVIDENCE="$ROOT/.cache/evidence"
CACHE="$HOME/Library/Caches/vera"
BUNDLE_ID="chat.vera.app"
IOS_DEVICE_TYPE="com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro"
ANDROID_BASE_AVD="Pixel_9"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ADB="$ANDROID_HOME/platform-tools/adb"
mkdir -p "$STATE_DIR" "$EVIDENCE" "$CACHE"

slug() {
  basename "$ROOT" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}
hash_of() { printf '%s' "$1" | cksum | cut -d' ' -f1; }

# State: Metro is shared; each platform keeps its own device.
load() {
  PORT="" METRO_PID="" DEVICE="" SERIAL="" EMULATOR_PID="" RECORD_PID=""
  # shellcheck disable=SC1091
  [ -f "$STATE_DIR/metro" ] && . "$STATE_DIR/metro"
  # shellcheck disable=SC1090
  [ -f "$STATE_DIR/$PLATFORM" ] && . "$STATE_DIR/$PLATFORM"
  return 0
}
save() {
  printf 'PORT=%s\nMETRO_PID=%s\n' "$PORT" "$METRO_PID" >"$STATE_DIR/metro"
  printf 'DEVICE=%s\nSERIAL=%s\nEMULATOR_PID=%s\nRECORD_PID=%s\n' \
    "$DEVICE" "$SERIAL" "$EMULATOR_PID" "$RECORD_PID" >"$STATE_DIR/$PLATFORM"
}

require_up() {
  load
  if [ -z "$DEVICE" ]; then
    echo "no $PLATFORM device yet; run scripts/sim.sh$([ "$PLATFORM" = android ] && echo " --android") up" >&2
    exit 1
  fi
}

adb_device() { "$ADB" -s "$SERIAL" "$@"; }

fingerprint() {
  (cd "$MOBILE" && env -u VERA_NOTIFICATION_EXTENSION pnpm exec expo-updates fingerprint:generate --platform "$PLATFORM" </dev/null 2>/dev/null) |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).hash))'
}

build_ios_client() {
  env -u VERA_NOTIFICATION_EXTENSION npx expo prebuild --platform ios --clean </dev/null
  xcodebuild -workspace ios/Vera.xcworkspace -scheme Vera -configuration Debug \
    -sdk iphonesimulator -derivedDataPath ios/build CODE_SIGN_IDENTITY=- \
    CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=39K6A9FP99 \
    PROVISIONING_PROFILE_SPECIFIER= -quiet build
  cp -R ios/build/Build/Products/Debug-iphonesimulator/Vera.app "$1"
}

build_android_client() {
  env -u VERA_NOTIFICATION_EXTENSION npx expo prebuild --platform android --clean </dev/null
  (
    cd android
    JAVA_HOME="$(/usr/libexec/java_home -v 17)" ./gradlew assembleDebug --console=plain -q
  )
  cp android/app/build/outputs/apk/debug/app-debug.apk "$1"
}

# Builds the dev client for this fingerprint unless a worktree already did.
ensure_client() {
  local hash dir lock artifact
  hash="$(fingerprint)"
  dir="$CACHE/dev-client-$PLATFORM/$hash"
  artifact="$dir/$([ "$PLATFORM" = ios ] && echo Vera.app || echo app-debug.apk)"
  CLIENT="$artifact"
  [ -e "$artifact" ] && return
  mkdir -p "$(dirname "$dir")"
  lock="$dir.lock"
  until mkdir "$lock" 2>/dev/null; do
    echo "another worktree is building this dev client; waiting"
    sleep 15
    [ -e "$artifact" ] && return
  done
  trap 'rmdir "$lock" 2>/dev/null || true' EXIT
  echo "building the $PLATFORM dev client for fingerprint $hash (native code changed or first run)"
  mkdir -p "$dir.partial"
  (cd "$MOBILE" && "build_${PLATFORM}_client" "$dir.partial/$(basename "$artifact")")
  mv "$dir.partial" "$dir"
  rmdir "$lock"
  trap - EXIT
}

latest_ios_runtime() {
  xcrun simctl list runtimes -j | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const ios=JSON.parse(s).runtimes.filter(r=>r.platform==="iOS"&&r.isAvailable);
      console.log(ios.at(-1).identifier);
    })'
}

ensure_ios_device() {
  if [ -z "$DEVICE" ] || ! xcrun simctl list devices -j | grep -q "\"$DEVICE\""; then
    DEVICE="$(xcrun simctl create "Vera $(slug)" "$IOS_DEVICE_TYPE" "$(latest_ios_runtime)")"
    echo "created simulator Vera $(slug) ($DEVICE)"
  fi
  xcrun simctl bootstatus "$DEVICE" -b >/dev/null
}

# A throwaway AVD per worktree, cloned from the base Pixel AVD's system image
# and hardware profile. `down` deletes it.
ensure_android_device() {
  local avd_home="$HOME/.android/avd" base_ini name
  name="Vera_$(slug | tr '-' '_')"
  DEVICE="$name"
  if [ ! -d "$avd_home/$name.avd" ]; then
    base_ini="$avd_home/$ANDROID_BASE_AVD.avd/config.ini"
    local image device
    image="$(grep '^image.sysdir.1' "$base_ini" | cut -d= -f2 | tr -d ' ' | sed 's#/$##' | tr '/' ';')"
    device="$(grep '^hw.device.name' "$base_ini" | cut -d= -f2 | tr -d ' ')"
    echo no | "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" -s create avd \
      -n "$name" -k "$image" -d "$device" >/dev/null
    echo "created emulator $name"
  fi
  if [ -n "$SERIAL" ] && adb_device get-state >/dev/null 2>&1; then
    return
  fi
  local console=$((5560 + 2 * ($(hash_of "$ROOT") % 50)))
  while "$ADB" devices | grep -q "emulator-$console"; do console=$((console + 2)); done
  SERIAL="emulator-$console"
  nohup "$ANDROID_HOME/emulator/emulator" -avd "$name" -port "$console" \
    -no-window -no-snapshot -no-boot-anim -no-audio </dev/null \
    >"$STATE_DIR/emulator.log" 2>&1 &
  EMULATOR_PID=$!
  "$ADB" -s "$SERIAL" wait-for-device
  until [ "$(adb_device shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do
    sleep 2
  done
}

install_client() {
  if [ "$PLATFORM" = ios ]; then
    xcrun simctl install "$DEVICE" "$CLIENT"
    # No dev menu tour or floating tools button in screenshots; the dev
    # menu still opens with Cmd-Ctrl-Z or a shake.
    xcrun simctl spawn "$DEVICE" defaults write "$BUNDLE_ID" EXDevMenuIsOnboardingFinished -bool YES
    xcrun simctl spawn "$DEVICE" defaults write "$BUNDLE_ID" EXDevMenuShowFloatingActionButton -bool NO
  else
    adb_device install -r -g "$CLIENT" >/dev/null
    adb_device shell run-as "$BUNDLE_ID" sh -c "'mkdir -p shared_prefs && printf \"%s\" \"<?xml version=\\\"1.0\\\" encoding=\\\"utf-8\\\" standalone=\\\"yes\\\" ?><map><boolean name=\\\"isOnboardingFinished\\\" value=\\\"true\\\" /><boolean name=\\\"showFab\\\" value=\\\"false\\\" /><boolean name=\\\"showsAtLaunch\\\" value=\\\"false\\\" /></map>\" > shared_prefs/expo.modules.devmenu.sharedpreferences.xml'"
  fi
}

port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

metro_running() {
  [ -n "$METRO_PID" ] && kill -0 "$METRO_PID" 2>/dev/null &&
    curl -fsS "http://127.0.0.1:$PORT/status" 2>/dev/null | grep -q running
}

start_metro() {
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

# Metro's debugger targets are named after the device (the simulator's name
# on iOS, the model on Android). Each worktree has its own Metro, so this
# only has to tell the two platforms apart.
target_name() {
  if [ "$PLATFORM" = ios ]; then
    echo "Vera $(slug)"
  else
    # Android names targets "<model> - <version> - API <level>".
    adb_device shell getprop ro.product.model | tr -d '\r'
  fi
}

app_eval() {
  VERA_DEVICE="$(target_name)" node "$ROOT/scripts/sim-eval.mjs" "$PORT" "$1"
}

# Moves the app to a route through the dev-only `veraDev` hook over Metro's
# debugger connection. Deep links would work too, but iOS asks "Open in
# Vera?" before every `simctl openurl`, which scripts cannot answer.
# Brings the running app to the front without restarting it. On a fresh
# simulator, SpringBoard can come up over the app after it launches.
front() {
  if [ "$PLATFORM" = ios ]; then
    xcrun simctl launch "$DEVICE" "$BUNDLE_ID" >/dev/null
  else
    adb_device shell monkey -p "$BUNDLE_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  fi
}

open_path() {
  local path="/${1#/}"
  front
  app_eval "globalThis.veraDev.open($(node -p 'JSON.stringify(process.argv[1])' "$path"))" >/dev/null
  echo "opened $path"
}

launch() {
  if [ "$PLATFORM" = ios ]; then
    xcrun simctl terminate "$DEVICE" "$BUNDLE_ID" 2>/dev/null || true
    xcrun simctl launch "$DEVICE" "$BUNDLE_ID" --initialUrl "http://127.0.0.1:$PORT" >/dev/null
  else
    adb_device reverse "tcp:$PORT" "tcp:$PORT" >/dev/null
    adb_device shell am force-stop "$BUNDLE_ID"
    adb_device shell am start -a android.intent.action.VIEW \
      -d "vera://expo-development-client/?url=$(node -p "encodeURIComponent('http://127.0.0.1:$PORT')")" \
      "$BUNDLE_ID" >/dev/null
  fi
  for _ in $(seq 1 120); do
    if app_eval "typeof globalThis.veraDev" 2>/dev/null | grep -q object; then
      front
      return
    fi
    sleep 1
  done
  echo "the app did not finish loading; see $STATE_DIR/metro.log" >&2
  exit 1
}

up() {
  load
  ensure_client
  "ensure_${PLATFORM}_device"
  install_client
  # A backend switch changes inlined env, so start Metro fresh unless the
  # other platform is using it.
  if ! metro_running; then
    start_metro
  fi
  save
  launch
  [ "$PLATFORM" = ios ] && open -ga Simulator
  status
  echo "watch it in T3 Code: device_open with deviceId $([ "$PLATFORM" = ios ] && echo "$DEVICE" || echo "$SERIAL")"
}

default_user() { echo "wt$(hash_of "$ROOT" | cut -c1-6)"; }

status() {
  local saved="$PLATFORM"
  for PLATFORM in ios android; do
    load
    echo "$PLATFORM: ${DEVICE:-none}"
  done
  PLATFORM="$saved"
  load
  echo "metro: ${PORT:-none} ($(metro_running && echo running || echo stopped))"
  echo "test user: $(default_user)"
  "$ROOT/scripts/backend.sh" status
}

shot() {
  require_up
  local file="$EVIDENCE/$1.png"
  if [ "$PLATFORM" = ios ]; then
    xcrun simctl io "$DEVICE" screenshot "$file" >/dev/null 2>&1
  else
    adb_device exec-out screencap -p >"$file"
  fi
  echo "$file"
}

record() {
  require_up
  local name="$1"
  if [ "$PLATFORM" = ios ]; then
    xcrun simctl io "$DEVICE" recordVideo --codec h264 --force "$EVIDENCE/$name.mp4" >/dev/null 2>&1 &
  else
    adb_device shell screenrecord --bit-rate 8000000 "/sdcard/$name.mp4" >/dev/null 2>&1 &
  fi
  RECORD_PID=$!
  echo "$name" >"$STATE_DIR/$PLATFORM.recording"
  save
  sleep 1
  echo "recording $name; scripts/sim.sh$([ "$PLATFORM" = android ] && echo " --android") stop when done"
}

stop() {
  require_up
  if [ -n "$RECORD_PID" ]; then
    if [ "$PLATFORM" = android ]; then
      adb_device shell pkill -INT screenrecord >/dev/null 2>&1 || true
    fi
    kill -INT "$RECORD_PID" 2>/dev/null || true
    while kill -0 "$RECORD_PID" 2>/dev/null; do sleep 0.2; done
  fi
  local name
  name="$(cat "$STATE_DIR/$PLATFORM.recording" 2>/dev/null || true)"
  if [ "$PLATFORM" = android ] && [ -n "$name" ]; then
    sleep 1
    adb_device pull "/sdcard/$name.mp4" "$EVIDENCE/$name.mp4" >/dev/null
    adb_device shell rm "/sdcard/$name.mp4"
  fi
  rm -f "$STATE_DIR/$PLATFORM.recording"
  RECORD_PID=""
  save
  [ -n "$name" ] && echo "$EVIDENCE/$name.mp4"
}

down() {
  load
  if [ -n "$RECORD_PID" ]; then kill -INT "$RECORD_PID" 2>/dev/null || true; fi
  if [ "$PLATFORM" = ios ] && [ -n "$DEVICE" ]; then
    xcrun simctl shutdown "$DEVICE" 2>/dev/null || true
    xcrun simctl delete "$DEVICE" 2>/dev/null || true
  elif [ "$PLATFORM" = android ] && [ -n "$DEVICE" ]; then
    [ -n "$SERIAL" ] && adb_device emu kill >/dev/null 2>&1 || true
    if [ -n "$EMULATOR_PID" ]; then
      while kill -0 "$EMULATOR_PID" 2>/dev/null; do sleep 0.5; done
    fi
    "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" -s delete avd -n "$DEVICE" >/dev/null 2>&1 || true
  fi
  DEVICE="" SERIAL="" EMULATOR_PID="" RECORD_PID=""
  save
  rm -f "$STATE_DIR/$PLATFORM"
  # Metro stops with the last device.
  local other=ios
  [ "$PLATFORM" = ios ] && other=android
  if [ ! -f "$STATE_DIR/$other" ]; then
    stop_metro
    rm -f "$STATE_DIR/metro"
    echo "$PLATFORM device and Metro stopped"
  else
    echo "$PLATFORM device stopped; Metro keeps running for $other"
  fi
}

command="${1:-status}"
shift || true
case "$command" in
  up) up ;;
  signin) require_up && open_path "/dev-sign-in?username=${1:-$(default_user)}" ;;
  seed) require_up && open_path "/dev-seed" ;;
  open) require_up && open_path "${1:?path}" ;;
  eval) require_up && app_eval "${1:?expression}" ;;
  relaunch) require_up && launch && echo "relaunched" ;;
  shot) shot "${1:?name}" ;;
  record) record "${1:?name}" ;;
  stop) stop ;;
  reload) require_up && app_eval "globalThis.veraDev.reload()" ;;
  status) status ;;
  down) down ;;
  *)
    sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
