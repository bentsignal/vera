# This worktree's Metro, shared by scripts/sim.sh (simulators) and
# scripts/phone.sh (Shawn's phone). Metro listens on every interface and
# answers with bundle URLs on whatever host the device used, so one Metro
# serves 127.0.0.1 and the Mac's Wi-Fi address at once. Its state is $STATE_DIR/metro;
# each device using it keeps a file in $STATE_DIR (ios, android, phone-ios,
# phone-android), and Metro stops when the last one goes.
#
# Sourced with ROOT, MOBILE, and STATE_DIR set.

# Every development binary is Vera Dev (app.config.ts), and Metro serves its
# config, so Metro, fingerprints, and prebuilds all use the dev variant.
export APP_VARIANT=development

hash_of() { printf '%s' "$1" | cksum | cut -d' ' -f1; }

load_metro() {
  PORT="" METRO_PID=""
  # shellcheck disable=SC1091
  [ -f "$STATE_DIR/metro" ] && . "$STATE_DIR/metro"
  return 0
}
save_metro() {
  printf 'PORT=%s\nMETRO_PID=%s\n' "$PORT" "$METRO_PID" >"$STATE_DIR/metro"
}

port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

metro_running() {
  [ -n "$METRO_PID" ] && kill -0 "$METRO_PID" 2>/dev/null &&
    curl -fsS "http://127.0.0.1:$PORT/status" 2>/dev/null | grep -q running
}

# What Metro's transform cache depends on beyond the source files. Its cache
# keys miss some dependency and config changes, and a stale cache can break
# startup ("Maximum call stack size exceeded" after a dependency update), so
# Metro clears it when these change.
# A profile bundle (see start_metro) inlines different env, so it counts.
cache_inputs() { { cat "$ROOT/pnpm-lock.yaml" "$MOBILE/metro.config.cjs"; echo "profile=${VERA_METRO_PROFILE:-}"; } | cksum | cut -d' ' -f1; }

start_metro() {
  local inputs clear=()
  PORT=$((8100 + $(hash_of "$ROOT") % 800))
  while port_in_use "$PORT"; do PORT=$((PORT + 1)); done
  inputs="$(cache_inputs)"
  if [ "$(cat "$STATE_DIR/metro-cache" 2>/dev/null)" != "$inputs" ]; then
    echo "dependencies or Metro config changed; clearing Metro's cache" >&2
    clear=(--clear)
  fi
  (
    cd "$MOBILE"
    # VERA_METRO_PROFILE=1 serves a production bundle (minified, without
    # React's development checks) to the dev client, for measuring
    # performance as a release build would have it.
    local profile=()
    if [ "${VERA_METRO_PROFILE:-}" = 1 ]; then
      profile=(--no-dev --minify)
      export EXPO_PUBLIC_PROFILE_BUNDLE=1
    fi
    # A separate session survives the launching terminal/tool closing.
    # nohup alone leaves Expo in that terminal's process group.
    node - "$STATE_DIR/metro.log" "$PORT" "$ROOT/scripts/bench/metro-uncompressed-inspector.cjs" ${clear[@]+"${clear[@]}"} ${profile[@]+"${profile[@]}"} >"$STATE_DIR/metro.pid" <<'JS'
const { spawn } = require("node:child_process");
const { openSync, closeSync } = require("node:fs");
const [log, port, inspectorPreload, ...flags] = process.argv.slice(2);
const output = openSync(log, "w");
const env = { ...process.env };
if (flags.includes("--no-dev")) {
  env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --require ${JSON.stringify(inspectorPreload)}`;
}
const child = spawn("npx", ["expo", "start", "--dev-client", "--port", port, ...flags], {
  detached: true,
  stdio: ["ignore", output, output],
  env,
});
child.unref();
closeSync(output);
console.log(child.pid);
JS
  )
  METRO_PID="$(cat "$STATE_DIR/metro.pid")"
  for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:$PORT/status" 2>/dev/null | grep -q running; then
      echo "$inputs" >"$STATE_DIR/metro-cache"
      return
    fi
    sleep 1
  done
  echo "Metro did not start; see $STATE_DIR/metro.log" >&2
  exit 1
}

ensure_metro() {
  load_metro
  # A backend switch changes inlined env, so Metro starts fresh unless a
  # device is using it.
  metro_running || start_metro
  save_metro
}

stop_metro() {
  if [ -n "$METRO_PID" ] && kill -0 "$METRO_PID" 2>/dev/null; then
    # Only the Metro this script started, and its children.
    pkill -TERM -P "$METRO_PID" 2>/dev/null || true
    kill -TERM "$METRO_PID" 2>/dev/null || true
  fi
  METRO_PID=""
}

# Stops Metro if no device uses it any more; prints what happened.
release_metro() {
  local user
  for user in ios android phone-ios phone-android; do
    if [ -f "$STATE_DIR/$user" ]; then
      echo "Metro keeps running for $user"
      return
    fi
  done
  load_metro
  stop_metro
  rm -f "$STATE_DIR/metro"
  echo "Metro stopped"
}
