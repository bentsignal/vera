# This worktree's Metro, shared by scripts/sim.sh (simulators) and
# scripts/phone.sh (Shawn's phone). Metro listens on every interface and
# answers with bundle URLs on whatever host the device used, so one Metro
# serves 127.0.0.1 and the tailnet at once. Its state is $STATE_DIR/metro;
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
