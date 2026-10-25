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

### Message first-release presses, 2026-10-24

Shawn explicitly removed message/text double-tap focus/menu arbitration.
Android now dispatches the existing message press on its first release;
shared code opens its thread. Every later valid release is independent.
The pending 200 ms message timer, second-tap menu branch and target-specific
immediate flag are removed. The existing 320 ms long-press timer still
opens the held part's menu and real-view lift, consuming its release.

The touch eligibility state is tested through release, hold, cancellation
and scroll-stop sequences. Media releases still carry their visible
part/index; reaction releases keep their part/key. Existing release hit
testing, keyboard drag consumption, horizontal swipes, scroll-stop rules,
send ACK, freeze, generic latest navigation and real-content landing are
unchanged. Fullscreen viewer double-tap zoom is outside this native list
module and is not touched. No contract changes or native cooldown.

Integration owns combined runtime checks and delivers both updated phone
clients together. Thread first-release timing, repeated text taps,
long hold with no thread open, reaction/media routing and swipe/scroll-stop
controls remain runtime gates. No client or device build runs here.

Ordinary composer/list growth lag on the Galaxy A16 and residual iOS lag
remain a separate shared/native height-ownership decision. Source input
was sent to integration: ordinary bar updates currently cross JS and React
before native insets arrive, and rows props in the same batch also route
the inset through Android's FIFO worker. No native height observer, field
or guessed geometry is added here. Camera Dev crash and production preview
rounding remain bounded private-production retest items, not a broad audit.

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

## Native composer geometry, revision 3

The shared contract checkpoint is integration `9affdc9e`; its JS placement and
persistent release checkpoint is `b02996b5`. Integration alone owns those shared
files. This Android implementation follows the stable revision 3 in integration's
`.plans/native-composer-growth.md`.

`MessageListComposer` is a retained transparent Yoga host around the existing
Bar. It neither measures nor positions its child with Android LinearLayout;
Fabric owns both frames. A valid sample has one Bar at origin zero with identical
bounds, a unique owner in the list's Fabric surface and window, and a live host
lifetime. No native size setter, predicted height, polling or timer is used.
`composerLayout` advertises the optional host and list binding.

`ComposerMounts` registers one native `UIManagerListener` with the list's
attachment and removes it on detach. `willMountItems` invalidates the old seal;
`didMountItems` reads current host metadata and bounds after all mount mutations.
The idle `didDispatchMountItems` callback does nothing. A module-local weak index
registers each host at attachment and owner changes, scoped by root, window,
surface and owner. Ordinary observation is a key lookup and weak dereference,
with duplicate-owner invalidation; it never traverses the window's view tree.
The valid weak host cache is retained between seals. Installed RN's
`MountItemDispatcher.kt` calls will-mount before view commands and normal mount
items, and did-mount after executing them. Thus commands such as TextInput's own
`setTextAndSelection` are inside this boundary; later attributed-state commits
must still be exercised in the combined runtime proof. This is source ordering,
not proof that every native text resize has the required mounted sequence.

Each submitted rows result captures owner, authorized release, binding and host
lifetime generations, and the paired React inset. The worker remains strictly
FIFO with its existing chained diff base. Same-height/cancel/release-only changes
submit a no-change barrier behind that work. Ordinary React inset reports,
top/overlap changes and changed gaps do not submit worker barriers. Valid bound
bottom ignores chasing React reports and reads actual geometry at the UI seal.
A genuinely new React ordinary inset can still apply at a sealed missing-host
legacy fallback, but a previously consumed bottom cannot replay just because
the host vanished. A mounted newer sequence holds
ordinary observations even before the list's new release prop arrives. An older
S result after host T uses its captured S inset, advances only S and leaves T
held. Matching authority instead uses current actual Bar height plus the explicit
shared gap once. ACK permits release; it does not lock geometry against a new
draft within that same sequence.

After a complete mount, a missing, ambiguous, detached, wrong-surface or invalid
host falls back through the same FIFO barrier to the captured React inset.
Cached host heights are discarded. A new host has a fresh lifetime; old results
cannot borrow it. A reattached list submits a fresh replay barrier after its next
complete seal, behind any retained FIFO work. Binding nil explicitly returns
bottom ownership to React. Top and keyboard overlap remain React-owned.

