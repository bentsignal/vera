#!/usr/bin/env bash
# Claude Code Stop hook: a turn that ends waits on Shawn, and a device left
# up while he reads holds 2 to 4 GB of the Mac every worktree shares. If
# this worktree's simulator or emulator is still up, send the agent back
# once to shut it down (the vera-simulator skill, "Shutting down").
# It also stops phone servers, in any worktree, that the phone hasn't
# loaded from in a day (`scripts/phone.sh sweep`).
set -euo pipefail
input="$(cat)"
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
"$root/scripts/phone.sh" sweep >/dev/null 2>&1 || true
# Already sent back once this turn; let it end rather than loop.
if printf '%s' "$input" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi
up=()
for platform in ios android; do
  if grep -Eq '^DEVICE=.+' "$root/.cache/sim/$platform" 2>/dev/null; then
    up+=("$platform")
  fi
done
[ ${#up[@]} -eq 0 ] && exit 0
commands=""
for platform in "${up[@]}"; do
  if [ "$platform" = android ]; then
    commands+="scripts/sim.sh --android down; "
  else
    commands+="scripts/sim.sh down; "
  fi
done
if [ ${#up[@]} -eq 2 ]; then devices="iOS simulator and Android emulator are"; elif [ "${up[0]}" = ios ]; then devices="iOS simulator is"; else devices="Android emulator is"; fi
reason="This worktree's $devices still up. Before ending your turn, close it in T3's Device panel (device_close, if it's open there), then run: ${commands}A device you leave up holds memory every other worktree needs while Shawn reads; \`scripts/sim.sh up\` brings it back in about a minute."
printf '{"decision":"block","reason":%s}\n' "$(node -p 'JSON.stringify(process.argv[1])' "$reason")"
