# Native message list: Android, phone feedback round 2

Shawn tested the round 1 Vera Dev clients on 2026-10-24. The full list and
owners are in the integration branch's `.plans/native-message-list.md`
("Phone feedback round 2, 2026-10-24"). This note covers what Android
changed natively, the cause behind each fix, and what still needs a
device. Paths are under
`apps/mobile/modules/message-list/android/src/main/java/chat/vera/messagelist/`.

## Batch 1: arrivals, reaction height, send inset, keyboard

### Arrivals didn't rise and fade in (item 13)

- The list has `setHasFixedSize(true)`, so RecyclerView posts adapter
  changes to the next frame instead of asking for layout. `layoutNow()`'s
  measure and layout then did nothing, and the insert landed a frame later,
  after `apply()` had cleared which rows were new: the row just appeared.
  It only animated when `scrollToPositionWithOffset(0, 0)` happened to
  request layout (the newest row new, at the bottom). `layoutInPlace`
  (ListChanges.kt) now forces the layout, so the change and its animation
  share the pass that knows what's new.
- A reply under a typing row that stays at the bottom wasn't treated as an
  arrival: the typing row was the first kept row. `rowChanges` now measures
  the bottom from the newest kept row that isn't typing.

### Reaction height moved twice (item 12)

`growsAtTop` compared only the message's own reactions. A photo's reaction
(a deck or a lone photo in bubbles) left it false, so the row's top stayed
anchored while the bottom-up layout moved it: on removal the photo jumped
up by the tapbacks' room and slid back down. `reactionsGrowAtTop` now
includes photos' reactions, so the row's bottom stays and only the rows
above move. Integration audited the optimistic override and found no early
clearing (`round2-reaction-handoff.md` in its cache): the query updates
before the mutation settles. Native doesn't guess counts.

### Multiline send went down, then up (item 1)

JavaScript (`send-inset.ts`, integration 5920a109) now sends the shorter
composer in the same props update as the sent message. On Android the
shorter-composer callback was never called, which was the actual cause on
JavaScript's side; integration's 1c543fb9 arms it, with ordering tests. Native holds an
inset that comes with rows (`InsetHold`) and applies it in `apply()`, after
measuring whether the reader is at the bottom and in the same layout pass
as the rows. An inset that comes alone applies at once; an older carried
inset is dropped if a newer one came since. The keyboard moves on top of
the inset the list actually has.

### Long press with the keyboard up (item 2)

Native already followed the agreed freeze (`menu-keyboard-hold.ts`): while
`keyboardFrozen`, keyboard progress and insets are ignored, the lift lands
where the cell is (still raised), and the thaw moves nothing if the
keyboard came back to the same height. Fixed one gap: reattaching to the
window no longer applies the keyboard while frozen.

### Swiping down at the bottom scrolled the chat (item 3, #165)

Nothing closed the keyboard on Android: the list isn't in a keyboard
gesture area, and RecyclerView has no dismiss mode, so the drag only
scrolled. Now a downward drag that starts at the newest message with the
keyboard up is taken by the list's touch handler, which hides the IME and
keeps the list still. The list rides down with the keyboard through its
insets and stays at the bottom. Scrolled away, a drag scrolls as before.
The composer keeps focus, as agreed with integration: no blur, no new
event or field; tapping the composer brings the keyboard back.

### Tests

`ListChangesTest`: a reply above someone still typing rises in; the first
reply after typing; scrolled away; an older page; the typing row itself;
a send's inset applying with its rows; an inset alone; two queued row
updates. `ListMotionTest` (Robolectric): an insert above a kept typing row
is animated in the same pass that knows it's new (fails without the forced
layout); a photo reaction taken back moves only the rows above;
`reactionsGrowAtTop` for photos, reply lines, stacked, and a first bind.

Batch 1 passed `:message-list:testDebugUnitTest` (48 tests, 0 failures).

## Batch 2: the deck, its lift, stacked typing

