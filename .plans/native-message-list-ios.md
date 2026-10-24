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

## Checks

- Earlier phone-polish checkpoint: `Tests/run.sh`, 94 checks. 61 of them are new, for the reaction toggle
  and hits, exact parts, deck tapbacks and the pile, the carousel's bounds
  and settling, the avatar recede, `showFaces`, and morph eligibility.
- Still to do in integration's combined client: the motion check and
  `sim.sh frames`, before and after, for reaction tap and hold, carousel
  and deck swipes both ways, and the hand-off in a DM and a group. Then
  the chip material comparison, then Shawn on his phone.
