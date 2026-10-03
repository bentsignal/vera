#!/usr/bin/env bash
# Runs when T3 Code creates a worktree (t3.json): installs dependencies and
# copies the main checkout's local env files, which point the worktree at
# the shared dev PDS until `scripts/backend.sh isolate` says otherwise.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
MAIN="${T3CODE_PROJECT_ROOT:-$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")}"

if [ "$MAIN" != "$ROOT" ]; then
  # Copies, not links: an isolated backend rewrites the worktree's copy.
  for rel in services/backend/.env.local; do
    if [ -f "$MAIN/$rel" ]; then
      mkdir -p "$(dirname "$ROOT/$rel")"
      cp "$MAIN/$rel" "$ROOT/$rel"
      echo "copied $rel"
    fi
  done
fi

cd "$ROOT"
pnpm install --frozen-lockfile
