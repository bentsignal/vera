#!/usr/bin/env bash
# Serializes native builds and measurements across Vera worktrees.
# Run `sim.sh build` here, then `sim.sh up` outside it so queue waits
# don't hold the heavy-work lock.
set -euo pipefail
lock="$HOME/Library/Caches/vera/heavy.lock"
mkdir -p "$(dirname "$lock")"
until mkdir "$lock" 2>/dev/null; do
  if [ -n "$(find "$lock" -maxdepth 0 -mmin +90 2>/dev/null)" ]; then
    [ ! -f "$lock/owner" ] || unlink "$lock/owner"
    rmdir "$lock" 2>/dev/null || true
  fi
  sleep 15
done
trap 'unlink "$lock/owner"; rmdir "$lock"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '%s %s %s\n' "$(basename "$PWD")" "$(date +%H:%M)" "$*" > "$lock/owner"
"$@"
