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
