# Native message list

Decided with Shawn on 2026-10-22. The message list is being rebuilt
natively: UICollectionView in Swift on iOS, RecyclerView in Kotlin on
Android. The core is native, and it's extended from JavaScript. This
records why, what's decided, and what's still open. Read it before
working on the message list.

## Why

The React Native list (an inverted FlatList with a Reanimated motion
system, see `message-list-v2.md`) became a glass house. Every small
change risked breaking something else, and on 2026-10-22 an OTA built
from #255 dropped to about 5 FPS when older messages loaded in Shawn's
real group chat. It had been fine in testing. The causes are structural:

1. **The motion depends on timing we don't control.** A layout change
   happens at once and a transform hides it as it eases away, so both
   must reach the screen in the same frame. Reanimated 4.5 on RN 0.86
   holds layout back while React commits but sends transforms straight
   away, so they drift apart whenever React is busy. The trick that used
   to hold them together (`IN_COMMIT`) silently stopped working after an
   upgrade. Fixes became a matter of which frame things land in.
2. **JavaScript sits on the path from data to screen.** Every row is a
   React tree with its own animation setup. A page of older messages
   means JavaScript builds dozens of them, and the main thread then
   mounts hundreds of views in one frame. Media makes it worse. When
   that frame takes 100+ ms instead of 16, you get the 5 FPS.
3. **We tested in conditions too gentle.** A simulator on a fast Mac,
   bots that only send text, and mostly dev builds. Nothing measured a
   production build on a phone with a media-heavy chat before a release.

### Why native fixes this

- **Small, bounded work per frame.** The list asks for one cell just
  before it comes on screen, only for what's visible plus a few ahead,
  on the thread that draws. A page of older messages arriving costs
  data, not a burst of view creation.
- **Cells are recycled.** About 20 cell views are reused, so showing a
  row is "set this text, set this image", not "create 40 views".
- **Heights are known in advance.** They're computed from data (text
  size, image dimensions), off the main thread if needed, and cached.
  Older pages go in above the reader with the scroll offset adjusted in
  the same layout pass, so nothing moves on screen.
- **Animations happen in one transaction.** Batch updates insert rows,
  move the others, and animate them in a single UIKit transaction on
  the main thread, with no second thread to fall out of step with. The
  animations run in the render server, so they stay smooth even when
  the app is briefly busy.
- **JavaScript leaves the critical path.** It sends data and changes.
  A busy JavaScript thread slows how fast data updates, not how
  smoothly the list scrolls.

## Decisions

### Native draws; JavaScript decides what to draw

Native knows how to draw, scroll, and animate. JavaScript decides what to
show, what it means, and what happens when it's touched. Keeping that line
clean means almost every change ships as an OTA update.

- **Native draws everything common:** text bubbles, stacked rows,
  photos, videos, files, link cards, quote and reply cards, reactions
  (tapbacks and chips), lines under a message ("1 reply", "Edited",
  "Not sent"), time headers, notices, and the typing indicator. These
  are on screen all the time and must be fast.
- **Messages are built from blocks.** Native has a small set of
  primitives: text with styled spans (mentions, links, emphasis), media,
  file, link card, quote card, and footer lines. JavaScript maps each
  message onto them. A new message type made from existing blocks needs
  no native build.
- **Reactions are data.** Native draws "a reaction" (its content and
  count) without knowing which reactions exist. Content is an emoji,
  which is just text, or later an image URL for custom emoji. The
  picker and the menus stay in JavaScript. Going from today's 8
  reactions to any emoji, or adding custom ones, ships over the air.
- **Look and words come from JavaScript:** colors, spacing, fonts,
  radii, animation timings, and every label are passed in as values.
- **Behavior is decided in JavaScript.** Native reports events (a
  message tapped or held, a reaction tapped, the list reaching the top
  or bottom, visible range changes). JavaScript acts on them: opening
  threads and menus, toggling reactions, loading pages.

### An escape hatch for what native can't draw yet

A row kind native doesn't support can be rendered by React inside a
native cell. It's slower, which is fine for a rare or experimental row
(a poll, a custom card), and it works until the native version ships in
a store build. Common rows never use it: a list full of these would be
slow again. A row kind moves to native once it becomes common.

### A versioned contract that's safe over the air

- **Version the contract.** The native list tells JavaScript its
  contract version and which blocks and row kinds it supports.
- **Check before sending.** JavaScript only sends what the installed
  binary supports. Anything else uses the escape hatch or a plain
  fallback.
- **Ignore the unknown.** Native ignores fields it doesn't recognize
  and never crashes on them.

An OTA update can therefore never break the list on a phone with an
older build. That phone just draws the new thing more simply until it
updates.

### Shipping it

- **The native list ships behind a switch, and the current list stays
  in the app.** The switch can be flipped over the air, globally and
  per account. If the native list misbehaves, it's flipped back with no
  store build.
- **Shawn tests it first** in the production app, in his real group
  chat: switched on for his account, or in a production build made just
  for him. When he says it's good, it's switched on for everyone over
  the air.
- **One store build introduces it.** The native work is front-loaded
  so it settles fast. Later native changes are batched into occasional
  store builds, so people aren't sent to TestFlight every few days.
  Iteration after that happens over the air in JavaScript.
- **It's switched on only after it beats the current list** on Shawn's
  phone in the same chat, on both the motion check and the device
  performance gate below.

### Guarding against regressions

Shawn wants something that makes regressions in motion and feel hard to
introduce. When the list works it feels as good as iMessage, but with
this many moving pieces it's easy to break. The layers:

1. **The architecture itself.** With motion owned by native and
   JavaScript limited to data, JavaScript changes (the common case)
   can't make the list jank. Only native changes can, so they get the
   heaviest checks.
2. **The motion check** (`scripts/motion/check.sh`). It plays every
   list animation in the simulator, records it, and fails on snaps,
   jump-backs, flickers, and blank frames. It's adapted to the native
   list and required for every native change.
3. **A device performance gate before every release.** A media-heavy
   seeded chat (photos, videos, link cards, reactions, hundreds of
   messages) and a production build on a real phone, measuring FPS
   while flinging up as older pages load and during floods of new
   messages. Releases must pass it. This would have caught the
   2026-10-22 regression.
4. **Native tests** for layout and diffing: heights from data, prepends
   keeping the scroll position, and batch updates matching data diffs.
   Plus contract tests for the JavaScript → native data.
5. **Before/after videos of each native change**, side by side, made
   automatically for Shawn to watch. Some things only a person can
   judge.

## Open questions, to settle before code

- **The data contract:** the message and row shapes, how changes are
  sent (diffs or snapshots, IDs, ordering), and pagination and anchoring
  (opening at a message, jumping to the newest).
- **How cells are built:** UIKit or SwiftUI in cells (UIKit is likely,
  for control and speed), text rendering (TextKit, attributed strings),
  and loading images and video (caching, decoding, downsampling).
- **Integration:** the keyboard and the floating composer, the long
  press lift into the glass menu, swiping to reveal times, threads, and
  the typing indicator handoff.
- **The escape hatch mechanism:** hosting a React surface in a cell
  with Fabric, and keeping its height measured.
- **Android parity** and the order of work: iOS first, Android behind
  it.
- **Accessibility:** VoiceOver and TalkBack for every native cell.
- **The plan to start with:** the first priority after the hotfix is a
  short iOS spike (text, photo, and link cards; prepending older pages
  while flinging; animated arrivals; the keyboard), measured on Shawn's
  phone against the current list. Then the plan above.

## Meanwhile

- The 2026-10-22 production lag is being fixed in its own hotfix thread
  (`t3/hotfix-older-messages-lag`), from main.
- No new feature work on the React Native list. Only fixes that keep it
  usable until the native list replaces it.
- PR #258 (`t3/message-list-performance`) holds the last round of work
  on it: cheaper rows, the motion fixes, the firehose, opens that don't
  hang, the motion check, and memory findings. Parts that aren't about
  the list (opens from notifications, Convex, memory, avatars, the motion
  check) can be split out and merged on their own. The rest is
  reference for the native rebuild (`message-list-v2.md` has the log).

## Building it (started 2026-10-22, evening)

Shawn wants it done as fast as possible, on iOS and Android, because the
current list is unusable in his friends' busiest chat even after the
hotfix (#265).

### The contract

`apps/mobile/src/features/native-list/contract.ts` is the contract. Its
version and its rules are at the top of the file. Every platform builds to
it, and changing it means changing both sides. The JavaScript binding is
`native.ts` beside it. The native code is
`apps/mobile/modules/message-list/` (an Expo module: `ios/` in Swift,
`android/` in Kotlin), registered as the module `MessageList` with the view
`MessageList`. Its constant `support` reports the contract version and the
row kinds and block types it draws.

### Branches and threads

- `t3/native-message-list`: the contract and this plan. Everything merges
  here, then to main in one PR.
- `t3/native-message-list-ios`: the Swift implementation.
- `t3/native-message-list-android`: the Kotlin implementation.
- `t3/native-message-list-js`: the JavaScript side. It maps messages to
  rows and blocks, handles events (menus, threads, reactions, the photo
  viewer), runs the switch, adds the store-update prompt, and keeps the
  React Native list as the fallback.

Each platform thread touches only its own directory, so they merge
cleanly.

### What it must do (from the current list; match it, don't redesign)

- **Inverted:** newest at the bottom, opening on the newest message (or
  `initialRowId`, centered and tinted).
- **Older pages:** `reachedOlder` fires `loadAheadScreens` screens from
  the top. They're inserted above the reader without moving anything, and
  a fast fling never hits the top while pages load.
- **New messages (`arrived`):** at the bottom, the messages above make
  room over `moveMs` and the new one rises in and fades in (`fadeMs`).
  Scrolled up, nothing on screen moves. Past `firehoseFrom` arrivals in
  `firehoseWindowMs`, rows show at once with no animation, until it's
  down to `firehoseUntil`.
- **Bubbles:**
  - iMessage shapes and colors, tails on the last bubble of a run, and
    jumbo emoji.
  - The sender's name over a run in groups, and a photo by the tail.
  - Times revealed by dragging the list left.
- **Stacked:** a photo, name, and time over a run; every message
  left-aligned.
- **Reactions:**
  - Bubbles: tapbacks over the top corner, up to three fanned and the
    newest in front.
  - Stacked: glass chips under the message.
  - Adding one pops it in, removing one shrinks it out, and the messages
    make room smoothly with no jump. Tapping a chip toggles it (a `press`
    with `reactionKey`).
- **Media:**
  - One photo or video alone.
  - Several in stacked rows: an edge-to-edge horizontal carousel that
    snaps item by item, each item with its own reactions.
  - Several in bubbles: a stack of cards swiped left and right, like
    Messages.
  - Tapping reports the index, so JavaScript opens the viewer on that item
    and swipes through the whole group. The branch
    `t3/stacked-media-carousel` has the design in React Native (not
    merged): use it as the reference for how it should look.
- **Link cards, files, quotes, and footer lines** ("2 replies" with
  photos, "Edited", "Not sent").
- **The typing indicator** at the bottom:
  - bubbles: a bubble of dots with photos;
  - stacked: photos, a label, and dots.
  - A message from someone typing grows out of their indicator.
- **The keyboard:** follow it frame by frame, and dismiss it
  interactively by dragging the list.
- **Holding or double tapping** a message or part sends `hold` with its
  frame. JavaScript opens the glass menu with its own copy, and native
  hides the row while `liftedRowId` is set.
- **`visible`** reports the rows on screen (read marks), and
  `nearLatest` drives the jump-to-latest button.
- **Accessibility:** each message is one element, read from
  `accessibilityLabel`. Its links, media, and reactions are buttons.

### Switching to it, and getting people onto it

- The switch is decided in JavaScript, so it ships over the air. The
  native list is used when the binary has it (`nativeSupport` isn't
  null), the contract version matches, and it's switched on. That's off
  by default at first and on for Shawn's account (and in Developer
  settings). Shawn tries it in the production app; when he's happy, an OTA
  update turns it on for everyone. The React Native list stays as the
  fallback until the native one has proven itself.
- **Forced store update:** a binary without the native list can't use it.
  So an OTA update adds a prompt for people on an older binary: "Update
  Vera" with one button that opens Vera's TestFlight page (on Android,
  wherever Shawn's Android friends install it). They update, open the app,
  and they're on it. The app already has an overlay for forced OTA
  updates (`features/updates`). This is its store-build twin, shown when
  `nativeSupport` is null and the minimum is a native-list binary.

### Done when

- iOS and Android draw every row kind and block type above, matching the
  current list.
- Flinging up through a media-heavy chat of hundreds of messages (a seed
  with photos, videos, link cards, and reactions) holds 60 fps in a
  production build. Floods of new messages too.
- The motion check passes for every scenario, both layouts.
- Shawn has tried it in his real group chat in the production app.

## Integration (2026-10-23, overnight)

`t3/native-message-list-integration` merges #266 (JavaScript), #277 (iOS)
and #275 (Android) without merging the PRs, wires the native list into the
real app, and checks it against the React Native list in a seeded busy
group (`devBusy:seed '{"count":600,"livened":300}'` from `t3/data-pass`,
brought over unchanged) on an isolated backend.

### The switch

- On by default in dev builds (`NATIVE_LIST.byDefault = env.devTools`),
  off in production until Shawn turns it on over the air.
- A "Testing" section on a conversation's info page (tap the header) has
  the switch in dev builds and for `NATIVE_LIST.testers`, so the two
  lists can be compared in the same chat: flip it, go back. It's also in
  Developer settings (dev builds) and More → About (testers, production).
- Scripts: `veraDev.nativeList(true|false)` flips it and returns which
  list conversations show (`"native"` or `"rn"`).

### Motion check

`scripts/motion/check.sh` (from `t3/message-list-performance`) tests the
native list by default and the React Native one with `MOTION_LIST=rn`. It
flips the switch first and fails a scenario that shows the other list.

### Contract additions from the integration

All optional, so older binaries and older JavaScript keep working:

- `insets.keyboardOverlap`: the composer rises by the keyboard minus its
  own bottom inset (20 pt on iOS), not minus the safe area, so without it
  the newest message sat 14 pt behind the composer with the keyboard up.
- `keyboardFrozen`: held while the long-press menu's modal has the
  keyboard down (iOS), as `useMenuKeyboard` does for the React Native list.
- `alignTop`: threads start at the top, under their original
  (`useBlankSpace`).

### What the comparison found

- Opening at a message in the busy group: the native list is placed and
  showing at once. The React Native list stalled JavaScript for 15 s and
  more (`VirtualizedList … dt: 15695`) and the app didn't answer for most
  of a minute.
- Stacked text in the React Native list sets no line height, so it's San
  Francisco's own (20.3 pt at 17); bubbles set 22. The theme now sends
  20.3 for stacked body text.
- iOS draws bubble text at 21.2 pt line spacing instead of 22, and
  bubbles 4.5 pt narrower than the React Native list's 75% of the row
  (sent to the iOS thread).

### Motion check, first run (iOS simulator, busy group)