Freeze and pending pairs buffer ordinary geometry and keyboard offset changes.
A deferred landing waits for the final paired layout before capturing its home
frame. The landing token stays active until Lifter's existing real-view restore
and frame handback callback, including the landing cover. New lift, owner change
and detach invalidate the old continuation. Owner and lift props are reconciled
at the end of the props batch so setter ordering cannot cancel the new owner's
lift. Normal landing has no additional timer. A replacement lift of the same
part while the previous landing is closing first restores the previous borrow.

Passive mount observations do not arm latest navigation. A canceled generic
intent stays canceled, and unchanged seals do not restart an active scroller.
Gesture routes, real carousel tile/deck front-card ownership, and keyboard drag
behavior are unchanged.

Opt-in development logs have no message text:

```sh
adb -s SERIAL shell setprop log.tag.VeraComposerLayout DEBUG
adb -s SERIAL logcat -v threadtime VeraComposerLayout:D '*:S'
adb -s SERIAL shell setprop log.tag.VeraComposerLayout INFO
```

The tag reports mount seals and FIFO applies with owner, authorized release,
mounted sequence and height, bottom inset and native generation/version.
Shared ACK/identity logs use their own clock; do not subtract unrelated clocks.
Combined compilation, ordinary growth trajectories, actual text command/state
mount ordering, 900 ms deliberate UI stall, rapid sends, cancellation/same-height,
remount/fallback, keyboard freeze and real lift landing remain integration's
runtime gate. Unit checks and source review do not clear physical growth.

### Frozen paired-close coordination gate

Source review found a narrow shared cycle. `use-menu-closing.ts` waits for native
land before `onClosed`; `menu-keyboard-hold.ts` requests focus and starts its
fallback release only in `onClosed`. A new-release pair frozen between release
and worker completion cannot begin landing until thaw. Waiting on both in that
order can prevent either from progressing. Normal unpaired landing stays
immediate into the existing raised/frozen geometry, and ordinary rows can finish
without changing frozen geometry. This does not resolve the true paired race.

Moving the focus request to `onClosing` alone has no source guarantee on Android.
Installed keyboard-controller's `KeyboardControllerModuleImpl.setFocusTo` calls
`FocusedInputHolder.focus`, then `ReactEditText.requestFocusFromJS`. That requests
view focus and calls `InputMethodManager.showSoftInput`; it does not move window
focus, retry when focus returns, or acknowledge IME visibility. RN's
`ReactModalHostView.showOrUpdate` clears `FLAG_NOT_FOCUSABLE` after Dialog.show,
so the still-visible menu Dialog remains focusable throughout the opacity fade
and landing wait. Android 36 SDK `InputMethodManager` requires window focus as
well as view focus and checks whether the input is served.

Parent and both native owners explicitly accepted the close-only pair exception.
It is now implemented with captured owner, release, native generation and close
token. At an explicit close, only the already-authorized pair may flush before
land, after a complete seal. The applied frozen keyboard offset is retained at
all apply sites and through handback; hidden root IME geometry is not sampled.
An unfinished worker keeps the pending close; FIFO prefixes may finish without
changing the frozen geometry, then the authorized pair lays out before Lifter
captures destination. Older S after host T uses captured S inset and leaves T
held. Later release authority cannot widen that close. A no-pair or unreleased
host close does not wait for a future send or for ordinary queued work.

New lift, refreeze, owner/lifetime change and detach cancel obsolete close work,
restore borrowed pieces and resolve canceled handoffs. Ordinary observations
remain blocked through actual restore. The close flush does not restart latest
navigation, clear keyboardFrozen, follow the hidden keyboard, change window
focus, add a timer, new event/field or dependency patch. Shared onClosed retains
responsibility for keyboard return after handback. This closes the source-level
cycle; combined runtime proof of continuous raised landing, worker-finish races,
keyboard return and final 8 pt remains pending.

### Source validation

The final Android focused target compiles and passes 113/113 tests, with zero
failures, errors or skips. Composer policy tests cover complete seals, ordinary
actual growth while unrelated rows decode, explicit gap, pre-release HOLD,
matching result authority, FIFO S/T geometry, same-height/cancel release,
missing/rebound hosts, persistent replay, owner/sequence regression, freeze and
landing buffering, and close before/after worker completion, close ceiling,
unreleased-host close and stale/canceled tokens. Weak host tests cover duplicate
invalidation, idempotent registration and detach/removal. Existing RecyclerView,
lift, gesture, deck and pagination suites remain included. These checks do not
exercise a real Fabric mount, Modal window or IME; integration owns that proof.

