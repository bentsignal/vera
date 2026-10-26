# Native message list on iOS: phone feedback round (2026-10-23 evening)

The iOS side of the round in `native-message-list.md` ("Phone feedback
round"). Shawn ran private preview build 10 on his iPhone. The list is
much faster than the React Native one, and that, the real-content lift,
and reader anchoring all stay as they are. This records what was wrong in
the iOS source, what changed, and what still needs a device. The contract
changes are integration's (revision 3, agreed by both natives). This file
covers only `apps/mobile/modules/message-list/ios/`.

## Causes found in the source

- **Reaction taps waited about 0.3 s.** `tap.require(toFail: doubleTap)`
  made every single tap, reactions included, wait for the double tap to
  fail. Nothing native played a haptic. At 6b264fa2 the module had no
  haptic of any kind.
- **Holding a chip opened the message menu.** `MessageCell.hit(at:hold:)`
  checked reactions only for taps, so a hold fell through to the part
  under the chip.
- **Deck tapbacks were every card's reactions merged.** They were keyed by
  whichever card first had each emoji, so a tap could toggle the wrong
  photo's reaction.
- **DMs showed a typing photo.** The typing row had no way to say it was a
  one-on-one conversation. Because of the faces, the bubble also sat 38
  points right of where the DM's message lands, so the morph jumped
  sideways.
- **The typing to message morph was rough.** `grow` animated the bubble's
  frame with `UIView.animate`. Its tail is placed in `layoutSubviews`,
  which runs after the animation block, so the tail jumped to the end. The
  text faded in a third of the way through, spilling out of the small
  bubble. It also ran for messages React Native doesn't morph (photos,
  quotes, link cards), and those then showed with no rise and no fade.
- **The carousel was clipped at the photo column.** The strip started at
  the text column with `clipsToBounds`, so cards were cut off there. Its
  snapping capped a swipe at one card past the nearest, with
  `decelerationRate = .fast`, which felt like the gesture stopped halfway.
- **The deck threw both ways to the same card** and swapped content when
  the throw ended, so the card vanished after a short flight and its blur
  snapped off.

## What iOS does now

- Reaction touches go to their own tap recognizer, which waits for
  nothing. They play a light impact on touch-up, and the chip or tapback
  shrinks under the finger. A tapped stacked chip is drawn toggled at
  once, through `ReactionToggle` on the row's JSON. That lasts until
  JavaScript's row agrees, or 3 s. Tapbacks aren't previewed, because
  their tap shows who reacted.
- Reaction presses and holds report the exact part, the media item's
  `index`, and that part's frame. A hold adds `element: "reaction"` and
  `reactionKey` (`MessageLayout.target(forPart:)`).
- A deck's tapbacks belong to each card and are drawn on it while it's in
  front.
- `TypingRow.showFaces` is read in both layouts. When it's absent, faces
  show. Without faces, a bubble starts at the padding and a stacked label
  at the text column.
- The morph mirrors `bubble-morph.tsx`. It runs only for a bubbles message
  that's text alone. Over 320 ms on `ease`, the bubble goes from the
  typing bubble's frame to its own, with the tail riding along. The dots
  are gone by a third, then the text fades in over 220 ms. It's all Core
  Animation, and updates to that row wait until it ends.
- The carousel spans the row, with its first card at the text column.
  It uses UIScrollView's normal deceleration and settles on the card
  nearest where the fling would stop, with the last card fully on screen.
  The author's photo shrinks toward its top as the cards pass under it,
  the same curve as Android.
- The deck is a pile: the next card behind on the right, the one before
  on the left, both turned and offset. Swipe left for the next, right for
  the one before. The thrown card goes out with the finger and tucks in
  behind on that side. Each card cross-fades to a pre-blurred copy with
  depth. Android draws the same pile.
- Stacked chips can be drawn three ways: `glass` (`UIGlassEffect`),
  `sheen` (a stretchable image with glass's tint, rim and shadow, with no
  backdrop, its cost unmeasured) and `fill` (a flat color). The app's
  `VeraChipMaterial` default picks one at launch. Without it, it's glass
  on iOS 26 and later and fill before (see "Chip material" below).

## Carousel lift (follow-up)

Holding a carousel card lifted the whole strip, neighboring cards and
chips included. `liftPieces` found the carousel block and lifted its
view, framed as the whole strip, ignoring `index`. That had been so since
before the polish; the full-width strip made it plain. Now the held
card's photo lifts alone, framed where it's drawn
(`CarouselLayout.cardFrame`), and lands back there. Its chips stay in the
strip, as the React Native menu lifts only the photo (`MediaCopy`) and
Android lifts only the tile. A stale index falls back to the item's part.
An index with no part means an item of a group, so it picks the first
media that has that item, never a caption. A part the message doesn't
have, an index no media has, or a carousel lift that can't name a card
lifts nothing (`MessageLayout.liftedPart`, `CarouselLayout.liftedItem`).
`Tests/run.sh` checks the lookups and the card's frame, alone and
composed (118 checks).

