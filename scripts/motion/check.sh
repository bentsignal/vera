#!/usr/bin/env zsh
# The message list's motion check: plays each of the list's animations in
# this worktree's simulator, records it, and flags jank in the recording
# (scripts/motion/analyze.ts: snaps, jump-backs, flickers, blank bands).
#
#   scripts/motion/check.sh                 # every scenario, both layouts
#   scripts/motion/check.sh react-remove    # scenarios whose name matches
#   MOTION_LIST=rn scripts/motion/check.sh  # the React Native list instead
#
# Round 2 adds two scenarios that run only when named, so a full run is
# the same 18 as before:
#   react-front-media  your 👍 on a three-photo message's first photo (the
#                      deck's front card at rest, a carousel's first item)
#   react-front-media-remove
#                      the same 👍 taken off again
#   composer-send      five lines typed into the real composer, then its
#                      Send pressed: the send shrink, through the draft and
#                      send pipeline, not `conversation.send`. Needs
#                      MOTION_AD, a command that runs agent-device on this
#                      worktree's device (its --udid, --config and
#                      --session), such as a one-line wrapper script.
#                      agent-device reads the screen as it taps, which can
#                      stall the app for a moment: look at the video too.
# Their setup and actions are logged to <run>/<label>.actions.log; a step
# that fails fails the case, recorded or not.
# Typing to the first arrival is `typing-reply`. Whether a row fades in
# is a look at the frames: the analyzer follows positions, not opacity.
#
# Needs this worktree's simulator up and signed in (scripts/sim.sh up,
# signin, seed once). MOTION_GROUP picks the group (else the inbox's
# newest). MOTION_LIST picks the list: `native` (the default; the binary
# must have it) or `rn`. Recordings go to .cache/motion/<run>/. Exits 1 if
# any scenario is flagged; look at the recording at the times it lists.
set -u
cd "$(dirname "$0")/../.."
ROOT=$PWD
FLAG=()
PLATFORM=ios
if [[ ${1:-} == --android ]]; then
  FLAG=(--android)
  PLATFORM=android
  shift
fi
FILTER=${1:-}
LIST=${MOTION_LIST:-native}
APPEARANCE=${MOTION_APPEARANCE:-light}
if [[ $LIST != native && $LIST != rn ]]; then
  echo "MOTION_LIST is native or rn, not $LIST" >&2
  exit 2
fi
RUN=$ROOT/.cache/motion/$(date +%Y%m%d-%H%M%S)
mkdir -p "$RUN"

sim() { scripts/sim.sh $FLAG "$@" >/dev/null 2>&1; }
js() { scripts/sim.sh $FLAG eval "$1" 2>/dev/null | tail -1; }
convex() { (cd services/backend && npx convex run "$@" >/dev/null 2>&1); }

if ! scripts/sim.sh status 2>/dev/null | grep -E "^$PLATFORM: .+" | grep -qv ': none'; then
  echo "the $PLATFORM device isn't up: scripts/sim.sh $FLAG up" >&2
  exit 2
fi
sim relaunch; sleep 2
shown=$(js "veraDev.nativeList($([[ $LIST == native ]] && echo true || echo false))" | tr -d '"')
js "veraDev.preference(\"appearance\", \"$APPEARANCE\")" >/dev/null
if [[ $shown != "$LIST" ]]; then
  echo "asked for the $LIST list, but conversations show $shown (no native list in this binary?)" >&2
  exit 2
fi
GROUP=${MOTION_GROUP:-$(js 'veraDev.firstGroup()' | tr -d '"')}
if [[ $GROUP != group:* ]]; then
  echo "no group in the inbox: scripts/sim.sh seed" >&2
  exit 2
fi