### Default view registration regression

Integration's actual Android activity dump showed MessageListComposer occupying
the full default-list region as well as the intended bar region. Installed Expo
ModuleDefinitionBuilder.registerViewDefinition aliases the first declared View
under DEFAULT_MODULE_VIEW. The composer batch put the named host first, so
requireNativeView("MessageList") created an empty host instead of the list.
That explains the blank list and absent list trace without attributing them to
sealing or shared send readiness.

MessageListView now precedes the named MessageListComposer registration. The
regression builds the real Expo ModuleDefinition and checks DEFAULT's actual
viewType, its identity with the list export, and the named host's distinct type.
It fails on the previous order with expected MessageListView, actual
MessageListComposer. No view factory/runtime construction, guessed source-text
check, lifecycle, fallback, field or policy change is involved. Integration owns
the combined client rebuild and actual first-row verification.

The corrected registration passes native compilation and all 114 focused tests.
The actual emulator class dump confirmed the original cause; the corrected client's
runtime list/host classes and first rows still need integration verification.

### Paired Modal close applies a padding delta twice

Integration verified the corrected default view and real mounted composer height
in APK 9307, then found a separate final-geometry defect in both close-before-worker
and close-after-wait fixtures. The newest row started at bottom 1163 px with the
keyboard up. The bar shrank from 160 to 96 dp at density 2.625, moving its top
168 px down. Expected row bottom was 1331 px, but its actual final layout bounds
ended at 1499 px. This is exactly two padding deltas. Fresh reset had the correct
8 dp gap; the failure was not initial placement or only accessibility translation.

A real RecyclerView regression reproduces expected 1331, actual 1499 using the
production reverse layout manager and item animator with FLIP movement disabled.
The stable newest row changes only its label, so the existing new-arrival bottom
pin does not run. RecyclerView 1.4.0 runs predictive PRE and POST layout for the
changed row. LinearLayoutManager.AnchorInfo.assignFromView adds totalSpaceChange
to the end anchor in both passes. PRE resets its anchor without committing the
OrientationHelper total-space baseline, so POST can add 168 again to the already
moved child. A control with predictive layout absent applies the delta once.
Exact dependency source was read from Google's RecyclerView 1.4.0 sources JAR;
the source and RED XML/log are preserved under ignored `.cache/`.

The paired-padding path now sets an explicit position-0/bottom-0 anchor only if
the current row is exactly at the padded bottom, within one physical pixel, and
the bottom padding changes. Release-only results use the same path. It does not
use the 80 dp arrival threshold or disable predictive animations. Existing
off-bottom generic-follow anchor restoration, FIFO authority, frozen close
keyboard geometry and real-view landing remain unchanged.

Eight real RecyclerView checks cover the exact failure and predictive control,
growth/shrink, a true insertion, no-change release, a reader only 40 px above
latest, generic-follow anchor preservation and a short alignTop thread. The
combined native target passes 123 tests including the separate diagnostic gate
check. Integration still owns the new APK's actual Modal close-before/after-worker
geometry, raised landing, keyboard return and final 8 dp verification. Host checks
are not a runtime or frame-performance pass.

### Bounded upload lifetime diagnostic

The old binary control reproduced the high emulator CPU/slow-frame window with
the same current JavaScript and static JPEG. The new composer coordinator is
therefore not required for that cost. JavaScript upload completion does not
prove when a particular native MediaView stopped pulsing. A detached, rebound
uploading holder is a source possibility, not an established runtime fault.

The authorized diagnostic keeps pulse behavior unchanged. Only a debuggable app
with `adb shell setprop log.tag.VeraMediaUpload DEBUG` writes START/STOP,
rebind and attach/detach lifetime events. Each includes monotonic uptime, native
view identity, upload/pulse state, attachment/visibility, local bounds, drawable
type and hardware/layer state. It logs no content, message ID, URL or frame
updates, adds no polling and constructs diagnostic details only when enabled.
The gate regression verifies both opt-in and debuggable are required before
details are evaluated. Set the tag to INFO to stop collection.

The existing opt-in VeraComposerLayout trace also reports one `result:ready`
with rows version and captured authority generation when the main thread receives
each worker result. This distinguishes actual worker completion from elapsed
fixture wait time. Integration owns the single diagnostic APK/CPU collection and
any subsequent attribution. No pulse disable, lifecycle fix or new benchmark loop
was selected.