`MOTION_LIST=native`: 16 of 18 scenarios pass (arrival, typing to a
message, reaction on and off, first reply, send, edit, delete, in both
layouts). Both firehoses fail on jump-backs: `dev:burst` sends each message
at a random moment around its slot, so later messages land between rows
already shown, which a firehose shows at once. The React Native list fails
the same scenario worse (bubbles 6 failing, stacked 11 with a blank band,
against native's 7 and 1).

### Codex handoff and comparison audit (2026-10-23)

Recovered the interrupted run with a clean worktree at `01150da0`.
The Android build had finished and its production bundle eventually
connected to Metro's debugger. Confirmed `__DEV__` is false before testing.
Merged iOS `8c31dc3c` and Android `dab9c9b7`, then Android's conservative
pagination estimate, `49e6ae66`. Final phone builds wait for both platform
threads' explicit native-ready SHAs.

The first Android diagnostic used 5,500 dp/s for 10 seconds and 150
arrivals over 15 seconds in the original busy group:

| Scenario | List         | Main frames over 16.7 ms | Worst main frame | JS stalls over 50 ms | Worst JS gap | Distance / edge wait |
| -------- | ------------ | ------------------------ | ---------------- | -------------------- | ------------ | -------------------- |
| Fling    | React Native | 60 / 390                 | 62.1 ms          | 60                   | 676 ms       | 27,919 dp / 5,133 ms |
| Fling    | Native       | 11 / 401                 | 57.4 ms          | 33                   | 398 ms       | 39,874 dp / 2,533 ms |
| Burst    | React Native | 167 / 420                | 127.3 ms         | 104                  | 889 ms       | n/a                  |
| Burst    | Native       | 0 / 112                  | 6.5 ms           | 17                   | 67 ms        | n/a                  |

These are diagnostic numbers, not the final comparison. That script ran
the React Native burst before the native fling, adding 150 text messages
to its starting data. It also captured only Android main-thread work,
without `sim.sh frames` or the queue's protection against device boots.
The native burst was checked afterward and did show its newest message.
The loaded-edge wait was sent to Android, which found that tall visible
media could delay requesting short rows above it. JavaScript sends
`loadAheadScreens: 3`.

The corrected comparison runs both flings before either burst and captures
UI frame timing on both platforms, plus Android main-thread work. It
checks the production bundle and the mounted list. A new 600-message,
300-livened seed prevents earlier test bursts from burying the media.
Its ID is in `.cache/bench-clean-seed.json`; results and evidence stay in
`.cache/`, not Git.

`scripts/sim.sh build` caches a native client without entering the device
queue. Run it through `scripts/bench/with-lock.sh`, then `sim.sh up`
outside the lock. The motion check now accepts `--android`.

The simulator never reproduced the 5 FPS in Shawn's real chat. These
measurements establish a floor; his phones remain the performance test.

## iOS implementation check, 2026-10-23

PR #277 targets `t3/native-message-list`. The iOS module now supports the
real-view lift, press shrink, cached deck blur, React custom rows measured
by Fabric, and oldest-first accessibility order with paging. The lift uses
JavaScript's menu geometry and spring, then returns the same views during
the menu's 240 ms close. Plain stacked text gets the existing menu card.
`NativeSupport.features` advertises `lift`, `customRows`, and `benchFling`.

The integration thread owns real-app parity checks, the head-to-head
against React Native, and the phone clients. It supplied `keyboardOverlap`,
`keyboardFrozen`, `alignTop`, and the `replies` header style. iOS copies the
contract fields and the React Native divider's measurements. Its native
height and diff suite has 33 checks, run with
`apps/mobile/modules/message-list/ios/Tests/run.sh`.

The native benchmark drives `setContentOffset(animated: false)` on a
display link, towards older messages, and reports distance and edge wait.
The dev-screen baseline at 5,500 pt/s travelled 44,000 pt in eight seconds
with no edge wait. The 9.767-second frame capture had five slow frames,
worst 43.9 ms. It includes the button tap that starts the benchmark and is
not a comparison with React Native. The integration thread must compare
the same data, production bundle, speed, and duration. The simulator has
not reproduced the reported 5 FPS in Shawn's chat; the phone test remains
the release gate.

## Final integration checks in progress, 2026-10-23

Both native owners explicitly marked their binaries ready: iOS `6b264fa2`
and Android `a3615b73`. Both are merged into the integration branch.
Android's optional `liftHandoff` feature adds `landLift(): Promise<void>`.
The app clears its lift prop and starts native landing and the menu's
240 ms fade together. It removes the Modal and runs the chosen action
only after both finish. Older binaries and iOS retain their current close
timing. Duplicate close taps are ignored. Android verified two photo
open/close cycles with no analyzer flags across 103 changed frames.

The first fair combined iOS production-bundle run used three-screen page
lead on both lists, 5,500 pt/s for ten seconds, and 150 arrivals over
15 seconds. No native builds or device boots overlapped.

| Layout  | Scenario | RN slow / frames | Native slow / frames | RN worst | Native worst |
| ------- | -------- | ---------------- | -------------------- | -------- | ------------ |
| Bubbles | Scroll   | 85 / 596         | 4 / 727              | 128.9 ms | 40.5 ms      |
| Stacked | Scroll   | 69 / 629         | 1 / 729              | 60.8 ms  | 43.7 ms      |
| Bubbles | Burst    | 167 / 1001       | 3 / 1236             | 91.7 ms  | 36.8 ms      |
| Stacked | Burst    | 169 / 1024       | 5 / 1249             | 69.1 ms  | 43.4 ms      |

Bubbles travelled 47,461 pt with 707 ms of loaded-edge wait on RN, versus
54,703 pt with 50 ms on native. Stacked travelled 51,390 pt on RN and
55,000 on native, both with no wait. Native page lead is now five screens
to give network/JavaScript more time during fast scrolling; a fresh media
seed is queued for the follow-up. RN keeps its existing three screens.
The final report must distinguish this tuning from the baseline above.

Real-app iOS checks on the final binary include both layouts and themes,
photo viewer opening/return, a composer send with the keyboard up, thread
original/replies placement, reaction count on/off, anchored opening,
jump-to-latest, and menu open/close. Carousel item reactions target the
selected attachment. Gesture recordings and the full motion script are
still being collected. Filled iOS stacked reaction chips remain an
explicit visual difference from RN glass; the native owner retained them
after measuring the glass cost.

The active PR is #284 against `t3/native-message-list`, still draft while
final evidence and phone builds are pending. No PR has been merged.

### Revised phone deliverable

Shawn changed the final deliverable to private production-config preview
builds, replacing the planned dev clients. `preview` extends production
configuration, uses `vera.chat` and `chat.vera.app`, and has its own update
channel. iOS is ad hoc Release; Android is a locally signed APK. Upload
only to install pages. Submit nothing to App Store Connect, TestFlight, or
Play, and publish no production OTA. Preview defaults the native list on
and exposes its switch in conversation info and More → About for every
account. Store builds keep their previous default.

`pnpm release plan` at `0c34b774` reports three backend differences from
`backend/deploy/20261022T232315`: devBusy.ts, devFullSeed.ts, and generated
API declarations. They only add/change development seed helpers. Normal
app APIs, protocol, auth, and schema are unchanged; the preview needs no
production backend deploy. Production breaking version is 3, matching the
app source. The live Android association file and production passkey
origins include the EAS production certificate E6:A1:C5:45…44:5F, as well
as Google's Play certificate. Verify the actual APK certificate after
building. EAS preview channel/branch were created empty, with no OTA.

iOS installs over TestFlight using the same application identifier/team;
verify the built entitlements and keep the existing app container. Android
requires uninstalling the Play copy because its signer differs, then
signing in again. Server conversations and passkeys remain with the
account/provider. Returning to Play requires another uninstall/reinstall.
Report final measurements and install links to orchestrator thread
`mcp:e2458cbe-16a5-437c-94b3-475f2a786cb1`, plus the full report here and
in #284.

Final iOS motion script result is native 16/18 and RN 12/18. Native
firehoses have 1 bubble and 6 stacked flags, versus RN's 18 and 21. iOS
reviewed all four native windows. The bubble message moves monotonically
up; stacked samples replace complete batches after 0.63–1.09 s gaps. The
analyzer searches only ±40 pt and has no row identity or timestamp-gap
gating, so repeated Firehose labels/avatars can correlate incorrectly. No
confirmed native reversal or hide/show defect was found. Keep the formal
flags and the limitation; this is not an all-pass motion gate. Native SHA
remains 6b264fa2, and its owner's devices and Metro are down.

### Final iOS production-bundle comparison

The five-screen native prefetch recheck used a fresh 600-message media seed,
5,500 pt/s for ten seconds, then 150 arrivals over 15 seconds. Both lists
started with 50 loaded messages. Capture FPS includes settling and driver
round trips. There were no concurrent builds or device boots.

| Layout  | Scenario | RN capture FPS | Native capture FPS | RN slow | Native slow | RN worst | Native worst |
| ------- | -------- | -------------- | ------------------ | ------- | ----------- | -------- | ------------ |
| Bubbles | Scroll   | 49.4           | 59.8               | 84      | 2           | 73.2 ms  | 35.6 ms      |
| Stacked | Scroll   | 52.4           | 59.7               | 72      | 4           | 83.3 ms  | 38.6 ms      |
| Bubbles | Burst    | 47.2           | 59.6               | 163     | 9           | 80.1 ms  | 39.3 ms      |
| Stacked | Burst    | 50.8           | 59.6               | 157     | 8           | 75.0 ms  | 40.7 ms      |

Native scrolled 55,000 pt in both layouts with zero edge wait and loaded
50 → 450 rows. RN bubbles scrolled 48,097 pt with 483 ms edge wait,
50 → 350 rows; RN stacked scrolled 51,000 pt with zero edge wait,
50 → 400. JS stalls above 50 ms fell from 60/67/101/108 to 5/5/12/12
in the table's order. This improves the baseline but does not satisfy a
zero-slow-frame claim. Shawn's real group chat remains the phone gate.

Native dark-mode motion passed 17/18 scenarios. Only stacked firehose
failed, with two failing and six minor flags. Light-mode results and the
analyzer limitation above remain unchanged. All three runs had zero Metro
errors. Real-app media verification also exercised selected-photo viewer
opening after carousel swipe, deck swipe, video playback, photo menu
open/close, avatar and mention profile navigation, URL opening in the
in-app browser, and the timestamp swipe. Recorded evidence is in .cache.
The iOS simulator and Metro were brought down after capture.

### Android final-pass gaps and transport check

The first final Android capture was discarded after the dev client crashed
in OkHttp 4.12.0's WebSocket deflater cleanup. Both RN inspector and app
sync use this provider. A live sync handshake accepts permessage-deflate,
so the production app can reach the affected code path. This establishes
source exposure, not observed production incidents. No app crash telemetry
SDK is configured. A read-only Play Developer Reporting request returned
403 SERVICE_DISABLED; no API was enabled or console opened.

Profiling Metro now declines compression on /inspector/device and
/inspector/network only. A real WebSocket handshake test confirms both
inspector endpoints stay uncompressed while an ordinary application
endpoint still negotiates compression. Failed frame captures also release
the simulator queue's measurement slot. Android is adding an early shared
OkHttp provider policy to disable outbound WebSocket compression while
retaining existing client configuration and inbound compression.

Real-app carousel QA found that holding the third photo in a captioned
stacked row lifted its caption instead. Android's containing-block lookup
must match every media item's part, not only the lane part. The same pass
caught an eager recycle-on-detach crash during ScreenStack viewer
navigation; both native fixes must be verified in the combined client.

The Android viewer's Compose Close button did not invoke its handler in
both single-photo and group viewers, including with an explicit host size.
It now uses a React Native button with Material close symbol and a 48 dp
hit area. The real app's close action returned to the conversation, and
an after-fix recording/screenshot were captured. Temporary probes were
removed. Carousel/keyboard/media QA continues before final phone builds.

Final Android source is now ada19507. It adds the early shared-client
outbound compression policy, containing-block lookup for all carousel
item parts, and detach/reparent hardening. Eleven message-list JVM tests,
two networking tests, and plugin startup tests pass. A negative-control
host test reproduces the prior attached-view exception with eager detach
recycling enabled, then passes with the normal detach policy.

The combined native client passed a wire test with 25 native app WebSocket
exchanges. Compression was negotiated on every connection, every outgoing
client frame had RSV1 clear, and all 25 compressed server echoes had RSV1
set and decoded correctly. Twenty repeated inspector attach/detach probes
also passed. The fresh fatal logcat buffer was empty. Three real-app
third-photo menu-close/viewer-open/close cycles passed with snapshot guards.
The first recording transfer was lost in subsequent emulator cleanup, so
the same guarded cycle is being recorded again before final delivery.

The theme mapper omitted the contract's existing backgroundElevated field.
It now sends the same CSS background as RN link cards, fixing their black
instead of elevated gray background in dark mode. Android before/after
screenshots are required; iOS screenshots will be refreshed too.

Final Android FPS captures were discarded after ADB lost emulator-5644
and the queue reclaimed it. The launcher now chooses free standard console
ports 5560–5584, within ADB's discovery range, instead of ports through5658.
No queue daemon/config was changed or bypassed. Measurements must be rerun.

iOS scroll-video blank flags were reviewed separately. They all occur as
the same hay-bale photo crosses the viewport, whose large white sky is
classified as a blank band in both lists. First and last flagged native
frames show the complete image moving through, with no missing row.
Flung rows also exceed the analyzer's 40 pt matching range; its movement
flags during these fast scroll clips are not a motion pass/fail result.

### Final Android capture recovery

Android source-ready advanced to 4f87adfe, merged on top of ada19507.
Incoming URL spans now inherit the actual row text color, matching RN;
mentions retain accent and outgoing links retain onAccent. Its native
compile, eleven JVM checks, ordered pnpm checks, and all nine CI checks
passed. This paint-only change needs the final combined binary.

The emulator remains on a standard console port. Profiling now uses
10.0.2.2 for Metro, avoiding loss of its debugger connection when an ADB
reverse mapping disappears. Recorders detach from the launching tool,
finish writing their MP4 index before their adb shell exits, and stop
only their own remote PID. Videos transfer without redundant ADB
compression. Failed captures and incomplete MP4s are discarded.

Valid Android scroll captures are 20261023-132229 and 20261023-132616.
Both use the same fresh 600-message group and 5,500 dp/s for ten seconds,
with production JavaScript and native ada19507. No builds or boots
concurred. Bubbles RN/native: 38.0/55.1 capture FPS, 132/51 slow intervals,
166.7/50.0 ms worst interval, 73/19 JS stalls, 44,396/55,091 dp travel,
367/0 ms edge wait. RN started with 50 loaded rows; native's normal
prefetch had already loaded 100. Stacked RN/native: 55.5/58.9 FPS,
52/13 slow intervals, 50.0/50.0 ms worst, 65/14 JS stalls,
44,858/55,091 dp travel, 1,850/0 ms edge wait, both starting at 50 rows.
Native ended at 450 loaded rows versus RN's 350 in both layouts.

Main-thread samples over 16.7 ms were 146/367 versus 2/548 for bubbles,
and 47/516 versus 1/586 for stacked. Bubbles main-thread p90 was
48.9/5.1 ms; stacked 16.0/4.4 ms. These distinguish app layout work from
software-rendered emulator intervals. Mac CPU during bubbles was 59/79%
average, 81/91% peak; report this load and do not claim a quiet-host or
zero-slow-frame gate. Burst measurements and motion review follow.

Final Android bursts are 20261023-133640 and 20261023-133840.
Bubbles RN/native: 28.4/59.5 capture FPS, 143/9 slow intervals,
2,400/50 ms worst flagged interval, 91/25 JS stalls. Main-thread samples
over 16.7 ms: 151/409 versus 0/97, worst work 2,392/9.1 ms.
Stacked: 55.2/60.0 FPS, 76/0 slow intervals, 66.7 ms versus no flagged
interval, 65/22 JS stalls. Main work over 16.7 ms: 70/257 versus 0/69,
worst 60.6/2.6 ms. Burst host CPU averaged RN/native 46/16% bubbles,
31/16% stacked; no builds or boots overlapped. These are sequential bursts
in the same chat, so histories grow, with normal prefetch/cache behavior.
The full final numbers and qualifications were sent to the orchestrator.

The final integration simulator clients are Android fingerprint
74e6d0b780c70a55b1a4fd913bdda567e45a871d and iOS
2c4ffa31b9fe514107b8d08519d168b6401cabac. Both compile. Final dark-card
screenshots verify the shared elevated background on both platforms, and
Android incoming URLs now inherit row text color. The eight Android
RN/native × bubbles/stacked × light/dark screenshots were refreshed.
Actual Android composer fill/send, keyboard placement, opening its thread,
sending a reply, and the reply divider were exercised. Emulator notification
permission was revoked to keep bot notifications out of captures.

The first Android motion set was invalidated after frame review found a
Pixel Launcher ANR dialog over it. Vera's fatal buffer stayed empty. The
system alert was dismissed through agent-device, and the contaminated
folder is marked invalid-launcher-anr. The clean native replacement is
20261023-140922: 16/18 scenarios pass with zero Metro errors. Only firehose
is formally flagged: bubbles 4 failing/3 minor in 51 changed frames,
stacked 1 failing/3 minor in 53 changed frames. The Android owner has the
exact windows for source/frame review. RN is running the same scenarios.
The preserved scroll/burst numbers predate this launcher ANR and are separate.

The matching clean Android RN run is 20261023-141800: 12/18 with zero
Metro errors. RN firehose has eight bubbles and ten stacked failing flags;
other flagged scenarios are bubbles first reply/send/delete and stacked
first reply. Native has only the two firehose scenarios flagged. The
Android source review found no reverse-scroll path or confirmed native
defect. Row-identity review of the short native windows remains nonblocking.
`pnpm release plan` was refreshed at 97d1b670 before the private builds;
backend differences are still only the previously reviewed dev helpers.

The Android owner completed row-identity review without changing code.
Bubbles Firehose1 stays present and moves monotonically upward through
3.435–3.552 s. The apparent 35 pt matches belong to other repeated rows
while actual updates exceed the 40 pt search. Stacked's neighboring
captures are 6.754/7.190/7.636 s; Firehose27 moves from bottom to top,
then 33/31/34/35/36/37 keep order and move upward. No missing or reversing
row was observed. Retain the formal 16/18 analyzer result and this manual
alias disposition; thresholds were not widened.

Final third-photo QA on 4f87adfe passed three guarded hold/land/viewer/close
cycles, with the correct antler image lifting and returning. Later the
2 GB Android guest entered system-wide swap thrashing and lowmemorykiller
killed Vera plus numerous system apps. Vera's kill freed 840,848 kB RSS
and 1,139,368 kB swap; the Java fatal buffer was empty. Retained pushed
conversation screens are a driver hypothesis, not an established cause.
The preceding numeric and clean motion captures remain separate evidence.

A bounded fresh-launch ordinary photo-three flow then passed three more
hold/menu/viewer/close cycles without adding conversation routes. PID14553
survived throughout. Baseline and cycle PSS, kB: 712675, 745084, 751466, 752836. RSS: 783644, 542256, 527472, 510304; swap PSS: 25493, 281422,
302288, 320242. The growth tapered to 6.4 MB then 1.4 MB. dumpsys activity
showed two native Screen views and the same two unique ScreenStackFragments
before/after. This ordinary path did not reproduce the kill. Keep the
stress-session memory limit unresolved for phone testing; no heap audit or
new native code was added.

The Android video route and controls opened, but playback screenshots were
black in this software-GL emulator. No decoder exception was found. Full
photo viewer/Close is verified; Android video rendering remains a physical
phone check. iOS moving-timestamp playback is verified. Do not describe
Android playback as visually confirmed.

Final Android side-by-side evidence has both layouts for fling, burst,
reaction and hold, RN left/native right. These short visual clips are
separate from the numeric captures: six-second flings, firehose sixty
messages over six seconds, and stacked reaction on/off assembled from
the clean motion cases. The hold driver now excludes aggregate list and
scroll-area accessibility nodes when selecting a message. Final ordered
lint/typecheck/test/React Doctor against origin/t3/native-message-list,
then format:fix all pass. Both devices and Metro are down. Private preview
builds are the remaining deliverable; no store submission or OTA occurred.

Private iOS build began 2026-10-23 14:42 EDT from 7be83bbb using
`eas build --local --profile preview`. Both production-identity ad hoc
credentials are ready and Release archive compilation is underway.
Android follows serially. No build was submitted to a store or TestFlight.

iPhone preview build 10 succeeded at 14:48 EDT. Strict code signature,
ad hoc provisioning, production push entitlement and associated domains
pass. Runtime 6e60a1ac81b3d72068021adf0711d38c0f5fc75e matches the production
source fingerprint. Embedded JS contains vera.chat and no isolated backend
hostname. Prior store archive 9 and this IPA have the same application ID,
team and implicit keychain configuration. Install over Vera without deleting
it to preserve sign-in/data; return by reinstalling TestFlight's Vera.
The HTTPS install page, manifest identity and delivered IPA size are verified:
https://vera-evidence.b-cdn.net/preview/ios/20261023-7be83bbb-f0a3d139d4a0/index.html
The ready link and switch location were sent immediately to the orchestrator.
Android private preview began at 14:48 EDT and continues independently.

Android preview build 7 succeeded at 14:55 EDT. The APK is non-debuggable,
package chat.vera.app, with vera.chat in its embedded bundle and no isolated
hostname. Compiled channel is preview; runtime
23784f5af2957fcfbdce43fd9cf78f0b70db3e98 matches the production source
fingerprint. The actual EAS certificate E6:A1:C5:45:24:F8:8C:7B:57:A9:66:9F:
DF:D5:23:0B:5A:86:83:8F:F3:16:E1:1C:F7:A1:95:E3:B2:10:44:5F matches live
production assetlinks and the passkey origin allowlist. This authorizes
passkeys and invite links; physical passkey sign-in is not yet tested.
The HTTPS install page, APK URL and delivered byte count are verified:
https://vera-evidence.b-cdn.net/preview/android/20261023-7be83bbb-95cc421bdbd7/index.html
Uninstall Play Vera first, install, sign in again. Server messages remain;
local session/drafts/unsent messages/cache are removed. Return by uninstalling
preview and reinstalling from Play. Both install links and these facts were
sent to the orchestrator as soon as each was ready. Native defaults on and
flips immediately at conversation title/details → Testing → Native Message
List, also More → About → Testing. No stores or production OTA were used.

## Phone feedback round, 2026-10-23 evening

Shawn installed the private previews (iOS build 10, Android build 7) on
his actual iPhone and his Samsung Galaxy A16, and reports a dramatic
improvement on both, including the cheap Android phone. That is not
approval to merge or release. Keep every performance and real-content
lift gain while fixing what's below.

Owners: **integration** is the integration Claude in this checkout (shared
JavaScript, composer, fullscreen media viewer, optimistic-data mapping,
contract.ts, this plan, the PR text, docs/next-release.md). **iOS** is
the iOS native thread (#277), **Android** the Android native thread
(#275). Native files are read-only here. Contract changes go through
`.cache/claude-integration-polish/20261023-163203/contract-proposal.md`
and need both native owners' agreement first.

"Confirmed in source" means the code path was read and does what the
report describes. A fix is verified only once it's checked on a device,
and the items Shawn raised only on his phones close only when he checks
them on his phones.

### Status (simulators checked; both Vera Dev clients delivered; Shawn's phone checks pending)

- Now: the last source commit is `06003b06`, with all 9 CI checks green
  there. Later commits are docs only. It
  includes iOS `4cdb168d` (the glass default, with the `5cca8d96`
  exact-tile lift correction), Android `31c72259`, and the hidden jump
  button's accessibility fix. No data-pass merge. See "Delivered
  checkpoint: both platforms and both phones, 2026-10-23 late" below; "Final iOS
  checkpoint, 2026-10-23 evening" has iOS's numbers.
- First inputs (historical): this branch at `78d4c94c`, with iOS
  source-ready `cd09c26440b079522c06bec9820236f51a0e89bb` and Android
  source-ready `31c7225980822283b468356d39c6b75af79fd36a` merged in
  cleanly, plus integration's shared changes, since committed.
- Contract revision 3 is adopted in contract.ts, accepted by both native
  owners: `hold.element`/`reactionKey`, reaction `press.frame`,
  `TypingRow.showFaces`, no feature flag.
- Done in shared JavaScript, with focused tests: reaction routing and the
  menu's part (`reaction-events.ts`), rapid toggles
  (`reaction-toggles.ts`), the composer glass (`glass-hold.ts`) and
  Android's empty field (`empty-field.ts`, `field-text.ts`), typing
  faces and the per-person hold (`typing-hold.ts`), the viewer's
  coordinates, backdrop, early index and caught springs
  (`photo-pager.ts`), the outdated-runtime gate (`store-gate.ts`,
  `watch-outdated-runtimes.ts`, `release.outdatedRuntimes`; off),
  `devMixed:seed` with reactions on the parts the app draws, and the
  frame report's fixed thresholds (`frame-summary.ts`).
- Dictation: a source-backed candidate. It needs iOS built from source
  (`with-react-native-from-source.cjs`) and the react-native patch. The
  final simulator build compiles the patched file for both architectures
  (below). The symptom is still unreproduced and unverified until Shawn
  checks it on his iPhone.
- Root checks, in order, on the final source, all passing:
  `pnpm run lint` (15 tasks), `pnpm run typecheck` (17), `pnpm run test`
  (mobile 194, backend 41, jest 3 suites and 7 tests),
  `pnpm run react-doctor --base origin/t3/native-message-list` (no
  issues), then `pnpm run format:fix`. Logs are in
  `.cache/claude-integration-polish/20261023-163203/root-*.log`. Two
  fixes came out of them. `composer-height.ts` no longer imports the
  native-list switch, whose secure store broke the React Native list's
  jest perf test; the screens pass `roomCloses` through
  `useConversationComposerHeight`. And the typing hold now uses one
  timer for the soonest expiry, cleaned up in its own effect (`dueBy`,
  `holdLeftMs`), still per person. After a last review, `holdTypists`
  takes the newest 20 rows (`recentOf`), not just the newest. When Maya's
  and Leo's messages land in one update, both leave the typing row with
  them; before, Maya stayed up to 1 s and the typing row outlived Leo's
  arrival, which blocks the native hand-off. A regression test covers it,
  along with one of two typists sending and more arrivals than the 20
  rows. `devMixed.ts` also uses `.at()` with checks, since the
  regenerated `api.d.ts` now type-checks it under the app's stricter
  settings. CI's React Doctor on the pushed `770858fe` then failed with 9
  `js-set-map-lookups` findings in `typing-hold.ts` (array `includes`
  inside filters). The local run had passed only because the file was
  still untracked; it scanned 66 files, against 85 once everything was
  tracked. The lookups are now Sets, with the same results and order.
  Reproduced and rechecked locally on the 85-file scan, then the ordered
  root checks again: lint, typecheck, test (mobile 194, backend 41, jest
  3 suites and 7 tests) and React Doctor (no issues), all exit 0, then
  `format:fix`.
- Done since (see "Runtime checkpoint: iOS simulator, 2026-10-23
  night"): the isolated backend push and `devMixed:seed`, the combined
  iOS simulator build with the patched text input compiled, iOS
  resting-geometry evidence, the jump-to-latest fix, and the iOS chip
  material measurement (glass now the iOS 26+ default).
- Done since, in the iOS simulator: the `4cdb168d` client compile, the
  glass look check in light and dark with no override, the final motion
  runs, and the final head-to-head (see the final checkpoint).
- Done since, on Android in the simulator: the final head-to-head, the
  motion check (17/18 in light and dark), resting newest-row gaps (8 dp,
  8 samples), the jump button with the keyboard up, three
  lift/viewer cycles of memory, and media, reaction, avatar, typing and
  composer runs. The iPhone's Vera Dev client was verified and delivered.
- Both Vera Dev clients were delivered to Shawn at 21:51 EDT (iPhone
  `ac18b6d7…`, Android `25c41d80…`), and the isolated backend's
  `release:outdatedRuntimes` answers `{ android: [], ios: [] }`.
- Pending: every item below, on Shawn's phones. None is closed by the
  simulators.

### 1. Reactions

Final agreement: contract revision 3, accepted by both native owners. No
feature flag. Native plays the haptic for reaction **taps** (iOS light
impact, Android `CLOCK_TICK`). JavaScript plays the haptic for reaction
**holds** (`impact()`), and Android suppresses its native `LONG_PRESS` for
holds with `element: "reaction"`. Message holds are unchanged this round:
iOS plays no native haptic on any hold, so JavaScript's `impact()` is its
only one, and Android still buzzes twice (native plus JavaScript), a
known, accepted difference.

- [ ] Holding a stacked chip opens the message menu instead of who
      reacted. Confirmed in source, on both platforms. iOS `Cells.swift`
      `hit(at:hold:)` checks chips and tapbacks only when it isn't a hold,
      so a hold falls through to the part under the chip. Android `hold()`
      sends no reaction. Revision 3: a reaction hold sends
      `element: "reaction"` and `reactionKey`, with the `part`, `index` and
      `frame` of the part the reaction belongs to (the media item for an
      item's chip, the front card for a deck's tapback). Native (iOS,
      Android): send it for chips, tapbacks and media-item chips, with no
      native lift. Integration (done, unverified): stacked opens
      `viewReactions(message, part, emoji)`, as the React Native list's
      `PartChips.onHold` does. Bubbles opens the glass menu in reactions
      mode, as a React Native tapback tap does. The menu opens on the
      reaction's own part (`reactionMenuPlace`). If a binary ever reports
      another part (a row's tapback over its text for a reaction on its
      photo), it uses the reaction key's part, so the menu never shows the
      wrong piece's reactors. Tests cover photos, files, link cards, and
      the first photo of a message without text.
- [ ] An iOS reaction tap visibly waits 0.5 to 1 s, with no haptic or
      feedback. Confirmed in source: `MessageListView.swift`
      `tap.require(toFail: doubleTap)` delays every single tap until the
      double tap fails. iOS: a separate reaction tap recognizer with no
      double-tap dependency, a native light haptic, and a stacked chip drawn
      toggled at once until the rows agree or 3 s pass. Android: an
      immediate 0.9 press shrink and a `CLOCK_TICK`, with no native count
      preview unless the A16 measures tap-to-redraw over 100 ms. Two taps
      on a chip are two toggles and never open the menu. A bubble tapback
      tap shows who reacted, as in React Native, instead of toggling; it
      uses the press's optional `frame`, or the sheet without one.
      JavaScript plays no tap haptic. Hypothesis, not measured: the
      full-row rebuild in JavaScript after a toggle adds latency in a
      450-row chat. Measure tap-to-chip time once native is fixed.
- [ ] JavaScript's optimistic toggle (integration, fixed, unverified on a
      device). Confirmed in source: `useReactions().toggle` worked out
      `on` from the reactions last rendered, so two taps before the next
      render both sent `on: true`. Every mutation's `onSettled` also
      deleted the key's stand-in, so an older answer could drop a newer
      toggle's. `reaction-toggles.ts` now keeps pending toggles in a ref
      as well as state, so the second tap sees the first. Each toggle has a
      sequence number, and only the newest one's answer, done or failed,
      lets the key go back to the server's answer, which rolls a failure
      back. Keys stay per message, part and emoji. Tests cover two taps
      before a render, an older answer after a newer toggle, rollback, and
      part isolation.
- [ ] Per-media-item reactions attach to and show on the exact item, on
      both platforms. JavaScript sends each `MediaItem.reactions` with its
      own part, and `parseReactionKey` routes a toggle to the part. Agreed
      placement: stacked chips sit under their photo, as in React Native
      (Android withdrew its overlap). Bubbles deck tapbacks overlap the
      front photo's corner and show only the front card's reactions, on
      both platforms.
- [ ] Glass stacked chips (the old look) instead of solid, only if
      measured affordable. Fill stays the default. iOS has fill, sheen and
      glass in the binary, chosen at launch (`VeraChipMaterial`, on
      integration's own simulator UDID from `scripts/sim.sh status`, never
      `booted`). The protocol is interleaved runs (fill, sheen, glass,
      sheen, glass, fill), a 5,500 pt/s fling for 8 s each, and slow frames
      over 16.7 ms and 33 ms plus the worst frame. The frames report
      (`frame-summary.ts`, printed by the frames-stop command) now reports `over16ms` and `over33ms` (strictly over exactly
      16.7 ms and 33 ms, printed as `thresholdsMs`; a 16.67 ms 60 Hz frame
      isn't counted, a 33.33 ms one is) and `worstMs`, alongside the
      unchanged `slow`, `dropped` and the worst ten.
      No default changes and no performance claim until it's measured.
      Android stays fill (no blur on the A16). Measured since, in the
      simulator (see the runtime checkpoint): glass stayed within fill's
      noise, so iOS made glass the default on iOS 26 and later (`4cdb168d`),
      with fill before 26. Since, in the final build with no override,
      the default reads glass and looks legible in light and dark. Not
      done: dark performance, and Shawn's phone.
- [ ] Keep the native real-content lift as it is; it works well. The
      regression check is the existing hold, menu, land and viewer cycles.

### 2. Composer (both platforms)

- [ ] After a multiline send the text clears, but the field takes about
      1 s to shrink. I read #257 first: it made an empty iOS field measure one
      line (`numberOfLines={1}` while empty), and it holds the field's glass
      at the old height until the list's room (`composerHeight.room`, driven
      by `useComposerRoom` in the React Native list's `list-position.ts`)
      closes with the messages. Confirmed in source for iOS: with the native
      list nothing drives `room`, so `settle()` in `field-glass.tsx` holds the
      glass at the old height until `FOLLOW_FRAMES` (120 frames) runs out.
      That's 1 s at 120 Hz and 2 s at 60 Hz. Hypothesis for Android, where
      `settle` does nothing: the field's shrink waits for a Fabric state
      round trip through a JS thread busy with the send's render.
      Integration fix: with the native list, the glass doesn't wait for a
      room (`roomCloses`, `glass-hold.ts`) and lets go as the field
      shrinks. On Android an
      empty field's `maxHeight` is one line at the font scale, in the same
      render that clears it (`empty-field.ts`, `field-text.ts`). iOS keeps
      #257's `numberOfLines`. Verify on the A16. The baseline iOS simulator
      screenshot after a send (`polish-ios-composer-before-sent.png`) shows
      the empty placeholder at the bottom of glass still five lines tall,
      which matches the glass cause. The caret in it measures about 22 pt,
      which is the field's line height and normal. So nothing there
      reproduces the caret or dictation report, which stays pending on a
      phone.
- [ ] iOS dictation: the dictation spinner corrupts the selection, the
      caret size and the field's height, and backspace afterwards leaves
      the field too small until the next keystroke. Not reproduced. The
      simulator's dictation button dismissed the keyboard without a
      spinner, and the baseline's caret is a normal 22 pt (the line
      height), so nothing on record shows it.
      Source hypothesis (from iOS's audit, checked by integration in the
      installed react-native 0.86.3): Fabric's
      `RCTTextInputComponentView.mm` `_textOf:equals:` (line 874) skips
      rewriting the field during dictation only when
      `textInputMode.primaryLanguage` is `"dictation"`. Since iOS 16 it
      stays the keyboard's language while dictating. The old architecture's
      `RCTBaseTextInputView.mm` (lines 159–161) also checks
      `dictationRecognizing` on iOS 16 and later
      ([facebook/react-native#37188](https://github.com/facebook/react-native/pull/37188),
      for [#36045](https://github.com/facebook/react-native/issues/36045)).
      `RCTUITextView` sets that flag for exactly the spinner's time
      (`dictationRecordingDidEnd` to `removeDictationResultPlaceholder`,
      `RCTUITextView.mm` 330–339). Upstream main's Fabric file still lacks
      it. So during the spinner, Fabric may write JavaScript's text over
      the live dictation, move the selection, and take typing attributes
      from the placeholder, which would fit Shawn's report.
      **Source mitigation, built in (integration).** Nothing reproduces
      Shawn's symptom yet. This is the source-backed candidate, not a
      confirmed fix.

      **The patch.** `patches/react-native@0.86.3.patch` (made with
      `pnpm patch` and `pnpm patch-commit`, registered in the root
      `package.json` `pnpm.patchedDependencies`, hash `f048d109…`) changes
      one condition in `RCTTextInputComponentView.mm` `_textOf:equals:`.
      It still checks `primaryLanguage`, and on iOS 16 and later also
      `_backedTextInputView.dictationRecognizing`, as the old architecture
      does. It's marked `[vera: dictation-recognizing]`.

      **Building it in.** The app linked React Native's prebuilt core,
      which would never compile the patch.
      `plugins/with-react-native-from-source.cjs` sets the generated
      Podfile's supported switch, `ios.buildReactNativeFromSource`
      (`RCT_USE_PREBUILT_RNCORE=0`, `RCT_USE_RN_DEP=0`; see
      [build properties](https://docs.expo.dev/versions/latest/sdk/build-properties/)).
      It also fails prebuild if the installed react-native lacks the
      marker. iOS's first native build is much longer. Android is
      unchanged: it uses the prebuilt AARs, and the patch touches only
      this iOS file.

      **Fingerprint.** Expo's patch source reads only `apps/mobile/patches`,
      so `fingerprint.config.cjs` adds the root `patches/`
      (`pnpmPatches`). Its sources list the plugin and `../../patches`. On
      the final uncommitted source, on this Mac, the fingerprints are iOS
      `d6520c60947f6dc1bdfc20367dcf9307bb09c599` and Android
      `63be93b67e976c0fea59e724ef2aa66bbf577763`. Recompute after commit;
      they differ on Linux.

      **Lockfile.** A plain `pnpm install` after the patch re-resolved
      every snapshot depending on react-native, and re-bound
      `@better-auth/expo`'s nested `better-call` zod peer from 4.6.7 to
      4.3.6. That's unrelated to this fix, so it isn't kept. The lock is
      HEAD's graph with only the react-native `patch_hash` qualifier and
      the `patchedDependencies` entry added. Strip the qualifier and it's
      identical to HEAD's, and all five `better-call(zod@4.6.7)` bindings
      stay. `pnpm install --frozen-lockfile` passes; a plain `pnpm install`
      then says "Lockfile is up to date" and leaves it byte for byte. The
      installed react-native is the `patch_hash=f048d109` copy, with the
      marker. HEAD's hashed peer-key digests are kept as they were; pnpm
      treats them as opaque IDs.

      **Tests.** `plugins/react-native-from-source.test.cjs` checks that
      the switch is set, the installed file has the parity line, the
      patch is registered and in the fingerprint, the app config uses the
      plugin, and an unpatched react-native fails prebuild. They don't
      simulate dictation.

      **What the combined iOS build must show (orchestrator), or it isn't
      in the binary:** `ios/Podfile.properties.json` has
      `"ios.buildReactNativeFromSource": "true"`; `ios/Pods` has no
      `React-Core-prebuilt`; `ios/Pods/Pods.xcodeproj/project.pbxproj`
      lists `RCTTextInputComponentView.mm` (none today); the build log has
      a `CompileC` line for that file from react-native's
      `patch_hash=f048d109…` directory; and that file has the marker.

      **Still Shawn's iPhone.** Dictate into a multiline field, watch the
      spinner, then backspace. Check the caret, selection and height, and
      that normal typing, multiline, send and autocorrect still behave.
      Only then is it fixed. Remove the plugin and patch once React
      Native's Fabric has the check (upstream main doesn't yet). The
      old-runtime gate prelude to main must not include the patch, the
      plugin, or the fingerprint change.

### 3. Typing

- [ ] A one-on-one DM with the Vera assistant shows the typist's photo.
      DMs should show only the bubble; photos go in multi-person groups and
      spaces only. Confirmed in source: `typingRow` always sends people, and
      both native typing cells draw a face for each. The React Native list uses
      `showFaces={showAuthors}` for the bubble; its stacked line always
      shows faces. Shawn wants photos only in multi-person groups and spaces,
      and the stacked layout is a preference that applies to DMs too, so
      `TypingRow.showFaces` (contract revision 3) covers both layouts. Absent
      means draw them. Integration sends `showAuthors`.
      iOS and Android hide the faces, put the bubble where a DM's bubble
      starts, and keep the hand-off. iOS also found the morph's tail jumping
      and text spilling (native fix). Android found the morph jumping 42 dp
      sideways in DMs, for the same faces reason.
- [ ] Restore the smooth hand-off from the last typing bubble to its
      message. Hypothesis, not confirmed: when the typing query reports a stop
      before the message arrives, they land in separate row updates, and
      neither native hand-off can run. Android `handoff()` needs the typing
      row removed in the same update as the arrival, and its author among
      `people`. Both native owners confirmed they need the removal and the
      arrival in one rows update, and Android accepted a JavaScript hold of up
      to 1 s. What the source shows: `send` ends its author's typing in the
      same write that stores the message (decentralized-convex-messages
      README), and `shownTypists` drops a typist whose message is newer. So
      on one PDS, both usually arrive together. The typing and message
      queries can still arrive in separate updates: typing is gathered from
      every member's PDS, and a typist can time out first. That split hasn't
      been measured on a device. Integration adopted the hold anyway, as
      a safeguard (`typing-hold.ts`, `useHeldTypists`). Someone who stops
      without sending stays up to 1 s, until their message is the newest row
      (then both change in one update), they type again, or the time runs
      out. The cost is up to 1 s of typing shown after someone gives up.
      Unit tests cover arriving with the stop, arriving after it, someone
      else's message, typing again and expiry. The timer itself is checked
      only on a device. To check: record the stop-to-message gap with
      `dev:replyToMe` in a DM and the busy group, and shorten the hold if the
      gap is always small.
- [ ] Dev scenarios: more bots and multi-person typing. Existing helpers
      are `dev:replyToMe` (DM: one bot; group: three), `dev:replyScene` and
      `dev:typingCrowd`. Use them in both a DM and the busy group.

### 4. Inline stacked carousel (both platforms, native)

- [ ] The horizontal gesture feels hijacked and stops halfway. Use natural
      native scroll physics (iOS, Android).
- [ ] Render edge to edge, with no early clipping or black cutoff by the
      avatar column.
- [ ] Android: photos cover the avatar, then disappear too soon. The
      rightmost photo can't settle fully on screen and snaps back on release.
- [ ] Avatar treatment: native owners choose one coherent approach. Shawn
      suggests the avatar shrinking or receding upward as media passes, as
      Twitter does, and is open to something better. Keep readability and
      the native gesture feel; no broad rewrite. No contract change unless a
      value from JavaScript is needed (propose it first).

### 5. Inline bubbles deck (both platforms, native)

- [ ] Both swipe directions advance the same way. Make the traversal
      reversible, like a pile of physical photos.
- [ ] iOS: cards should move to the back of the pile, with the neighbors
      visibly offset and angled, rather than fly a little and disappear.
- [ ] Smooth drag, spring and transition. The blur-to-sharp change
      currently snaps.
- [ ] Reactions overlap the exact media on iOS; on Android they float
      above it. Make both overlap the item they belong to.
- [ ] Direction and state stay native. JavaScript reads only `index` on
      press and hold, which keeps its meaning, so no contract change.

### 6. Shared fullscreen media viewer (both platforms, integration)

The viewer is shared JavaScript (`media-group-viewer.tsx`,
`photo-viewer.tsx`, `photo-gestures.ts`, `photo-viewer-state.ts`), not a
native row.

- [ ] Paging tracks at about half the finger's speed and wobbles (the
      "split, jitter, jiggle"). Confirmed in source: `fingers()` reads
      `touch.x`, which is relative to the page view, and that view moves with
      the page. Each move feeds the page's own translate back in. Fix: track
      paging in window coordinates (`absoluteX/Y`).
- [ ] Swiping past the first or last page exposes the chat. Confirmed in
      source: each page draws its own black backdrop and moves it with the
      page, so the 25% rubber band and the sub-pixel seams between pages show
      the transparent route underneath. Fix: one opaque backdrop for the
      group that doesn't move, faded only by the shown page's swipe to close.
- [ ] An unloaded page exposes the chat, then fades in. Confirmed in
      source: neighbors mount around `index`, which updates only when the
      page spring finishes, so a second swipe during the spring reaches an
      unmounted page. Fix: move `index` to the target when the swipe is
      released, so the next neighbor mounts while the spring runs, over the
      shared backdrop.
- [ ] Keep swipe sideways, swipe down to close, pinch and double-tap zoom,
      the close button, video play, and back.

### 7. Test phase order

1. **Now:** no-data-pass integration on this worktree's isolated backend,
   seeded with mixed messages and bots, in Vera Dev dev clients on both
   phones (`scripts/phone.sh up` and `--android`). Use normal Metro for
   feedback, not `VERA_METRO_PROFILE`'s production profiling bundle.
   Rebuild native only when native changed.
2. **Seed:** a reproducible mixed conversation with per-item reactions,
   files, links, videos and photo groups, plus DM and multi-person typing
   scenes. The busy seed has only photos and message-level reactions.
   Integration added `devMixed:seed` (dev only,
   `services/backend/convex/devMixed.ts`, its messages in
   `services/backend/dev-mixed-lines.ts`): a "Mixed media" group with
   every bot and a DM with Maya. Each gets the same 12 messages: a
   three-photo group with reactions on items 0 and 2, a video with its
   own reaction, a photo and video together, a PDF with a reaction, a
   YouTube link, a captioned four-photo group with reactions on items 1
   and 3, your own photo with a reaction, long text with three reactions,
   jumbo emoji, and short text. Typing scenes use the existing
   `dev:replyToMe` (DM: one bot, group: three), `dev:replyScene` and
   `dev:typingCrowd`. Fixed after review: a reaction on the first photo
   of a message without text was sent as `attachment: 0`, which the server
   stores as is and the app reads as part 0. The app calls that photo the
   message itself, though, so no row drew those hearts. `reactionAttachment`
   now sends it as the app does, with no `attachment`. `dev-mixed.test.ts`
   runs every seeded reaction through the app's own mapping
   (`reactionPart`, then `nativeRows`) in both layouts, and checks each
   shows on its intended photo, video, file or message part. With the old
   arguments it fails on the first photo's hearts.
   Pending: the orchestrator pushes it to the isolated
   backend (`scripts/backend.sh push`) and runs
   `npx convex run devMixed:seed --identity …` for the ios@ and android@
   accounts.
3. **Later, separately:** a combined native plus data-pass test, once the
   fixes above are verified on their own, keeping the isolated comparison.
   Don't merge data-pass yet. The data pass alone is not the primary
   test. A joint release is likely; correctness is still checked on its
   own first.
4. **Deliverable now:** the exact `scripts/phone.sh up` and `--android`
   open links, install links if needed, and sign-in links. No more
   private production builds. In Vera Dev the switch is in conversation
   info → Testing → Native Message List, or More → Account → Developer →
   Native Message List (More → About → Testing is only for testers in
   production builds).

### 8. Required update to a native-list binary

- [ ] Make the dormant `StoreUpdateCover` a proper minimum-native gate:
      one tap to TestFlight or Play, shown only once a store build is actually
      available on that platform. Off now, and it must never trap anyone
      before then. It doesn't depend on the native-list switch: turning the
      list off doesn't get around it. It checks the binary's native version,
      not just whether the list exists. An old binary can't report a build
      number (no `expo-application`, and remote versioning keeps it out of
      the app config). It does have `Updates.runtimeVersion` and
      `Updates.channel`, so the gate compares the runtime: a production
      binary whose runtime isn't in its platform's list of current runtimes
      gets the prompt. A missing list means off. Dev clients, internal and
      preview builds never see it.
- How it reaches old binaries: an OTA reaches a binary only if their
  runtimes (native fingerprints) match. Production iOS build 9 has
  runtime f54bfcd2 and Android 46edd031. The last production OTA,
  `mobile/ota/production/20261023T003538`, was published from main
  5268ceac and reached both, and main still has those runtimes. A gate
  bundled only with the native-list binary can never reach the old
  binaries. Once the native list lands on main, `pnpm release ota production` publishes only
  for the new runtime: it requires a clean main and the latest binary's
  runtime.
- So the gate must reach old binaries through a production OTA from main
  before the native list merges there. It also has to turn on later
  without another OTA to them.
- [x] Built, off (integration): the backend serves `release.outdatedRuntimes`
      (`services/backend/outdated-runtimes.ts`, empty), and the app watches
      it (`watch-outdated-runtimes.ts`, rules in `store-gate.ts` with tests).
      A production binary whose runtime is listed for its platform gets the
      one-tap "Update Vera". It's a deny list, so a newer build can never be
      trapped by someone forgetting to add its runtime. Turning it on is a
      backend deploy that reaches every binary. `NATIVE_LIST.requireBinary`
      and `useNeedsNativeListBinary` are gone. The rejected options were an
      older-runtime OTA (the tooling can't) and raising `BREAKING_VERSION`
      (a 3-minute wait on every launch). The pre-merge PR, then builds,
      then the list, in that order, is in docs/next-release.md. Dev, internal
      and preview builds don't subscribe at all. Tests drive the client's
      real observer: a PDS without the query (an error) lists nothing.
      Coverage limit, from the release tags: only iOS build 9 (`f54bfcd2`)
      and Android build 6 (`46edd031`) can get the gate's prelude OTA. iOS 7
      and 8 and Android 4, 5 and earlier have had no OTA since early October
      or ever, and `pnpm release ota` can't publish for them (latest
      runtime only, from a clean main). Their JavaScript also predates the
      breaking-version watcher. So with current tooling they can't receive
      the gate, and stay on the React Native list. A per-runtime backport
      OTA would be a release-tooling change, which isn't planned. docs/next-release.md has the table and
      what does reach them. Pending: a push to the isolated backend and a
      check that the query answers (by the orchestrator). Nothing published.
- Android Play in-app updates (immediate flow) need the Play Core library
  in the binary, so they can't help binaries already installed. They run
  only after the user accepts, and only for Play installs, not the
  private APK. iOS can't install silently. TestFlight's automatic
  updates are a tester's own setting. So the gate is a one-tap prompt,
  with no update SDK.

### 9. The newest message under the composer (acceptance, not a claim)

Shawn asked whether the React Native list's old bug, the bottom message
stuck under the composer, is fixed once and for all. **It isn't claimed.**
The native list removes the old mechanism, but two inputs still cross
threads, and nothing so far has measured the transitions. Below are the
source mechanism, what the evidence shows, and the acceptance that would
settle it.

**How the bottom inset is made (source, at `8bb83ce6`).**

- JavaScript, `native-message-list.tsx` (the `insets` prop, about line
  279): `bottom` is the composer's height plus `COMPOSER_GAP` (8), and
  `keyboardOverlap` is the composer's own bottom inset. The height is the
  composer bar's (`Bar` in `composer.tsx`). It includes its padding and
  the safe area under it, and any reply bar or staged attachments
  (`FieldTop`), but not the mention picker, which floats over the
  messages above the bar. The UI thread updates it the frame it changes
  (`onSentShorter`, `onTyped`, `onHeight` in `composer-height.ts`). It
  reaches native only through React: `useComposerHeightNow` sends it with
  `scheduleOnRN` to state, then a render, then the prop. So native gets a
  new composer height at least one JavaScript render late. That's longer
  when JavaScript is busy (a send's render, a busy chat, the A16).
- iOS, `MessageListView.swift`: `setInsets` calls `applyInsets(keepDistance: true)`
  (about lines 196 to 207 and 324 to 339). The flipped collection view's
  top inset is `insets.bottom` plus the keyboard, and the offset keeps its
  distance from the newest row, so a pinned list rides with each change.
  The keyboard comes from a `keyboardLayoutGuide` tracker in
  `layoutSubviews`, frame by frame, interactive dismissal included. It's
  `raw - keyboardOverlap` (about lines 129 to 139 and 290 to 312), held while
  `keyboardFrozen`, easing back after. Releasing a drag past the newest
  row settles on it (`scrollViewWillEndDragging`, about line 780). A row
  arriving counts as pinned within 2 pt, or within 24 pt when not
  dragging (about line 425).
- Android, `MessageListView.kt`: `setInsets` calls `applyPadding`, which sets
  the recycler's bottom padding to `insets.bottom` plus the keyboard and
  lays out at once (about lines 166 to 171 and 384 to 390). The keyboard
  is the IME inset minus `keyboardOverlap` (or the navigation bar),
  followed by `WindowInsetsAnimationCompat` frame by frame (about lines
  393 to 436). A source grep found no native drag-to-dismiss, so whether
  dragging the list dismisses the keyboard on Android is unknown. Check
  it on device.
- **What changed from the React Native list:** there's no separate room
  animation that the messages must catch, and no Reanimated layout
  timing. Each platform applies the inset in its own layout pass. **What
  still can go wrong:**
  1. The composer moves with react-native-keyboard-controller, and the
     list with its own keyboard tracker: two trackers, which may differ
     for a frame or more, during open, close or interactive dismissal.
  2. Composer height changes reach native a render late. So while the
     field grows a line, the newest row can sit under the composer for
     those frames. After a send, the gap is too large for a moment, not
     too small.
  3. A new composer element outside `Bar` (like the mention picker) isn't
     counted.
     At rest, both should converge on the last height React sends. Nothing
     above shows that they can't, but nothing has measured them in
     transition either.

**Evidence so far (iOS simulator only).**

- `.cache/polish-ios-group-raw.txt` (an AX snapshot of the group, bubbles,
  keyboard down, at rest): the composer bar is at y 798 to 874 (76 pt with
  the safe area). The newest cell, "send pics", is 709 to 790, its text
  753 to 775. That's exactly the 8 pt gap. One resting state, one layout,
  one platform.
- `.cache/evidence/polish-ios-dm-typing.mp4` (52 s, 3 slow frames) and its
  contact sheet show the composer in every sampled frame, with the
  newest bubble above it, through typing and the morph. The
  `polish-ios-dm-morph-message.png` read for this review also shows the
  composer, with the last bubble resting above it. The report that a
  morph frame appeared without the composer isn't seen in these files.
  It stays **unconfirmed, not refuted**: a single transition could fall
  between samples. No source change until it's reproduced.
- Nothing for Android, stacked, keyboard transitions, multiline growth,
  tall media at the bottom, or reactions on the newest row.

**Acceptance.** Pass on both platforms, in both layouts, in the
"Mixed media" group and the DM (`devMixed:seed`):

| #   | Scenario                                                                                     |
| --- | -------------------------------------------------------------------------------------------- |
| 1   | At rest, keyboard down: newest text row; then newest tall media (photo, deck, carousel)      |
| 2   | Keyboard opening, then open at rest                                                          |
| 3   | Keyboard closing (tap away and Return)                                                       |
| 4   | Interactive dismissal, dragging the list down (iOS; Android if it exists)                    |
| 5   | Multiline: type until the field grows to its 10-line cap, then send and watch it clear       |
| 6   | An arrival while pinned (`dev:replyToMe`), and a burst                                       |
| 7   | Typing to message: DM (one bot), group (three bots)                                          |
| 8   | Adding and removing a reaction on the newest row (it grows and shrinks)                      |
| 9   | Reply bar and staged attachments opening and closing                                         |
| 10  | The long-press menu opening and closing with the keyboard up (`keyboardFrozen`)              |
| 11  | Safe areas: iPhone with the home indicator; Android with gesture and three-button navigation |
| 12  | A thread short enough to sit at the top (`alignTop`), then filling past the composer         |

- **At rest** after each step: the newest row's frame bottom is at or
  above the composer bar's top, less 8 pt (±1). Its bottom-most part
  (text, media, the reaction chips, the footer) is visible, and a tap on
  it does what it should (opens the viewer, toggles the chip).
- **In transition:** record the most the newest row overlaps the
  composer, and for how many frames. A frame or two while the field
  grows or the keyboard moves is the known lag above. Report it as
  measured, not as a failure or a pass. Anything that stays overlapped at
  rest, or overlaps for more than about 100 ms, fails.

**How to check, with existing tools and no new probe or API.**

- At rest: `agent-device` snapshot raw, as in
  `.cache/polish-ios-group-raw.txt`. Take the last `MessageList.MessageCell`
  rect (iOS) or the list's last child bounds (Android hierarchy dump),
  and the composer bar's `RCTViewComponentView` rect (the bottom
  full-width container, y 798 here). Compute `bar.y - (cell.y + cell.height)`.
- Reading a snapshot offline: `node --experimental-strip-types
scripts/qa/bottom-row.ts <snapshot.txt> --newest "<newest row's label
start>" [--scale <raw units per point>]`. It prints the row's bottom,
  the composer bar's top, the gap and the overlap, in logical points, with
  the raw rects and the row's hittable nodes. It exits 0 for a gap of at
  least 8 pt (less 1), 1 for closer or overlapped, and 2 when the dump
  can't answer: the newest row missing or hidden, duplicated, or not the
  bottom one; no composer bar; an invalid rect. It never stands an older
  row in for a missing newest one. The bar is the field's outermost
  full-width ancestor reaching the window's bottom, not the field. On
  `.cache/polish-ios-group-raw.txt` with `--newest "Leo Martins, send pics"`
  it gives 790, 798 and 8, exit 0. With the keyboard up, the bar ends at
  the keyboard's top (iOS's `UIKeyboardItemContainerView` or `Keyboard`
  node), its bottom inset behind the keyboard, and the reader accepts
  that. On the measured stacked snapshots
  (`.cache/evidence/polish-ios-bottom-stacked-*.txt`) it gives keyboard
  closed 790/798/8, keyboard up 482/490/8, ten lines 284/292/8 and after
  sending 482/490/8, all exit 0. Scrolled away (`dismissed`), the newest
  row is at 933, below the screen: `belowComposer` true, exit 1, as it
  should be. iOS only: Android reports unsupported
  until a real Android dump is captured to read its node shape from
  (Android's would need `--scale` set to the device's density, which it
  never guesses). One still frame: it says nothing about transitions,
  and AX `hittable` isn't a tap. Tests: `node --experimental-strip-types
--test scripts/qa/bottom-row.test.ts`. Root `pnpm run test` doesn't run
  `scripts/`, so run them by hand.
- In transition: `scripts/sim.sh record` around each step, then a 3 fps
  (or finer, around the moment) contact sheet, read frame by frame for
  the newest row against the composer's glass top. `scripts/sim.sh frames`
  alongside, so a hitch is counted too.
- Shawn's phones: the same steps, judged by eye. The A16 matters most,
  because it's where JavaScript is slowest, and so where the height lag
  is longest.

**Found in runtime QA, fixed in JavaScript (unverified on a device):**
with the keyboard up and the list scrolled away, the jump-to-latest
button stayed at its keyboard-down place (y 766), behind the keyboard,
and couldn't be tapped. Cause: `JumpToLatest` rose by the composer's
height only (`above`). The composer itself rises with the keyboard in
`KeyboardStickyView`, by the keyboard's height less its bottom inset.
The native list has no keyboard wrapper of its own (native moves the
rows), so nothing moved the button. Now the native list passes
`keyboard={{ bottomInset, frozen }}`, and the button rises with
`composerTop` (`jump-lift.ts`, the same math as `KeyboardStickyView`). It
holds while the long-press menu has the keyboard frozen (iOS only, as
`useFrozenKeyboard` does), and catches up when the freeze lets go.
Native insets and the keyboard are untouched, so nothing shifts twice.
The React Native list passes no `keyboard` and behaves as before. It
probably has the same gap, but that isn't verified, and isn't changed
here. Tests check the measured places: the bar's top at 490 with the
keyboard up, and 292 for ten lines. To verify (orchestrator, Metro): the
button sits 12 pt over the composer with the keyboard down, up, moving,
dragged down and around the menu, on iOS and Android, and taps.

**Gaps:** frame-exact transition overlap (video sampling only),
landscape, Android interactive dismissal, a composer element outside
`Bar`, and the React Native fallback list (out of scope).

### Runtime checkpoint: iOS simulator, 2026-10-23 night

Everything here is the iOS simulator, a Vera Dev client on the isolated
backend, with no data pass. None of it is a phone result. Android is
unverified at runtime. Files are under `.cache/evidence/` unless noted.
These are resting measurements and short clips, not frame-exact proof.
Nothing here claims the bottom-row problem is fixed once and for all.

**Builds.** The combined client with iOS `5cca8d96` (fingerprint
`01aeb21b97ef949a403ef016c3158f0d70100431`) compiled, signed and ran. Its
build log (`.cache/native-polish-build/ios-corrected-source-proof.json`,
`ios-corrected-source-build.xcactivitylog`) shows
`RCTTextInputComponentView.mm` compiled from react-native's
`patch_hash=f048d109…` directory, for arm64 and x86_64. So the dictation
patch is in that binary. The dictation symptom itself (the spinner,
caret, selection and height) is still not reproduced or verified. The
head is now `8c5b496a`, with iOS `4cdb168d` (the chip material default).
Its client compile is running
(`.cache/native-polish-build/ios-material-default-client.log`) and isn't
done. CI was green on all 9 checks at `308a03ae`; `8c5b496a`'s CI isn't
read yet.

**Chip material (iOS).** Six interleaved runs of the same build (`308a03ae`,
the `01aeb21b` client): fill, sheen, glass, sheen, glass, fill. Each used
production JavaScript (`__DEV__` false), the busy group, stacked, light,
and `benchFling` at 5,500 pt/s for 8 s. LLDB read each run's actual
`VeraChipMaterial` and detached before capture. The panel stream was
closed, with no concurrent build or boot
(`.cache/native-polish-build/material-summary.json`, `material-*.log`,
`.cache/bench/*.frames-stop.log`):

| Run | Material | Slow | Over 16.7 ms | Over 33 ms |   Worst | Travelled | Edge wait | Rows after |
| --- | -------- | ---: | -----------: | ---------: | ------: | --------: | --------: | ---------: |
| 1   | fill     |   14 |           15 |          9 | 43.3 ms |    42,991 |    183 ms |        700 |
| 2   | sheen    |    6 |            7 |          5 | 43.0 ms |    44,000 |         0 |        750 |
| 3   | glass    |    5 |            6 |          5 | 43.3 ms |    44,000 |         0 |        750 |
| 4   | sheen    |    9 |           11 |          7 | 42.9 ms |    44,000 |         0 |        750 |
| 5   | glass    |    8 |            8 |          5 | 41.5 ms |    44,000 |         0 |        750 |
| 6   | fill     |    7 |            8 |          6 | 43.7 ms |    44,000 |         0 |        750 |

Run 1 was cold: it travelled less, waited 183 ms at the oldest row, and
loaded fewer rows, so it decides nothing. iOS applied the rule it had
declared before the runs (its `material-decision.md`, and
`.plans/native-message-list-ios.md` → Chip material). Glass stayed within
fill's own noise, so glass is the default on iOS 26 and later. Fill stays
the default before iOS 26, where glass would be the unmeasured blur
fallback. `VeraChipMaterial` still overrides it. This doesn't show that
glass is faster or free of slow frames (every run had some). It says
nothing about Shawn's 120 Hz iPhone, the dark theme, the bubbles layout or
Android. Each material ran twice, all in the simulator. Still needed: the
`4cdb168d` client compile, light and dark look checks of the default with
no override, runtime motion, and Shawn's eye on his iPhone.

**Newest row against the composer (item 9), resting measurements.** Each
was taken with the bottom-row reader, or by hand from the raw rects where
the reader can't apply:

- Stacked text (`polish-ios-bottom-stacked-{text-closed,text-keyboard,tenlines,sent}.txt`):
  row bottom against the bar's top, 790/798 with the keyboard down,
  482/490 with it up, 284/292 with ten lines, and 482/490 after sending.
  All 8 pt.
- Stacked, a tall photo newest ("Bottom QA tall photo", `b9b1f9ee`): 790/798
  with the keyboard down. With the keyboard up and a heart on part 0, the
  photo's bottom and its chip show above the composer. Holding the chip
  opened the right who-reacted sheet
  (`polish-ios-bottom-stacked-media-chip-hold.png`). The snapshot may not
  carry the chip's label, so that part is visual, plus the hold.
- Bubbles, media newest (`polish-ios-bottom-bubbles-{media-closed,media-keyboard,tenlines,sent}`):
  a 385 pt row ending at 790/798 with the keyboard down, and 482/490 with
  it up and a heart. With ten lines the field grows to 228 (bar 274), and
  the row ends at 284/292. With the keyboard up and the field tall, only
  the media's bottom shows: its top runs off the top of the screen, as it
  should. The whole image doesn't fit, and isn't claimed to.
- Sending: back at rest, 8 pt. In the video, the field and its glass shrink
  together. The latency frame by frame isn't measured.
- Group typing (`dev:replyScene` with Maya, Jonah and Priya,
  `polish-ios-bottom-bubbles.mp4`, `...-group-replied.txt`): the second
  and third messages arrived together, and the group's typing faces show.
  The clip includes a Fast Refresh banner from the jump fix landing
  mid-capture, so its frame report isn't clean performance data. Stacked
  114 s with 35 slow, bubbles 79 s with 26 slow, both including XCTest
  typing and backend arrivals. The logs are kept; no zero-slow claim.
- Staged photo (`polish-ios-bottom-staged.{mp4,png,txt}`, `...-staged-cleared.png`):
  Integration's own screenshot was imported into the simulator's Photos,
  staged, then removed without sending. The AX dump fell back to XCTest
  classes, so the reader rejects it, as it should. By hand from the raw
  rects: the newest row (Priya) y 329 + 81 = 410, against the full bar's
  ancestors (90, 91) at y 418, h 148: an 8 pt gap with the keyboard up.
  That's the bar's frame, not the field's (498). Cancelling collapses
  the strip. No user or production data was touched.
- Short thread: it starts at the top (`polish-ios-short-thread.png`,
  thread `5f904fc0`). Four long replies from Maya through `dev:say` grew it
  (`polish-ios-thread-growth.{mp4,txt}`). The newest ends at 301 + 181 =
  482, against the bar at 490, an 8 pt gap, and is hittable. Stacked
  (`...-thread-growth-stacked.txt`): 354 + 128 = 482 against 490. No older
  row was stood in for the newest.
- **Jump to latest with the keyboard up: a bug, now fixed in JavaScript
  and checked in the simulator.** Before: the button stayed centred at its
  keyboard-down place (y 766), behind the keyboard, and couldn't be tapped.
  After the `composerTop` fix (`308a03ae`,
  `polish-ios-jump-keyboard-fixed.txt`): the button is at y 438, h 40,
  ending at 478, with the composer's top at 490, a 12 pt gap. It's
  hittable. Tapping it landed on the newest row, 482 against 490, 8 pt
  (`polish-ios-jump-keyboard-landed.{txt,json}`).
  `polish-ios-jump-keyboard.mp4` has the correct jump, then a failed
  setup: a hold on the author's name, not the text, which isn't a menu
  result. Android is unverified.
- Menu with the keyboard up: a real hold on the text body (`polish-ios-bottom-menu-reply.mp4`)
  shows the native hold, the menu, closing, the field focused again, and
  the reply bar. Afterwards, 8 pt each time:
  `polish-ios-real-menu-keyboard-landed.json`, `polish-ios-bottom-replybar.json`
  and `polish-ios-bottom-replybar-cancelled.json`.
- **Interactive dismissal: not verified.** The driver refuses a full swipe
  (200,300 to 200,720) and a structured pan (dy 450, 1200 ms) as
  "Gesture trajectory does not fit inside viewport" once it enters the
  keyboard. A shorter pan inside the list scrolls older messages and
  keeps the keyboard up. It correctly shows the newest row below the
  screen while not pinned, which isn't the stuck-row problem.
  `polish-ios-keyboard-dismiss.mp4` is a failed setup, not a pass. It's
  left for the phone, with no code change for a driver limit.
- Still to do from item 9: safe-area variants, Android throughout, and some
  cells of the matrix. Not every scenario has run in every layout and
  conversation, so the twelve aren't checked off.

**Carousel lift correction (iOS `5cca8d96`), at runtime.** Holding the
third photo at the carousel's last offset lifts only that photo above the
blur, with its neighbours and the chips blurred in place
(`polish-ios-lift-corrected-open.png`). It lands at the same offset
(`...-land.png`). The first card lifts alone too
(`...-first-settled.png`, `...-first-open.png`). The 60 fps sample around
21.5–22.7 s (`...-landing-60fps.png`) shows the photo present throughout,
with no visible blank. That isn't proof for every frame: the recording is
variable frame rate and can repeat frames. The 28 s video has one
correct open and land of the third photo, then a later automation
mistake (a wrong first-hold setup), which isn't counted. iOS reported
the same Swift compile for both architectures and 118 host tests. No new
source.

**Typing faces.** DM, stacked (`polish-ios-dm-stacked-morph.mp4`, its
sheet and frames log): 951 frames over 15.85 s at 60 Hz, 0 slow, 0
dropped, worst 16.7 ms, Mac 8% (peak 13%), no boot. Two seconds of typing,
then Maya's message through `dev:say`. The sheet shows the label with no
photo, at the normal text column, then the message arriving above the
composer. DM bubbles (`polish-ios-dm-typing.mp4`, earlier) showed no face
too. The DM was a bot (Maya), not the actual Vera assistant. The source
applies `showFaces: false` to every one-on-one conversation alike.

**Dark theme.** `polish-ios-dark-stacked.png` and `...-dark-bubbles.png`
show legible chips, but in the fill baseline, before the material
default. The purple tint is the normal highlight of the message it opened
on. Glass in light and dark, with no override, waits on the `4cdb168d`
build. Earlier viewer, deck and reaction clips (real content, reverse
traversal, per-part reactors, the viewer's opaque edges) keep their
qualified notes above. No new numbers are added for them.

**Phase and what's next.** Native fixes without the data pass first.
`devMixed:seed` is done for both phone accounts, and the sign-in links
are in `scripts/backend.sh status`. Phone clients haven't started. The
orchestrator's latest estimate is 20:00–21:00 for the iPhone and,
conditionally, 22:00–23:00 for Android, each once its build actually
starts. The iPhone's link goes out as soon as it's verified, without
waiting for Android. The orchestrator owns the final motion and
performance runs and the builds; source is frozen. Shawn's earlier
report that the private previews were dramatically better, including on
the Galaxy A16, stands, and it still isn't approval to merge. No new
production previews, stores or OTA.

### Final iOS checkpoint, 2026-10-23 evening

The head is `b13615a5`, with all 9 CI checks green there (read by the
orchestrator), and the ordered root checks passed earlier on the same
source. No source changed since. iOS simulator only. Android's runtime
and both phones are still pending.

**Final build.** The combined simulator client, fingerprint
`876311a084e8563a2379dc3da938fda6b5c5e018`, built from iOS `4cdb168d`,
including the `5cca8d96` exact-tile lift. The orchestrator verified its
code signature. Its build log
(`.cache/native-polish-build/ios-final-source-proof.json`,
`ios-material-default-client.log`) compiles `RCTTextInputComponentView.mm`
from react-native's `patch_hash=f048d109…` directory, for arm64 and
x86_64. That shows the dictation patch is in the binary, nothing more:
the spinner symptom is still unreproduced.

**Chip default with no override.** LLDB read `VeraChipMaterial` as nil and
`ChipMaterial.current` as glass
(`.cache/native-polish-build/material-default-no-override.log`). The glass
chips are legible in light and dark
(`.cache/evidence/polish-ios-glass-default-{light,dark}.png`). Dark wasn't
measured for performance, and the light measurement isn't extended to it.

**Motion check.** Light: 18 of 18 passed, exit 0
(`.cache/native-polish-build/ios-final-motion-light.log`, recordings in
`.cache/motion/20261023-191725`). Dark: 17 of 18, exit 1
(`ios-final-motion-dark.log`, `.cache/motion/20261023-192734`). Bubbles
firehose failed with 2 flags and 0 minor in 94 frames: a jump-back at
8.365 s (middle, 308 pt, −11) and a flicker at 9.128 s (left, 596 pt, 56).
There were no Metro errors. My review of the extracted frames
(`.cache/native-polish-build/dark-firehose-frame-times.txt`, contact sheet
`.cache/evidence/dark-firehose-review/contact.png`): the four source
frames at 8.172, 8.365, 8.640 and 9.128 s are 193, 275 and 488 ms apart,
much sparser than the frames around them. The rows keep their identity
and move up. Two arrivals land between rows already shown: Firehose 42
appears between 41 and 43, and 55 lands below 58. That's `dev:burst`
sending each message at a random moment around its slot, the known
firehose cause above. The flags fall in those wide gaps, past the
analyzer's ±40 pt search. I found no reversal or missing row, so there's
no code change. The formal result stays 17 of 18, not an all-pass. A
sparse capture can't prove every frame.

**Head-to-head, current.** Both lists in the real app, with production
JavaScript (`__DEV__` false), the same native `benchFling` and UI-thread
driver, no injected gestures, and no concurrent build or boot. The same
busy group, the React Native list first and then native, one run each.
The native list loads 5 screens ahead and the React Native list 3. Scroll
is 5,500 pt/s for 10 s; the burst is 150 messages over 15 s. Files:
`.cache/bench/20261023-193617-all.jsonl` (bubbles) and
`.cache/bench/20261023-194044-all.jsonl` (stacked), each with its
`.frames-stop.log`.

| Layout, scenario | FPS RN → native | Slow     | Worst          | JS stalls | Mac CPU avg (peak) RN / native |
| ---------------- | --------------- | -------- | -------------- | --------- | ------------------------------ |
| Bubbles, scroll  | 52.0 → 58.8     | 77 → 14  | 67.7 → 44.6 ms | 41 → 9    | 19% (20%) / 15% (21%)          |
| Bubbles, burst   | 50.5 → 59.5     | 131 → 11 | 112 → 40.8 ms  | 84 → 15   | 27% (42%) / 10% (18%)          |
| Stacked, scroll  | 53.5 → 58.6     | 73 → 14  | 53.7 → 48.8 ms | 41 → 12   | 23% (29%) / 19% (22%)          |
| Stacked, burst   | 50.7 → 59.5     | 139 → 10 | 79.7 → 42.5 ms | 100 → 15  | 16% (22%) / 9% (15%)           |

Scrolling, native travelled 55,000 pt with no wait at the oldest row in
both layouts. The React Native list travelled 39,964 pt with 2,639 ms
waiting (bubbles) and 42,470 pt with 2,531 ms (stacked). Loaded rows
started at 50 (React Native) and 100 (native) in bubbles, and 100 and 100
in stacked. They ended at 500 and 700 in bubbles, and 700 and 900 in
stacked. So the lists did different amounts of loading, and the run
order, warm caches and row counts still affect these numbers. Native
still has slow frames, so there's no zero-slow claim, and nothing here
says glass is faster. These are the current results, separate from the
earlier preview-round numbers above, and they're the simulator, not a
phone.

**Devices.** The orchestrator's own iOS simulator and its panel were
brought down, and Metro stopped at 19:45. An `xcodebuild clean`
recovered 64 GB. The physical iPhone's Vera Dev build (`scripts/phone.sh up`,
normal Metro, the isolated backend with no data pass) started at
19:45:35 EDT under the shared lock
(`.cache/native-polish-build/phone-ios-polish.log`). It has no artifact or
link yet. The iPhone's link goes to Shawn as soon as it's verified, before
Android's. There's no estimate here for either.

**Still open.** Android runtime: every Android fix is source-verified
only. Shawn's phones: dictation; the iOS reaction tap feel and haptics;
interactive keyboard dismissal (the driver couldn't perform it); the
composer's shrink on the A16; carousel and deck feel; viewer paging; glass
on his 120 Hz iPhone; the typing hand-off with real bots; and the
newest-row acceptance (item 9). Item 9 has resting 8 pt gaps across the
iOS cases measured so far. Still missing there: Android, the safe-area
variants, some cells of the matrix, and frame-exact transitions. It's not
a once-and-for-all claim. Then the separate combined native plus
data-pass test. The update gate stays off. Its old-runtime OTA order stays
in docs/next-release.md. Shawn's report of dramatic improvement on his
iPhone and Galaxy A16 with the earlier previews stands, and isn't merge
approval. No stores, production OTA, or shared backend deploys.

### Delivered checkpoint: both platforms and both phones, 2026-10-23 late

The last source commit is `06003b06`, with all 9 CI checks green there. It
adds the hidden jump button's accessibility fix to `b13615a5`. These docs
come after it, and their CI is the orchestrator's push. Both native owners'
final source is in: iOS `4cdb168d`, Android `31c72259`. There's no data
pass. No production action was taken, and there's no merge approval.
Shawn's report of a dramatic improvement on his iPhone and Galaxy A16,
from the earlier private previews, stands. Feedback on this polish round
from his phones is still to come. The update gate is off, and its
old-runtime order stays in docs/next-release.md. On the isolated backend
only, `release:outdatedRuntimes` answers `{ android: [], ios: [] }`
(`.cache/native-polish-build/isolated-release-gate.json`), so the gate
lists nothing. Files are under `.cache/evidence/` unless noted. Uploaded
so far: iOS and Android screenshots and six videos, listed in
`.cache/native-polish-build/{ios-polish-image-links,android-polish-image-links,polish-video-links}.md`.
Everything else is local.

**Phones.**

- iPhone: verified and delivered. Vera Dev fingerprint
  `ac18b6d7b77821493b3dac85cb5029cc67efe421`, team 39K6A9FP99, ad hoc, the
  development channel, `chat.vera.app.dev`. The code signature, manifest
  and hosted IPA (200, size checked) were verified. Its arm64 build
  compiled the patched text input
  (`.cache/native-polish-build/phone-ios-text-input-compile.txt`). That's
  source inclusion only, and the dictation spinner is still unreproduced.
  [Install](https://vera-evidence.b-cdn.net/dev-client/ios/ac18b6d7b77821493b3dac85cb5029cc67efe421-fa7041a8f6cf/index.html),
  then [open in Vera Dev](https://vera-evidence.b-cdn.net/dev-client/open-cfde0a5324fd.html?url=http%3A%2F%2F10.0.0.124%3A8492).
- Android: verified and delivered. `scripts/phone.sh --android up` exited
  0 (`.cache/native-polish-build/phone-android-polish.log`). It took the
  lock at 21:44 EDT and finished at 21:50. Native fingerprint
  `25c41d804e634b40c90c5385ea90a40c38f4dcdb`. Checked
  (`.cache/native-polish-build/phone-android-verify/`): package
  `chat.vera.app.dev`, "Vera Dev", version 0.1.0 (code 2), arm64-v8a,
  armeabi-v7a, x86 and x86_64, the development channel. `apksigner`
  verifies it, and its certificate (SHA-256 `4efc689e…33ee793b`) matches
  the earlier cached Vera Dev's. So it installs over Vera Dev without
  uninstalling, and keeps Vera Dev's local data. Production Vera and the
  private previews aren't touched. The APK's `assets/fingerprint` matches
  `25c41d80…` exactly, and the manifest's runtime version is Expo's
  standard `file:fingerprint`, which reads that asset. The hosted page and
  the APK both answer 200, and the APK is 286,626,774 bytes, the same as
  the local file.
  [Install](https://vera-evidence.b-cdn.net/dev-client/android/25c41d804e634b40c90c5385ea90a40c38f4dcdb-c3720a46099f/index.html),
  then paste `http://10.0.0.124:8492` into Vera Dev's launcher; the open
  link crashes Vera Dev on Android (the Expo bug in apps/mobile/README.md).
- Both links went to Shawn at 21:51 EDT.
- Both: normal Metro on port 8492, `__DEV__` true, home Wi-Fi only
  (Tailscale is stopped). Each installs into the Vera Dev slot, so
  production Vera isn't touched, and installing over Vera Dev keeps its
  local data. Sign in with
  [ios@t3-native-message-list-integration.dev.vera.chat](https://uncommon-curlew-869.convex.site/dev/sign-in?username=ios)
  or [android@t3-native-message-list-integration.dev.vera.chat](https://uncommon-curlew-869.convex.site/dev/sign-in?username=android).
  The native list is on by default in Vera Dev. To compare with the React
  Native list, go to conversation info → Testing → Native Message List, or
  More → Account → Developer → Native Message List. When done,
  `scripts/phone.sh main` gives main's Vera Dev install link back. Don't
  uninstall production Vera.

**Android head-to-head, current** (simulator, software GL). Both lists in
the real app, with production JavaScript (`__DEV__` false, as the
orchestrator set up), the same `benchFling` at 5,500 dp/s for 10 s, and a
burst of 150 messages over 15 s. The heavy lock was held, with no boots or
builds. The React Native list ran first, then native, one run each. Native
loads 5 screens ahead, the React Native list 3. Files:
`.cache/bench/20261023-212404-android-all.jsonl` (bubbles) and
`.cache/bench/20261023-213011-android-all.jsonl` (stacked), with their
`.frames-stop.log`, and `.cache/native-polish-build/android-final-h2h-{bubbles,stacked}.log`.

| Layout, scenario | FPS RN → native | Slow intervals | Worst interval  | JS stalls >50 ms | Main thread >16 ms (`gfxinfo`) | Mac CPU avg (peak), RN / native |
| ---------------- | --------------- | -------------- | --------------- | ---------------- | ------------------------------ | ------------------------------- |
| Bubbles, scroll  | 41.1 → 51.0     | 119 → 100      | 183.3 → 50 ms   | 72 → 25          | 134/297 → 7/491                | 51% (53%) / 73% (86%)           |
| Bubbles, burst   | 28.8 → 59.6     | 117 → 8        | 1,366.7 → 50 ms | 68 → 28          | 103/246 → 0/67                 | 41% (57%) / 14% (36%)           |
| Stacked, scroll  | 56.8 → 59.5     | 32 → 6         | 83.3 → 33.3 ms  | 82 → 22          | 56/467 → 5/595                 | 61% (72%) / 59% (82%)           |
| Stacked, burst   | 51.8 → 60.0     | 127 → 0        | 83.3 → 16.7 ms  | 117 → 19         | 149/540 → 0/74                 | 58% (72%) / 13% (39%)           |

- Scrolling, native travelled 55,091 dp with no wait at the oldest row in
  both layouts. The React Native list travelled 28,345 dp waiting 3,483 ms
  (bubbles) and 32,642 dp waiting 3,600 ms (stacked).
- Loaded rows went 50 → 400 (React Native) and 150 → 800 (native) in
  bubbles, and 100 → 550 and 100 → 900 in stacked. So the lists did
  different amounts of loading, and run order and warm caches affect these
  numbers.
- Slow intervals are the UI callback's intervals, which software GL makes
  coarse. The main-thread column is `gfxinfo`'s drawn frames, a separate
  measure, and its frame counts differ.
- The reporter flagged the native bubbles scroll (73%, peak 86%) and the
  React Native stacked scroll (61%, peak 72%) as "the Mac was busy". Those
  two rows are the least reliable. Native bubbles scroll still had 100 slow
  intervals.
- No zero-slow claim and no universal cost claim. The current iOS numbers
  are in the final iOS checkpoint above, and the earlier preview-round
  numbers are separate.

**Android motion check.** Light 17/18 and dark 17/18, both exit 1, with no
Metro errors (`.cache/native-polish-build/android-final-motion-{light,dark}.log`).

- Light stacked firehose: 51 frames, 1 failing and 9 minor. The fail is a
  jump-back at 3.299 s (middle, 644 pt, +11).
- Dark bubbles firehose: 74 frames, 2 failing and 2 minor. The fails are
  jump-backs at 3.180 s (middle, 332 pt, −28) and 3.197 s (+27).

I read the exact contacts (`polish-android-{light,dark}-firehose-exact.png`,
frames in `.cache/native-polish-build/android-firehose-review-windows.json`;
these frames are 10–46 ms apart). In light, Firehose 1 to 4 rise steadily,
and the rows above hold their order. In dark, Firehose 1 to 3 rise, then
Firehose 5 arrives before 4: an out-of-order `dev:burst` arrival. Both show
the same message text repeated several times on screen, which makes an
analyzer alias plausible, but that isn't proved. I found no reversal or
missing row, so there's no code change. The formal failures and minors
stand. It isn't an all-pass. The earlier wide light contact missed the
actual flag, so only the exact contacts count.

**Newest row against the composer, Android.**
`.cache/native-polish-build/android-bottom-summary.json` has 8 samples: both
layouts, with the media newest and the keyboard down, the keyboard up (a
reaction on it in stacked), ten lines, and after sending. Every gap is 21 px,
which is 8 dp at density 2.625. The field went 105 → 585 → 105 px and the
bar 211 → 691 → 211 px. The after-send sample was the first snapshot
straight after Send, with no delay. That makes it a resting check, not a
latency or frame-exact one, and it isn't on the A16. With ten lines and the
keyboard up, a very tall photo's top runs off the screen, but its bottom
stays 8 dp above the composer.

**Jump to latest, Android.** Shown with the keyboard up, a real tap worked:
the button sat 12 dp above the composer, and the tap returned to the newest
row (`polish-android-jump-keyboard-{visible,landed}.png`). The hidden
button's accessibility fix (`06003b06`, `aria-hidden`) is right in source,
through React Native's `View` mapping
(`.cache/claude-integration-polish/20261023-163203/hidden-jump-fix.md`). The
raw helper still lists views marked unimportant, and the compressed
uiautomator dump exited 137 with the app still alive. So TalkBack (and
VoiceOver) focusability isn't verified, and this doesn't claim the node is
gone from the raw tree.

**Memory, Android** (`.cache/native-polish-build/android-memory-summary.json`).
A fresh launch, then three ordinary photo-three lift, menu, land, viewer and
close cycles. PID 7200 survived throughout, with 2 native screens each time.

| Stage    | PSS        | RSS        | Swap PSS   |
| -------- | ---------- | ---------- | ---------- |
| Baseline | 745,234 KB | 165,992 KB | 626,568 KB |
| Cycle 1  | 861,142 KB | 381,980 KB | 535,801 KB |
| Cycle 2  | 862,373 KB | 387,904 KB | 525,242 KB |
| Cycle 3  | 897,304 KB | 406,704 KB | 541,619 KB |

Most of the rise is in the first cycle (PSS +115,908 KB); cycles 2 and 3
add 1,231 KB and 34,931 KB, with no repeated big jump. Caches filling on
first use could explain the first rise, but that isn't confirmed. That doesn't clear a leak. The earlier 2 GB emulator kill stays a
stress limit; retained routes are still only a hypothesis.
`polish-android-memory-flow.mp4` (179 s) covers the first cycle and the
second open only, not all three, because of the recording limit. The
emulator's exit record (`polish-android-exit-info-final.txt`) lists 16
recent Vera Dev exits, all `USER REQUESTED` (`FORCE STOP`): the planned
relaunches. It's a recent record, not the whole history, and the earlier
2 GB kill stays on record.

**Media, reactions and typing, Android.**

- Carousel (`polish-android-carousel-{before,last,reversed}.png`): it runs
  the full width, and the last photo settles fully on screen with a 16 dp
  right margin.
- Lift: `polish-android-photo3-lift-retry.png` shows only the right tile, the
  real view, with its neighbours and chips staying put. The first
  `polish-android-photo3-lift.png` was a first touch stopping the strip, not
  a hold, so it doesn't count.
- Viewer: `polish-android-viewer-photo3-ready.png` shows the right photo
  (`polish-android-viewer-photo3.png` was taken too early, with the chat
  still showing, so it isn't proof). Three cycles, with no attached-view
  exception.
- Reactions (`polish-android-reactions.mp4`, 133 s; `polish-android-carousel-{heart-hold,heart-toggled,party-hold}.png`):
  holding the field photo's ❤️ 2 shows Jonah and Leo. A tap adds you (3),
  and another takes you off (2). The second photo's 🎉 2 shows Maya and you,
  on that exact part. No haptic or latency claim.
- Deck (`polish-android-deck-{initial,left,right,last}.png`): left goes
  0 → 1 (the stump), right back to 0 (Grand Central), and three lefts reach
  3 (the field). The front tapback overlaps the photo's corner, and tapping
  it opens Jonah and Leo as reactors, without toggling.
  `polish-android-deck-viewer.mp4` (190 s) has paging, edges and chains; the
  late zoom and close may fall after it ends, so it isn't all on video.
- Viewer screenshots (`polish-android-viewer-{last,last-edge,first,first-edge,zoom}.png`)
  show the black backdrop with no chat showing at the edges. Zoom out and
  swipe down closed it, and the native Close worked in 3 cycles. A truly
  uncached page isn't verified at runtime.
- Avatar recede (`polish-android-avatar.mp4`, 22 s; `polish-android-avatar-{first-block-before,receded,restored}.{txt,png}`,
  Jonah at the start of a block): the real rect goes 95 × 95 → 58 × 58 →
  95 × 95 px, with its top fixed at 1604, as the photo passes the screen's
  physical left edge. An earlier fixture, Maya with an empty body, was
  grouped with no avatar and isn't valid for this.
- Typing: DMs in bubbles (`polish-android-dm-bubbles.mp4`, 9.91 s) and
  stacked (`polish-android-dm-stacked.mp4`, 6.73 s) show no faces, and the
  stacked label sits at the text column. It's a DM with Maya, not the
  actual Vera assistant. The bubbles frame probe (80 slow, worst 50 ms, Mac
  44%, peak 92%, normal JavaScript, software GL) isn't a clean performance
  result. In a group (`polish-android-group-typing-final.mp4`, 9.75 s, and
  its final PNGs), Maya's and Jonah's faces show in the stills, with three
  bots scheduled and arrivals coalescing. Not three faces in one frame.
  `polish-android-group-typing.mp4` had LogBox over it, and
  `polish-android-group-typing-clean.mp4` was a blank setup. Neither is
  proof.
- Composer: `polish-android-composer-bubbles.mp4` (125 s) and
  `polish-android-stacked-send.mp4` (53 s) have a real fill and send.
  `polish-android-composer-stacked.mp4` (167 s) only closes and opens the
  keyboard, with no send. The earlier `polish-android-bottom-bubbles.mp4`
  isn't evidence the field resets.
- Dark (`polish-android-dark-{stacked,bubbles}.png`): Android's fill chips
  are legible.

**Android dev warning at launch.** In normal `__DEV__` on Android, a cold
launch logs "Can't perform a React state update on a component that hasn't
mounted yet". The source points at expo-router's own Android
initial-URL path, not this round's code
(`.cache/claude-integration-polish/20261023-163203/android-mount-warning-assessment.md`).
That's a hypothesis: there's no base-branch comparison and no traced root
cause. Waiting 8 s after a fresh relaunch shows the inbox with a small
toast. Its small X (998, 2233) closes it, and the conversation is stable
after (`polish-android-launch-waited.png`, `polish-android-group-waited-ready.png`).
The generic dismiss-overlay sometimes opened the full LogBox, and
dismissing that once left a blank screen. Shawn may see the warning in
Vera Dev on Android; it isn't cleared or suppressed. Production
JavaScript's motion runs had no Metro errors.

**Still open.**

- Everything on Shawn's phones (both clients are delivered):
  - dictation (physical: the spinner, caret, selection, height and
    backspace);
  - TalkBack and VoiceOver;
  - interactive keyboard dismissal;
  - safe-area variants;
  - the A16's composer shrink and frame-exact transitions;
  - reaction tap feel and haptics;
  - glass on his 120 Hz iPhone;
  - video playback on Android;
  - passkey sign-in on Android;
  - the typing hand-off with real bots;
  - an uncached viewer page on a real network.
- Then the separate combined native plus data-pass test.

### Pending checks only a phone can do

- Shawn's iPhone: reaction tap latency and haptic, chip hold, dictation,
  composer shrink at 120 Hz, carousel and deck feel, viewer paging.
- Galaxy A16: composer shrink, carousel settle on the rightmost photo,
  deck direction, viewer paging, video playback (black in the emulator).
- Both: the DM typing bubble and the hand-off with real bots.

### Evidence to collect (orchestrator runs devices)

- Before and after screenshots: DM typing, stacked chips (glass vs
  solid), carousel edges, deck pile, viewer edges.
- Videos: chip tap and hold, composer multiline send, viewer paging
  across the ends and fast double swipes, carousel and deck swipes both
  ways, typing hand-off in a DM and the busy group.
- `sim.sh frames` for each motion, before and after. Glass vs solid chips.
- Nothing committed; upload with `scripts/evidence.sh`.

## Phone feedback round 2, 2026-10-24

Shawn tested the Vera Dev clients from round 1 (Metro on 8492, the
isolated backend `uncommon-curlew-869`, no data pass). Keep: the
performance (his Galaxy A16 went from barely usable to fast), the new
carousels, the reactions and their wrapping to a new line, and iOS
dictation, which now works.

Who wrote what (superseded rule, from 2026-10-24 afternoon): every product,
UI, test and doc edit is written by a headless Claude CLI, one saved
session per platform, to save provider limits. The orchestrator (Codex)
reads, orchestrates, builds and commits, and writes no code. This
integration session writes the shared JavaScript, the contract, this
plan and the PR text; native files belong to the platform sessions.
Earlier today a direct Opus T3 run wrote `b5689cef` (this plan's round-2
items), `50937867` (stacked typing faces), `5920a109` (send inset, menu
keyboard hold) and `5162d2c3` (viewer close, video). This session reviews
those and writes everything after.

**Current authorship, 2026-10-24:** Shawn stopped all Claude work to save
his remaining allowance. Sol now writes product, UI, tests and docs
directly. Integration Claude PID 56222 was interrupted by the parent;
no Claude process remains or may be resumed. Its saved session
`446864ec-c77e-484a-9964-0166eed73a28` and partial source/logs under
`.cache/claude-integration-polish/20261023-163203/` are preserved. Both
native owners also stopped Claude and retain their source checkpoints.

Owners: **integration** (this branch: shared JavaScript, combined builds,
QA, the contract), **iOS** (#277, now thread
`mcp:c30488f8-01dc-4b59-859b-3cf5befd505e`), **Android** (#275, unchanged).
Contract changes are agreed by all three before anyone builds them.

| #   | Item                                                                                                                                                         | Owners                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| 1   | A multiline send flicks the list down, then back up. The composer's shrink and the arrival must be one move, never down.                                     | integration, iOS, Android                 |
| 2   | A long press with the keyboard up: the message stays raised as the keyboard goes down, and on close goes straight to its place above the returning keyboard. | integration, iOS, Android                 |
| 3   | Swiping down to close the keyboard also scrolls the chat (#165). One swipe closes it and leaves you at the bottom.                                           | iOS, Android                              |
| 4   | Stacked typing: a DM shows the other person's photo; initials circles in groups are squished. Match the React Native indicator exactly.                      | iOS, Android (integration if the mapping) |
| 5   | The viewer's close button flickers and ghosts 100–200 pt toward the swipe while paging.                                                                      | integration                               |
| 6   | Video opens paused (must play at once), and its play button flashes on the row after a swipe-down dismiss. A regression.                                     | integration, natives (cells)              |
| 7   | Opening a photo from a carousel takes about a second. Open at once from the loaded image, then sharpen.                                                      | integration, natives                      |
| 8   | The busy group lagged on its first open on his iPhone. Profile a cold open of a busy media chat on a release-like build.                                     | integration, iOS                          |
| 9   | A held deck lifts the whole pile, and its reactions draw over the menu. Lift the front card only; nothing from the list over the menu.                       | iOS, Android, integration (menu layering) |
| 10  | Deck: center cards of different aspect ratios vertically; antialias the rotated edges.                                                                       | iOS, Android                              |
| 11  | Deck animation: too slow on quick swipes; a card coming back under the pile stays on top, then flickers behind.                                              | Android (check iOS)                       |
| 12  | Reaction height changes: Android jerks and moves twice; iOS doesn't move at all. One smooth move on both.                                                    | iOS, Android                              |
| 13  | Android arrivals don't rise and fade in (the first reply after typing just appears).                                                                         | Android                                   |

Status: both native sources are now integrated (`c6e04b39`: iOS
`ffa83e47`, Android `b7a37cdf`). None of the 13 items is checked at
runtime yet, and the combined builds and QA are still ahead. (Earlier,
at 16:00, the iOS thread's first run had failed at the provider handoff,
and was restarted in its new thread.)

### Items 1 and 2: review of the shared side (`5920a109`), and its tests

Source findings only; nothing here is checked on a device.

- **Item 1, the agreed shape.** `useComposerInset` (`send-inset.ts`) keeps
  the composer's old height in `insets.bottom` after a send, and lets the
  new one go in the render whose newest row changes, so native gets it
  with the message's rows. It lets go anyway after 333 ms (#257's 20
  frames). Every other height change goes at once.
- **Fixed: Android never armed it.** The hold starts only when
  `ComposerHeight.sent` is set, and only `onSentShorter` sets it. Its one
  caller was `settle` in `field-glass.tsx`, which runs only on iOS,
  because it's #257's glass path. So on Android a send's shrink reached
  native one render ahead of the message: the round-1 down-then-up
  flick. Now on Android, with the native list only (`roomCloses` false),
  `reportShorter` watches the field after a send and calls
  `onSentShorter` when it gets shorter, with no glass hold. iOS and the
  React Native list on both platforms are unchanged.
- **Kept, with limits (from the source, not reproduced):**
  - The hold is taken under the newest row as JavaScript sees it when the
    shrink arrives. If the message sent already rendered before that, only
    the timer lets go, and the composer's height reaches native alone, a
    beat late. #257 measured the row about 70 ms after the shrink, so this
    should be rare.
  - Someone else's message landing first lets the hold go with that
    arrival, still as one move.
  - If the Bar's `onLayout` reaches JavaScript before the UI thread sees
    the shrink, `onSentShorter` finds the height already taken and doesn't
    arm the hold. That's #257's own race.
  - An edit save also calls `settle`. It adds no row, so the shorter height
    goes after 333 ms, alone.
- **Item 2.** `useMenuKeyboardHold` (`menu-keyboard-hold.ts`) freezes in
  the same event that opens the menu, so `keyboardFrozen` reaches native
  in the update that starts the lift, before the modal takes the keyboard.
  Closing into the chat sets `returning`, refocuses the field if the
  keyboard is down, and lets go on the keyboard's next `onEnd` with height
  above 0, or after 1.5 s. Closing into a sheet or link lets go at once.
  No defect found in the source. Its keyboard handler is set up once, but
  `release` uses only refs, setters and shared values, so that's sound. One
  edge: if the keyboard never went down (Android with a modal may not take
  it), there's no `onEnd` to wait for, and the freeze holds for up to 1.5 s
  after closing. Android's own modal sync usually reports an end. Check it
  at runtime before changing anything.
- **Tests.** `send-inset-state.ts` holds the inset's state as plain steps,
  used by the hook. `send-inset-state.test.ts` covers: the message
  arriving after the shrink; a timeout; a later send's hold surviving the
  earlier timer; someone else's message first; a line typed during the
  hold; and the late-capture limit above. The Android `reportShorter`
  worklet and the menu hold run on keyboard-controller events and timers.
  A unit test of them would restate the code, so they're left to runtime
  QA. Nothing is runtime-verified yet.

### Measurement tooling (batch 3), not runtime-verified

- **Photo open (item 7):** `veraDev.photoTiming` (`features/dev/photo-timing.ts`,
  `photo-timing-log.ts`) marks the native list's photo press, the viewer's
  layout, and the pressed page's layout, image load start, load and
  display. It's in development and profile bundles only, keeps the newest
  200 marks in memory, uses no React state, and adds no native fields. Read it
  with `scripts/sim.sh eval "JSON.stringify(globalThis.veraDev.photoTiming.report())"`,
  and clear it with `.reset()`. The marks are JavaScript-thread times (upper
  bounds). The native owner's `Perf.swift` signposts cover touch to press,
  including the double-tap wait. Compare each clock's spans separately, and
  match native and JavaScript records by order, row and index. Never
  subtract one clock's timestamps from the other's.
- **Motion:** `scripts/motion/check.sh` adds `react-front-media`,
  `react-front-media-remove` and `composer-send`, which run only when
  named, so a full run stays the same 18. Their setup and actions are
  logged to `<run>/<label>.actions.log` with exit statuses, and a failed
  step fails the case (batch 4). `composer-send` also checks that the
  message was sent. The device selectors are untried. `composer-send` drives the real composer through agent-device
  (`MOTION_AD`). Typing to the first arrival is `typing-reply`, and its fade
  needs a frame review. The dev screen's toggle now reacts on the first
  photo with an exact-part key (Android's inherited hunk, corrected).
- **Video fixture:** the dead Google sample is replaced with MDN's CC0
  `flower.mp4` and a first-frame poster. The parts are unchanged. Fresh
  seeds need the isolated backend pushed.

Commands and limits are in
`.cache/claude-integration-polish/20261023-163203/round2-measurement-handoff.md`.

### Reaction stand-ins (item 12), review of the shared side

Asked by Android: does a toggle's stand-in last until the query shows the
answer, or clear early and move the row twice? **No shared bug, from the
source; not checked on a device.**

The toggle's mutation and the reactions query's home source share one
Convex connection, the home PDS's deployment URL. Convex runs the query
subscribers for a `Transition` synchronously, before the mutation's
promise continues. `RoutedPdsQueryObserver` and `PdsQueryClient` then
`setQueryData` synchronously. TanStack 5.101.4 updates the
`QueryObserver` and `QueriesObserver` results at once, deferring only
React's notification. So the stand-in's `onSettled` clear and the
server's answer arrive in one render, with the same reactions, and the
same row height.

Rapid taps, out-of-order answers, rollback and per-part toggles stay
covered by `reaction-toggles.test.ts`. If Android still sees two moves
for one toggle, look at whether native re-measures or re-animates a row
whose reactions didn't change. Details and an item 7 measurement
appendix (photo open: the double-tap wait, the route, a full-size decode
from disk) are in
`.cache/claude-integration-polish/20261023-163203/round2-reaction-handoff.md`.

**Settled (2026-10-24): a send can ease the list down once.** The
accepted item 1 stands, and the contract is unchanged: native moves the
rows by the new rows' height less the composer height given back, and if
that's negative, eases down once. That happens when the sent row is
shorter than what the composer gave back, for example:

- Stacked text runs in a column wider than the composer's text area, at
  a 20.3 pt line against the field's 22. So a long message continuing a
  run can take fewer points in the list than the composer gives back
  (up to about 200 pt from ten lines).
- A reply's bar in the composer can be taller than the quote the message
  shows.
- An edit save gives height back and adds no row.

The parent thread's clarification settles it, and no further decision
from Shawn is needed. One smooth downward ease that keeps the newest row
8 pt above the composer is acceptable. These are not:

- a flick down then up;
- the newest row hidden;
- a jump;
- a gap under the newest row that stays.

Item 1's "never down" means the flick, not a rule that the list never
moves down. This is the acceptance for item 1 in combined QA. No
implementation or device run has shown it yet.

### Composer blocker and bounded geometry probe (Sol, 2026-10-24)

The clean stacked eight-line clip **fails** item 1: the same old and new
rows rise too far, then move down together. This is not the allowed
single net-down easing. Evidence: `.cache/evidence/r2-ios-stacked-eight-line-clean.mp4`
and `r2-ios-stacked-send-clean-contact.png`; Mac CPU averaged 24%, peaked
at 25%. The older 77%-CPU recording is diagnostic only. Formal analyzer
flags are separate from this direct row-identity finding.

The source permits arrival rows with the old tall inset, followed by a
shorter inset alone. The current **unaccepted checkpoint** holds new
messages for a measured height but releases after 500 ms using `live`.
That can still reverse if actual UI shrink happens later. Passing its
tests does not make that boundary acceptable. No replacement deadline,
including two seconds, has been adopted. This blocks fresh phone clients.

The parent authorized a dev-only probe before choosing an acknowledgement.
`veraDev.sendTiming.start()` enables a bounded local ring; `report()`
returns raw marks, `sample()` reads current geometry, and `stop()` stops
recording. It records owner/send identity, monotonic and wall timestamps,
font scale, placeholder, bar/field/TextInput rectangles, `live`, and bar
height callbacks. It stores no message text, adds no React state or frame
loop, and never supplies a height or release signal to the list. A layout
effect reads the existing clear commit, including same-height sends.
Committed shadow-tree geometry is not an acknowledgement of physical UI
completion.

Measured in the combined iOS 27 Debug simulator with native `7176370b`:

| Font scale | Placeholder | Send        | First empty commit bar / field | Later live |
| ---------- | ----------- | ----------- | ------------------------------ | ---------- |
| 1          | Message     | Eight lines | 76 / 40 pt                     | 76 pt      |
| 1          | Message     | One line    | 76 / 40 pt                     | 76 pt      |
| 1.353      | Message     | Eight lines | 84 / 48 pt                     | 84 pt      |
| 1.353      | Message     | One line    | 84 / 48 pt                     | 84 pt      |
| 1.353      | Reply       | Eight lines | 84 / 48 pt                     | 84 pt      |
| 1          | Reply       | Three lines | 76 / 40 pt                     | 76 pt      |

The multiline clear commits still read the old `live` (230 pt at scale 1,
274 pt at scale 1.353) while their rectangles already had the empty
height. Later reports and samples matched the rectangles. The normal
one-line send had no height callback; its unchanged geometry was visible
in the commit. Large-font empty field height was 48 pt, not a fixed 40 pt.
These are measured cases, not a proof for every font, attachment, or
placeholder. The large Reply sample was taken before restoring normal
font size; later font-change marks must not be attributed to that send.

Raw evidence: `.cache/round2/probe-ios-normal-settled.json`,
`probe-ios-normal-one-first.json`, `probe-ios-large-settled.json`,
`probe-ios-large-one-settled.json`, `probe-ios-large-reply-first.json`,
and `probe-ios-final.json`. Text-entry automation returned
`TEXT_ENTRY_MISMATCH` with visually identical multiline strings; snapshots
and the sent message bodies were checked rather than counting the failed
command as success. Android measurements are pending; no acknowledgement
implementation or native contract change is selected yet.

The separate approved fast-media change is integrated from iOS `7176370b`
and Android `8d312353`. Same-photo iOS signposts measured finger-up to
native dispatch at 0.329 ms, versus 351.746 ms before the recognizer
change. These are single warm Debug profiler samples. JS press-to-display
was separately 152.673 ms after; clocks are not subtracted or summed.
Raw trace: `.cache/round2/profile/photo-open-fast.trace` and
`photo-fast-native-spans.json`. This does not clear the composer blocker
or the remaining round-2 runtime gates. The phone Metro on 8492 stays
unchanged; no fresh physical phone build has started.