say() { convex dev:say "{\"conversationId\":\"$GROUP\",\"username\":\"$1\",\"body\":\"$2\"}"; }
# A photo for `dev:say`, in one of a deck's shapes.
photo() { echo "{\"kind\":\"image\",\"mimeType\":\"image/jpeg\",\"name\":\"$1.jpg\",\"size\":400000,\"url\":\"https://picsum.photos/seed/vera-motion-$1/$2/$3\",\"width\":$2,\"height\":$3}"; }
# The named-only cases' setup and actions are logged, with their exit
# status, to $RUN/<label>.actions.log (ACTIONS), and any that fails fails the
# case: a recording never counts when what it records didn't happen.
ACTIONS=/dev/null
logged() {
  # Not `status`: zsh's is read-only.
  local out step_exit
  out=$("$@" 2>&1); step_exit=$?
  print -r -- "\$ ${(j: :)${(q)@}}" >>$ACTIONS
  [[ -n $out ]] && print -r -- "$out" >>$ACTIONS
  print -r -- "exit $step_exit" >>$ACTIONS
  return $step_exit
}
convex_run() { (cd services/backend && npx convex run "$@"); }
# Runs `expression` in the app, which must come to "done".
js_done() {
  local out
  out=$(js "$1" | tr -d '"')
  print -r -- "js $1" >>$ACTIONS
  print -r -- "-> $out" >>$ACTIONS
  [[ $out == done ]]
}
say_photos() {
  logged convex_run dev:say "{\"conversationId\":\"$GROUP\",\"username\":\"$1\",\"body\":\"$2\",\"attachments\":[$(photo tall 1200 1600),$(photo wide 1600 1200),$(photo square 1080 1080)]}"
}
# Your 👍 on or off the target's first photo (attachment 0; its part 0, since
# the message has a body).
toggle_front_media() {
  js_done '(veraDev.conversation().react(veraDev.motionTarget, "\u{1F44D}", 0), "done")'
}
# The composer's field. Android labels it "Message"; iOS reads it as
# "Message Message", which an exact label never matches, so there it's the
# screen's only editable element (a second would fail as ambiguous).
if [[ $PLATFORM == android ]]; then
  COMPOSER_FIELD='label="Message" editable=true'
else
  COMPOSER_FIELD='editable=true'
