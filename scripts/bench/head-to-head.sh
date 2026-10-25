#!/usr/bin/env zsh
# The native message list against the React Native one, in the real app, on
# the same conversation, with the same driver (.plans/native-message-list.md):
#
#   scripts/bench/head-to-head.sh [--android] [fling|burst|all]
#
# For each list (the React Native one, then the native one), it flips the
# switch (veraDev.nativeList), restarts the app, opens the conversation at
# its newest message, and runs:
#
# - fling: a constant-speed scroll toward older messages on the UI thread
#   (veraDev.list().fling: Reanimated's scrollTo each frame for the React
#   Native list, the binary's benchFling on the display link for the native
#   one), BENCH_SPEED points a second for BENCH_MS, through older pages.
# - burst: BENCH_BURST messages from the bots over BENCH_BURST_SECONDS
#   (dev:burst), at the bottom.
#
# Each reports the UI thread's frames (scripts/sim.sh frames; on Android
# the main thread's time per frame separately, android-frames.mjs, since
# software GL and host load also affect callback intervals), the
# JavaScript thread's stalls over 50 ms (veraDev.stalls), and for the fling
# how far it got and how long it waited at the oldest message. No test
# driver touches the screen while it measures.
#
# Needs the device up and signed in, BENCH_GROUP set to the conversation
# (a seeded busy group: devBusy:seed), and a production bundle for numbers
# that mean anything (VERA_METRO_PROFILE=1 scripts/sim.sh up). Hold the
# heavy-work lock while it runs. Results go to .cache/bench/<run>.jsonl.
set -euo pipefail
cd "$(dirname "$0")/../.."
FLAG=()
[[ ${1:-} == --android ]] && { FLAG=(--android); shift; }
WHAT=${1:-all}
GROUP=${BENCH_GROUP:?set BENCH_GROUP to the conversation}
SPEED=${BENCH_SPEED:-5500}
MS=${BENCH_MS:-10000}
BURST=${BENCH_BURST:-150}
BURST_SECONDS=${BENCH_BURST_SECONDS:-15}
LAYOUT=${BENCH_LAYOUT:-stacked}
REVISION=$(git rev-parse HEAD)
TARGET_PLATFORM=ios
[[ -n $FLAG ]] && TARGET_PLATFORM=android
LISTS=(rn native)
if [[ -n ${BENCH_LIST:-} ]]; then
  [[ $BENCH_LIST == rn || $BENCH_LIST == native ]] || exit 2
  LISTS=($BENCH_LIST)
fi
RUN=.cache/bench/$(date +%Y%m%d-%H%M%S)-${FLAG:+android-}${WHAT}.jsonl
mkdir -p .cache/bench

sim() { scripts/sim.sh $FLAG "$@"; }
ANDROID_SERIAL=""
if [[ -n $FLAG ]]; then
  source .cache/sim/android
  ANDROID_SERIAL=$SERIAL
fi

# Measures frames for `seconds` while the scenario runs (in the background).
frames_start() {
  sim frames start > "$RUN.frames-start.log"
  if [[ -n $FLAG ]]; then
    node scripts/bench/android-frames.mjs $ANDROID_SERIAL chat.vera.app.dev $1 > .cache/bench/frames.json &
    FRAMES_PID=$!
  fi
}
frames_stop() {
  local ui=$(sim frames stop | tee -a "$RUN.frames-stop.log" | grep '^{')
  if [[ -n $FLAG ]]; then
    wait $FRAMES_PID
    echo "{\"ui\":$ui,\"main\":$(cat .cache/bench/frames.json)}"
  else
    echo "{\"ui\":$ui,\"main\":null}"
  fi
}
js() { sim eval "$1" 2>/dev/null | tail -1; }

open_fresh() {
  local list=$1
  sim relaunch >/dev/null 2>&1; sleep 8
  local shown=$(js "veraDev.nativeList($([[ $list == native ]] && echo true || echo false))" | tr -d '"')
  if [[ $shown != $list ]]; then echo "wanted the $list list, got $shown" >&2; return 1; fi
  js "veraDev.preference(\"groupLayout\", \"$LAYOUT\"); veraDev.preference(\"appearance\", \"light\")" >/dev/null
  if [[ $(js '__DEV__') != false ]]; then echo 'benchmark requires a production bundle' >&2; return 1; fi
  sim relaunch >/dev/null 2>&1; sleep 8
  sim open "/conversation/$GROUP" >/dev/null; sleep 8
  if [[ $(js 'veraDev.list()?.kind' | tr -d '"') != $list ]]; then
    echo "the conversation did not mount the $list list" >&2; return 1
  fi
}

record() {
  local list=$1 scenario=$2 frames=$3 stalls=$4 extra=${5:-null}
  local line="{\"revision\":\"$REVISION\",\"platform\":\"$TARGET_PLATFORM\",\"list\":\"$list\",\"layout\":\"$LAYOUT\",\"scenario\":\"$scenario\",\"speed\":$SPEED,\"durationMs\":$MS,\"burstCount\":$BURST,\"burstSeconds\":$BURST_SECONDS,\"frames\":$frames,\"stalls\":$stalls,\"fling\":$extra}"
  echo $line | tee -a $RUN
}

fling() {
  local list=$1
  open_fresh $list || return
  js 'globalThis.veraFling = undefined; globalThis.veraLoadedBefore = veraDev.conversation().messages().length; veraDev.stalls.start()' >/dev/null
  frames_start $(( MS / 1000 + 1 ))
  js "void veraDev.list().fling($SPEED, $MS).then((result) => { globalThis.veraFling = result; })" >/dev/null
  sleep $(( MS / 1000 + 2 ))
  local frames=$(frames_stop)
  local stalls=$(js 'JSON.stringify(veraDev.stalls.stop())' | sed 's/^"//; s/"$//; s/\\"/"/g')
  local result=$(js 'JSON.stringify(globalThis.veraFling == null ? null : { ...globalThis.veraFling, loadedBefore: globalThis.veraLoadedBefore, loadedAfter: veraDev.conversation().messages().length })' | sed 's/^"//; s/"$//; s/\\"/"/g')
  if [[ $result == null || -z $result ]]; then echo "$list fling did not finish" >&2; return 1; fi
  record $list fling "${frames:-null}" "${stalls:-null}" "${result:-null}"
}

burst() {
  local list=$1
  open_fresh $list || return
  js 'veraDev.stalls.start()' >/dev/null
  frames_start $(( BURST_SECONDS + 3 ))
  (cd services/backend && npx convex run dev:burst "{\"conversationId\":\"$GROUP\",\"count\":$BURST,\"seconds\":$BURST_SECONDS,\"label\":\"Burst\"}" >/dev/null 2>&1)
  sleep $(( BURST_SECONDS + 3 ))
  local frames=$(frames_stop)
  local stalls=$(js 'JSON.stringify(veraDev.stalls.stop())' | sed 's/^"//; s/"$//; s/\\"/"/g')
  record $list burst "${frames:-null}" "${stalls:-null}"
}

for scenario in fling burst; do
  if [[ $WHAT == $scenario || $WHAT == all ]]; then
    for list in $LISTS; do
      $scenario $list
    done
  fi
done
echo "results: $RUN"