### Deck speed and the card coming back under (item 11)

Out to the side in 90 to 140 ms and back under in 160 ms (iOS: about 120
and 160). The drawing order switches when the thrown card is its width +
12 out, so nothing overlaps it. The flicker came from the order itself:
`getChildDrawingOrder` is only read when the deck redraws, and moving the
cards only updates their own layers, so the thrown card stayed on top
until the tuck ended. The deck now invalidates when the order changes.

### Aspect ratios and edges (item 10)

Each card is its own photo's height, centered in the tallest photo's
height, so the pile never changes height; it turns about its own bottom
middle. The deck sizes and places its cards itself, without asking the
list to lay out again on each swipe. For smooth turned edges each card
keeps a clear pixel around its photo and is drawn from a layer only while
it's turned and not blurred (a blurred card on API 31+ is already drawn
offscreen). The front card at rest has no layer.

### Deck lift (item 9)

A hold lifts only the front card (`DeckView.frontCard`), the real view.
The deck draws without it (its drawing order skips a card that's out) and
it returns to its index and frame. Tapbacks hide while the menu is up and
fade back in over 260 ms after landing, so nothing of the list draws over
the menu.

The deck's tapbacks were anchored at the pile's top as if the front photo
were the tallest; a shorter photo is centered lower, so they floated above
it (57 dp for a landscape photo in a pile with a portrait). They now sit
on the front photo's actual top (`DeckView.frontTop`, from its photo's
shape, so it holds while the card is lifted), and move with it when
another photo comes forward. The row's height and the room above it don't
change.

### Stacked typing (item 4)

As React Native's `Faces`: 18 photos with a 1.5 ring in the page color,
overlapping by 4, initials at 8 semibold (`initialsSize`, from `Avatar`'s
sizes); four people show four photos, more show three and a "+N" pill
under them. The overflow rule is the typing indicator's only: reply lines
still show at most three photos and no pill, as `reply-card.tsx`. Native
honors `showFaces` in both layouts (integration sends true for stacked
one-on-one chats, as React Native's stacked line shows them).

### Video badge after the viewer (item 6)

No native cause found: `MediaView` draws the badge whenever its item is a
video, with no state tied to transitions, and doesn't reload on reattach.
The likeliest cause was the viewer's own play button, which integration's
5162d2c3 now fades with the backdrop. Needs a frame-by-frame recording of a
swipe-down dismiss in the combined client.

### Tests

`DeckAndFacesTest` (Robolectric, API 30): a deck's tapbacks on a short
front photo's corner in a real bubbles cell; `frontTop` for short and tall
front photos with the pile's height unchanged; four typists show four photos,
six show three and "+3"; the pill's size; a reply line caps at three with
no pill; photos are round, initials RN's sizes; deck cards centered in the
tallest height and turned about their own bottom; only turned cards get a
layer; the front card lifts alone, the deck draws without it, and it comes
back to its index and frame.

### Dev harness

The interrupted direct-provider run had changed the shared
`use-dev-rows.ts` (the dev toggle puts 👍 on the newest message's first
photo). It's saved as a patch with its provenance and caveats in the
Android run's cache (`round2-20261024/use-dev-rows.inherited.patch` and
`.md`), and the file is back at HEAD. Integration decides whether to
adopt it.

## Photos and videos open on the first tap (round 2 item 7, approved)

Approved by Shawn on 2026-10-24: an inline photo or video opens on its
first single-tap release; double tapping it no longer opens its menu.
Holding it still opens the menu with the real view lifted. Text keeps its
double tap to menu, and reactions and stopping a scroll are unchanged. No
new fields; iOS is making the same change.