## Chip material

Shawn prefers the React Native list's glass chips. Before deciding, I
declared a rule: glass becomes the default if, flinging the same chat,
its slow frames stay within the noise between each material's own two
runs of fill's. Integration ran fill, sheen, glass, sheen, glass and fill
on one binary (308a03ae). The runs were in the simulator at 60 Hz,
stacked, light, the busy group, `benchFling` at 5500 pt/s for 8 s. LLDB
checked each run's setting.

| Material | Slow frames, two runs | Over 33 ms |
| --- | --- | --- |
| fill | 14 and 7 | 9 and 6 |
| sheen | 6 and 9 | 5 and 7 |
| glass | 5 and 8 | 5 and 5 |

The worst frame in every run was 41.5 to 43.7 ms. The first fill run was
the cold one: it loaded fewer rows (700, not 750) and waited 183 ms at the
oldest row, so it doesn't decide anything. Glass stayed within the noise
of the warm fill run, so it's the default on iOS 26 and later. That shows
only that the simulator can't tell glass and fill apart. It doesn't show
glass is faster, free of slow frames, or anything about a 120 Hz iPhone,
the dark theme, or Android. Before iOS 26 glass would be an unmeasured
blur, so it's fill there. Shawn's phone is the real check.
The PR description has every run's numbers.

## Phone feedback round 2 (2026-10-24)