fi
# Five lines, the first unique to the run and case, so an earlier case's
# message can't pass for this one's.
composer_text() {
  COMPOSER_TEXT="Line one ${RUN:t} $1"$'\nLine two\nLine three\nLine four\nLine five'
  COMPOSER_TEXT_JS=${COMPOSER_TEXT//$'\n'/\\n}
}

typing() { convex dev:type "{\"conversationId\":\"$GROUP\",\"username\":\"$1\",\"typing\":$2}"; }

ready() {
  for attempt in {1..20}; do
    if [[ $(js "veraDev.conversation()?.id === \"$GROUP\" && veraDev.list()?.kind === \"$LIST\" && veraDev.conversation().messages().length > 0") == true ]]; then
      sleep 2
      return 0
    fi
    sleep 1
  done
  return 1
}

# Fresh, varied messages at the bottom, so no two rows look alike (the
# analyzer tells moves apart by what the rows show).
setup() {
  local tag=$1
  say maya "Is anyone around this weekend for $tag?" &
  sleep 0.3; say jonah "Probably, depends on the weather" &
  sleep 0.3; say priya "I'm in" &
  sleep 0.3; say leo "Count me in too, I can bring snacks and the speaker" &
  wait; sleep 3
}

# Each scenario: what it does once recording, how long to keep recording,
# and options for the analyzer.
scenario_arrival() { say maya "Just landed, on my way over now"; sleep 3; }
scenario_typing_reply() {
  typing jonah true; sleep 3
  say jonah "Sounds good, see you at seven"; sleep 3
}
scenario_react_add() { js 'veraDev.conversation().react(veraDev.motionTarget, "\u{1F44D}")' >/dev/null; sleep 3; }
scenario_react_remove() { js 'veraDev.conversation().react(veraDev.motionTarget, "\u{1F44D}")' >/dev/null; sleep 3; }
scenario_first_reply() {
  local id
  id=$(js 'veraDev.conversation().idOf(veraDev.motionTarget)' | tr -d '"')
  convex dev:say "{\"conversationId\":\"$GROUP\",\"threadId\":\"$id\",\"username\":\"maya\",\"body\":\"Replying in the thread\"}"
  sleep 3
}
scenario_send() { js 'veraDev.conversation().send("On my way")' >/dev/null; sleep 3; }
scenario_react_front_media() {
  toggle_front_media || return 1
  sleep 3
}
# Pressing the real Send, then checking the message really went out.
scenario_composer_send() {
  logged ${=MOTION_AD} press 'label="Send"' || return 1
  sleep 3
  js_done "(veraDev.conversation().messages().some((m) => m.body === \"$COMPOSER_TEXT_JS\") ? \"done\" : \"not sent\")"
}
scenario_edit() { js 'veraDev.conversation().edit(veraDev.motionMine, "Running ten minutes late, sorry")' >/dev/null; sleep 3; }
scenario_delete() { js 'veraDev.conversation().remove(veraDev.motionMine)' >/dev/null; sleep 3; }
scenario_firehose() {
  convex dev:burst "{\"conversationId\":\"$GROUP\",\"count\":60,\"seconds\":6,\"label\":\"Firehose\"}"
  sleep 8
}

# Name, function, what it needs set up first, analyzer options.
SCENARIOS=(
  "arrival:scenario_arrival::"
  "typing-reply:scenario_typing_reply::"
  "react-add:scenario_react_add:target:"
  "react-remove:scenario_react_remove:target-reacted:"
  "first-reply:scenario_first_reply:target:"
  "send:scenario_send::"
  "edit:scenario_edit:mine:"
  "delete:scenario_delete:mine:"
  "firehose:scenario_firehose::--allow-snaps"
)
# Run only when named (see the top).
NAMED_ONLY=(
  "react-front-media:scenario_react_front_media:media-target:"
  "react-front-media-remove:scenario_react_front_media:media-target-reacted:"
  "composer-send:scenario_composer_send:composer:"
)
for entry in $NAMED_ONLY; do
  [[ -n $FILTER && ${entry%%:*} == *$FILTER* ]] && SCENARIOS+=("$entry")
done

failed=0
summary=()
for layout in bubbles stacked; do
  for entry in $SCENARIOS; do
    name=${entry%%:*}; rest=${entry#*:}
    fn=${rest%%:*}; rest=${rest#*:}
    needs=${rest%%:*}; analyzer_flags=${rest#*:}
    label="$PLATFORM-$LIST-$APPEARANCE-$layout-$name"
    [[ -n $FILTER && $label != *$FILTER* ]] && continue
    L0=$(wc -l < .cache/sim/metro.log)
    sim relaunch; sleep 2
    if [[ $(js 'veraDev.nativeList()' | tr -d '"') != "$LIST" ]]; then
      summary+=("FAIL $label (not showing the $LIST list)")
      failed=1
      continue
    fi
    js "veraDev.preference(\"groupLayout\", \"$layout\")" >/dev/null
    sim open "/conversation/$GROUP"
    if ! ready; then
      summary+=("FAIL $label (conversation did not become ready)")
      failed=1
      continue
    fi
    setup "$label"
    ACTIONS=/dev/null
    case $needs in media-target*|composer) ACTIONS="$RUN/$label.actions.log" ;; esac
    case $needs in
      target|target-reacted)
        say maya "Motion target $label"; sleep 3
        js "veraDev.motionTarget = \"Motion target $label\"" >/dev/null
        if [[ $needs == target-reacted ]]; then
          js 'veraDev.conversation().react(veraDev.motionTarget, "\u{1F44D}")' >/dev/null
          sleep 3
        fi
        ;;
      mine)
        js "veraDev.conversation().send(\"Mine $label\")" >/dev/null; sleep 3
        js "veraDev.motionMine = \"Mine $label\"" >/dev/null
        ;;
      media-target|media-target-reacted)
        if ! say_photos maya "Motion photos $label" ||
          ! { sleep 4; js_done "(veraDev.motionTarget = \"Motion photos $label\", veraDev.conversation().idOf(veraDev.motionTarget), \"done\")"; } ||
          { [[ $needs == media-target-reacted ]] && ! { toggle_front_media && sleep 3; }; }; then
          summary+=("FAIL $label (setup failed: $ACTIONS)")
          failed=1
          continue
        fi
        ;;
      composer)
        if [[ -z ${MOTION_AD:-} ]]; then
          summary+=("SKIP $label (set MOTION_AD to run agent-device on this device)")
          continue
        fi
        composer_text $layout
        if ! logged ${=MOTION_AD} fill $COMPOSER_FIELD $COMPOSER_TEXT; then
          summary+=("FAIL $label (filling the composer failed: $ACTIONS)")
          failed=1
          continue
        fi
        sleep 2
        ;;
    esac
    sim record "motion-$label"; sleep 0.5
    $fn
    acted=$?
    sim stop
    mv ".cache/evidence/motion-$label.mp4" "$RUN/$label.mp4" 2>/dev/null
    errors=$(tail -n +$((L0 + 1)) .cache/sim/metro.log | grep -cE "ERROR|Uncaught")
    result=$(node --experimental-strip-types scripts/motion/analyze.ts "$RUN/$label.mp4" ${=analyzer_flags})
    flagged=$?
    if (( acted != 0 )); then
      # What was recorded isn't what the case is about: never a pass.
      failed=1
      summary+=("FAIL $label (the action failed: $ACTIONS)")
    elif (( flagged != 0 || errors > 0 )); then
      failed=1
      summary+=("FAIL $label (errors in Metro's log: $errors)")
      summary+=("${(f)result}")
    else
      summary+=("ok   $label")
    fi
  done
done

print -l -- $summary
echo "recordings: $RUN"
exit $failed