Cause, from source: `Target.immediate` excluded `media`, so a photo tap
waited the 200 ms double-tap window (`DOUBLE_TAP_MS`) after release before
the press went to JavaScript, and a second tap held it instead. That 200 ms
is read from source; Android's latency hasn't been measured. (iOS's
351.7 ms is iOS's own trace.)

Change: `immediate` is now everything but `message`. The double-tap
bookkeeping moved from `MessageListView.Touch` into `Taps` (Taps.kt),
unchanged for messages, with two rules for media: a touch on a photo or
video is never the second of a double tap (a message's waiting press is
dropped rather than turned into a hold, so two things don't open), and a
second tap that ends on a photo opens it. Every media release is a press,
with no native cooldown: integration's shared guard in JavaScript keeps
rapid presses from opening the viewer twice (as on iOS). The hold timer,
the press shrink, and cancelling on movement or on stopping a scroll stay
in `Touch`, so a held photo opens only its menu and a dragged or stopped
one opens nothing.

`TapsTest` (9): a photo opens on its first release; a second tap that ends on a photo opens it; a quick second tap on
it is another press, not a hold; a message still waits and a double tap
still holds it; a single message tap after its wait; a photo tapped right
after a message opens instead of holding; a second tap on a reaction is a
tap; too far or too late is a new tap; a double tap off a message holds
nothing. The hold and cancel paths live in `Touch`, which needs an Expo
`AppContext`; they aren't unit tested and are unchanged.

Checks after the release guard: `:message-list:testDebugUnitTest` passed,
65 tests, 0 failures, 0 errors, 0 skipped; then `lint`, `typecheck`,
`test` and `react-doctor --base origin/t3/native-message-list` passed. The
cooldown's removal came after those checks, and they passed again on it:
65 tests, 0 failures, then the ordered checks.
Unit tests only; no Android latency is measured yet.

Device checks (root, combined client), all still open: first-tap open latency on the A16
and the emulator, for a lone photo, a carousel card, a deck's front card,
and a video; double tap a photo (no menu; the viewer opens once through the shared guard); hold a photo (menu,
real lift, no open); drag or stop a scroll on a photo (nothing opens);
text double tap and hold (menu).

## Validation run (source, 2026-10-24)

- `./gradlew :message-list:testDebugUnitTest` (from `apps/mobile/android`,
  under the shared heavy lock): compiled and passed, 56 tests, 0 failures,
  0 errors, 0 skipped, in 13 s. That's the 37 from round 1, 11 from batch 1
  (`ListChangesTest`, `ListMotionTest`) and 8 in `DeckAndFacesTest`.
- Then, in order: `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`,
  `pnpm run react-doctor --base origin/t3/native-message-list`, all
  passing; `pnpm run format:fix` after.

None of this exercises motion, touch, the keyboard or video on a device,
so no fix in this note counts as verified on a device yet. The only
recording is `before-arrivals-bubbles.mp4` in `.cache/evidence`, a before
baseline the interrupted run made; there's no after recording from this
thread. Integration owns the combined client: the recordings, real video
playback, profiling, and Shawn's phone checks below.

## Still needs a device

### Opt-in keyboard drag trace, 2026-10-24

The slow adb swipe still failed to dismiss the keyboard in integration's
combined client. The later endpoint retest did not run because the
emulator disappeared. No dismissal behavior has been changed from that
evidence. The screen's KeyboardGestureArea is native on Android API 30+
and requests interactive IME control before forwarding MOVE to its
children, so it can overlap the list's independent hide request. That
overlap is a candidate, not a confirmed cause.

The diagnostic is enabled only in a debuggable binary, sampled at each
gesture's DOWN with the Android log property:

```sh
adb -s "$serial" shell setprop log.tag.VeraKeyboardDrag DEBUG
adb -s "$serial" logcat -v threadtime VeraKeyboardDrag:D ImeTracker:I InsetsController:D '*:S'
# After the capture, disable before the next gesture:
adb -s "$serial" shell setprop log.tag.VeraKeyboardDrag INFO
```

Each gesture carries its MotionEvent downTime and logs uptime/eventTime
for correlation with system IME logs. Records include DOWN gate values,
native keyboard lift, latest distance/threshold, scroll state, root/window
IME visibility, the first MOVE, recognition, hide request/return or missing
activity window, interception-disallow requests and UP/CANCEL. It logs
no message content or row identifiers. The opt-in is held constant until
the next DOWN; no diagnostic state is collected while disabled. Return
from hide and the visibility sampled at UP are not final dismissal ACKs.

No dependency patch or wrapper probe was added. Integration owns the
diagnostic APK and runtime capture. Unit coverage verifies lazy disabled
collection, per-gesture sampling, one first-MOVE record and terminal
shutdown. The trace does not change touch recognition or keyboard policy.

### Smooth scrolled-up sends, 2026-10-24

Sol implements the approved generic latest-navigation policy. Shared code
arms the existing animated command only after its clear-commit height ACK
and exact optimistic row are ready, immediately before releasing that
row and inset together. Native does not acknowledge a send or hold rows
waiting for an ID. Canceling a send after arming may still finish generic
latest navigation. No contract changes.

Previously the smooth scroller could finish against the old rows while
the sent row was held or decoded. Its numeric target zero did not retain
an intent to follow the next apply. The new controller retains that
intent through ordinary applies and scroll completion. Eligible off-bottom
applies preserve a stable visible row's screen position with the new
padding, then retarget smoothly after layout. They do not snap to latest
within the broader near-latest threshold. Already-bottom arrivals keep
the existing pin and arrival animation. The existing initial jump-close
optimization for very distant requests is unchanged.

Submitted row revisions exclude older FIFO results from restarting a
newer request. Posted starts carry generations so a new command, freeze,
layout or cancellation invalidates older callbacks. Worker diffs still
apply in FIFO order; none are dropped or coalesced. Direct list touches,
drag, explicit row/nonanimated navigation, lift, benchmark scrolling and
detach cancel the intent. Direct touch also prevents a queued restart
from beginning under the finger after an earlier scroll has finished.

Freeze pauses motion while retaining the anchor intent; thaw resumes
against current layout after keyboard easing. Android already applies
carried rows and inset together while frozen, so no additional frozen
result barrier or delayed real-view landing was added. Keyboard/lift
behavior without a latest intent is preserved.

Focused coverage adds eight intent-ordering tests and two real
Robolectric reverse-RecyclerView tests for stable anchoring through a
paired row insertion plus inset shrink and removal of the anchor row.
Integration must still record smooth short/tall scrolled-up sends,
worker delay, freeze/thaw/refreeze, user interruption, superseding sends
and post-arm cancellation, both layouts and the final 8 pt gap. Existing
real-content lift/keyboard landing and reaction-height recordings remain
regression gates. No device or full-client build runs in this checkout.

### Batch 2 device checks

- [ ] Deck: quick swipes both ways, chained flicks, the thrown card sliding
  under the pile with no flicker; mixed aspect ratios centered; edges on
  the A16 and the emulator; frames during swipes (layers while turned).
- [ ] Deck hold: only the front card lifts, no tapbacks over the menu,
  tapbacks fade back after landing, the card returns exactly.
- [ ] Deck tapbacks on the front photo's corner for landscape, square and
  portrait photos, following each swipe.
- [ ] Stacked typing in a group with 1, 4 and 6 typists, and in a DM; a
  reply line with 5 repliers.
- [ ] Video: swipe-down dismiss from a list video, frame by frame.

### Batch 1 device checks

- [ ] Arrivals rise and fade in, both layouts, at the bottom, including the
  first reply after typing and a reply while someone else still types.
- [ ] Deck and lone-photo reaction add and remove: one move.
- [ ] Multiline send: one move up, never down first (emulator and A16).
- [ ] Long press with the keyboard up: stays raised, lands above the
  returning keyboard, no move on thaw.
- [ ] Swipe down at the bottom with the keyboard up: keyboard closes, list
  stays at the bottom, no scroll; scrolled away: scrolls.
- [ ] `sim.sh frames` around arrivals and sends (the forced layout runs
  once per rows update).