- **Deck lift.** A held deck lifts only its front card (the plan's #9).
  Every tapback of the held row hides while it's up and fades back over
  260 ms (RN `Tapbacks hidden={lifted}`), so nothing from the list goes
  over the menu.
- **Deck motion.** Cards are centered in the tallest card's height and
  antialiased. A throw goes out in about 120 ms (less with speed),
  changes stacking order only once out beside the pile, and tucks under
  in 160 ms. A touch during a throw stops its animators.
- **Reaction picked in the menu.** It used to snap the row once the
  part was back. Now the waiting update goes in animated as the part
  lands, the part lands where it puts it, and the row is drawn once more
  when the part's views are home (`reseat`). So a card, photo or bubble
  that was out shows what changed while it was out.
- **Insets.** They go in with the rows that came with them (contract
  `insets`, send-inset.ts), and wait out a `keyboardFrozen`
  (menu-keyboard-hold.ts), with the keyboard eased in the same move at
  the thaw. `InsetsGate` (Insets.swift) keeps one intent, the latest sent,
  so an older value never goes in after a newer one. The waiting for the
  message sent is JS's.
- **#165.** With the keyboard up at the newest message, a swipe down
  closes it without scrolling.
- **Typing.** Faces draw at their own size inside the ring (RN Avatar's
  fonts). A stacked DM shows the other person's photo, as RN does; a
  bubbles DM shows no face. Both follow `showFaces`.
- **Profiling.** `Perf.swift` signposts (subsystem
  `chat.vera.message-list`) are for a cold-open profile in a release
  build.
- **Photo-tap signposts.** A photo tap is timed from the touch reaching
  the single tap to the press going to JavaScript (`media tap`), with
  the finger's lift marked inside it, which separates contact time from
  the double tap's wait. They're compared with JS's own timestamps by
  order, not by clock.

Current round 2 validation, 2026-10-24: 171/171 host checks pass.
All 19 module Swift files, including `MessageListModule.swift`, typecheck
against the installed ExpoModulesCore and SDWebImage plus the real iOS
simulator SDK for arm64, without stubs or copied-source edits. This does
not link or run an app. Lint, typecheck, tests and React Doctor against
`origin/t3/native-message-list` pass. Integration owns the combined client
compile, motion recordings, antialiasing cost and release-like cold-open
profile; none of those is claimed here. No phone client was built.

## Media taps (approved by Shawn, 2026-10-24)

A photo or video opens on the first tap's release: alone, a carousel's
card, or a deck's front card. It has its own tap recognizer, as reactions
do (`TapRoute.swift`), so it no longer waits about 0.35 s for a double
tap to fail. That wait measured 351.7 ms from finger lift to press in one
Debug trace. A double tap on media no longer opens the menu, as the React
Native list's photos behaved; a long hold still does, with the real
content lifted. Text keeps its single tap (after the double-tap wait), its
double tap and its hold. Reactions and taps that stop a scroll are
unchanged. Android makes the same change on its side. Each tap's release
must still land on what it was routed to (`TapRoute`), so a text tap or
double tap that slides onto a photo or a chip does nothing, rather than
that part's press or menu. Native emits every valid media release. The
shared viewer route guard owns duplicate opens; there is no native timer
or suppression window.

Validation: 194/194 native host checks pass, including the tap routing
and release boundary cases. All 20 Swift module files pass the arm64 iOS
simulator typecheck against the real installed SDK and dependencies. This
does not link or run a client. Repository lint, typecheck, tests and React
Doctor against `origin/t3/native-message-list` pass, then format:fix runs.

Still pending in integration's combined client:

- finger up to press, measured again;
- photo, video and per-item media opening;
- a long hold opening the menu with no gallery;
- deck and carousel gestures.

## Native send coordination, 2026-10-24

Shawn authorized Sol for all subsequent work. This checkpoint changes only
native internals and tests, with no contract fields or shared JavaScript.
Shared owns the per-send committed composer-height ACK and exact optimistic
sent-ID readiness. It arms the existing animated latest command immediately
before releasing those rows and their inset together.

If a keyboard freeze starts before the worker applies that pair, native now
holds the entire measured result. It retains one latest full result, rejects
superseded measurement generations, and keeps the current displayed rows,
inset and keyboard offset. The thaw resumes with rows rather than applying
the inset alone. Newer inset intent replaces the old one, and a return to
the applied inset cancels it. iOS diffs the retained full result against the
actually displayed rows; Android's chained worker diffs require its separate
FIFO policy.

A close that meets this barrier keeps the actual borrowed views lifted and
the tapbacks hidden. After the final paired layout is applied, native starts
the existing landing into that cell, or its existing fade if the row left.
This can delay the start of landing until thaw and current measurement are
ready. That behavior cost is explicit; normal landing without the barrier
is unchanged. No copy or guessed landing timer is added.

Animated latest navigation is a generic intent, not an exact-send ACK. It
preserves the visible anchor during an off-bottom row apply and smoothly
retargets the new latest offset after layout, without snapping to the end.
The intent survives applies and scroll completion. A new true command
replaces it; a touch, drag, explicit navigation, lift, or detach cancels it.
A freeze pauses motion and starts. Shared suppresses a canceled or
superseded send before arming; after arming, failure or cancellation can
still finish this generic navigation, as agreed by the parent. There is no
hidden native target, expiration timer, or new API argument.

Validation: 225/225 focused native host checks and all 21 Swift module files
against the real installed arm64 simulator SDK pass. The state tests cover
freeze between release and measurement, already-frozen pairing, thaw and
refreeze, inset supersession/cancellation, stale work, detach, and latest
intent generations/floors/interruption. They do not exercise UIKit motion.

Integration still gates this checkpoint on a combined client compile and
recordings of smooth scrolled-up sends with short and tall messages, exact
8 pt final spacing, interruption and supersession, freeze during measurement,
and real deck/carousel/text landing with reaction height changes. In
particular, check the delayed landing start through keyboard return, removed
lifted rows, and ordinary holds without a pending pair. No client or device
was built or run in this checkout.

## Message taps on first release, 2026-10-24

Shawn explicitly removed the remaining message/text double-tap focus and
menu gesture. This supersedes the earlier media-only approval above. Sol
removed the message's double-tap recognizer and its single tap's failure
dependency. A valid message release now sends the existing press event
immediately. Consecutive valid releases remain presses. Only the existing
320 ms long press invokes the menu callback, which still reports the real
part and frame for lifting. VoiceOver activation is unchanged.

Media and reaction recognizers keep their existing behavior. Release-target
guards, scroll-stop swallowing, latest-intent cancellation, swipe/reveal,
deck/carousel gestures, lift/landing, send ACK, frozen pairs and keyboard
policies are unchanged. No fullscreen viewer zoom, shared source, event field,
native suppression window or composer-height code changed.

Focused validation: 235/235 native host checks and all 21 Swift module files
against the installed arm64 simulator SDK pass. Routing sequences cover
first and consecutive releases, mixed text/media/reaction touches, and
movement across route boundaries. They exercise production routing policy,
not synthesized UIKit touch timing. Ordered lint, typecheck, tests and React
Doctor against `origin/t3/native-message-list`, then format:fix pass. The
heavy lock is released. Integration owns the combined compile
and actual first-release thread opening, rapid taps, long holds with no
press, reaction taps, scroll-stop and swipe recordings in both layouts.

The ordinary composer/list growth bug remains open. The direct Bar.onLayout
observation is shared-owned; no native height path or new field is selected.
Integration owns the one cross-platform height proposal, shared changes and
both updated development clients, delivered together. No early single-client
link, production build, merge, release or data operation is authorized here.
The Android camera Dev crash and unrounded production preview remain a
bounded private production retest item with integration, not an iOS task.

## Mounted composer geometry, revision 3, 2026-10-24

This supersedes the earlier statement that no native height path was selected.
Both native owners and the parent accepted integration's stable revision 3,
contract checkpoint `9affdc9e` and shared checkpoint `b02996b5`. Shared remains
the sole owner of types and React publication. The optional named
MessageListComposer wraps only the existing Bar and publishes owner/sequence.
The list receives persistent authorized release plus explicit gap. No editor
text, height prediction, timer, second shared inset writer, or new keyboard
policy is added.

The iOS module prepares only its default-list and named-composer Fabric
adapters before selector caching. Its local Objective-C++ mount observer seals
after the complete surface transaction, including initial synchronous work.
Surface identity is read on attachment. A module-local weak registry indexes
hosts by surface/owner and checks duplicates when membership or owner changes.
Height-only seals reuse that weak index and read the current host bounds,
without a window search or repeated ancestor walk. The wrapper must have one
Bar child with matching origin and dimensions or the binding falls back.

Native owns ordinary bottom geometry while bound: actual mounted Bar height
plus the explicit shared gap once. Host sequence ahead of the applied release
holds geometry before list props arrive. Every measured full result captures
owner, binding generation, release and paired React inset. Only the current
measurement may apply. Release-only, same-height and cancellation props still
create an apply barrier. A result S after newer host T uses captured S inset,
never T height or authority. Missing/ambiguous hosts after a complete seal use
explicit legacy geometry and a fresh generation; stale cached heights cannot
escape. Rebinding, owner changes and detach reject old results.

### Explicit close while an authorized pair is frozen

The parent and both native owners also accepted a close-only exception. At
close, native captures owner, binding generation, authorized release, close
token and work-generation floor. Only that release can finish after its mount
seal while the keyboard remains frozen. Both result completion and layout
retain the applied keyboard offset, so the hidden root keyboard is never used
for this flush. The real part remains borrowed until the final paired layout,
then its existing 240 ms landing captures the new raised destination. S after
unreleased T still uses captured S inset and leaves T held. This can delay
landing start until worker/seal completion, but no longer requires thaw.

No-pair or merely unreleased-host close starts normally into current raised
geometry. A newer release, binding lifetime, refreeze, new lift or detach
invalidates obsolete close authority. Cancellation lands into current geometry
rather than waiting on a canceled permit. A new lift completes any interrupted
real-view restoration before borrowing again, preventing an old landing
container from becoming the new views' home. Ordinary observations remain
blocked through actual restoration. No native thaw, focus/window handoff,
latest-navigation restart or new shared field is added. iOS retains its
current latest-full-result policy; Android keeps its separate FIFO policy.

Focused checks pass: 314/314 compiled host checks, all 23 Swift files against
the installed arm64 simulator SDK, and the Objective-C++ bridge against actual
React Native headers and SDK. These cover release/host order, complete seals,
S/T authority, fallback, remount, cancellation, stale generations and close
permissions. They do not prove physical Fabric mounting, UIKit motion, or
Modal lifetime. Opt-in DEBUG `VeraComposerLayoutTrace` default or
`VERA_COMPOSER_LAYOUT_TRACE=1` logs owner/sequence/height/seal/apply metadata,
including frozen-close keyboard offset, with no text. Ordered lint,
typecheck, tests and React Doctor against `origin/t3/native-message-list`,
then format:fix pass. The heavy lock is released.

Integration owns the combined Pod/link build and runtime gate: both layouts,
fonts, newline/backspace/wrap and attachment growth with same-row trajectories;
clear-before-list and delayed UI send ordering; matching actual draft height;
missing/rebound hosts; real menu close before and after worker finish; raised
landing and keyboard return; normal unpaired close, interruption and final
8 pt gap. Both updated Dev clients must be delivered together. This checkout
has run no device, full-client or phone build and claims no runtime pass.

## Stacked body reactions before media, 2026-10-25

Shawn's photo shows body `Testing`, then a photo with its correct heart,
then the body's thumbs. Stacked measurement appended message reactions after
all blocks and footers. It now places those chips directly under the first
text block, before subsequent media. The text-absent trailing path and
per-media chip placement/targets stay unchanged; bubbles use separate code.
Only this layout ordering and its position/part-target regressions changed.
330/330 native host checks, the 23-file installed simulator SDK typecheck,
ordered lint/typecheck/tests/React Doctor, then format:fix pass. Existing
4 pt chip spacing is retained. The heavy lock is released.
Integration owns brief actual-client verification. No device or full-client
build, gesture/composer change, benchmark or profile was run here.

## Checks

- Earlier phone-polish checkpoint: `Tests/run.sh`, 94 checks. 61 of them are new, for the reaction toggle
  and hits, exact parts, deck tapbacks and the pile, the carousel's bounds
  and settling, the avatar recede, `showFaces`, and morph eligibility.
- Still to do in integration's combined client: the motion check and
  `sim.sh frames`, before and after, for reaction tap and hold, carousel
  and deck swipes both ways, and the hand-off in a DM and a group. Then
  the chip material comparison, then Shawn on his phone.
