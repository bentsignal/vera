# Native message list: Android polish after the phone previews

Shawn tried the private previews on his iPhone and his Galaxy A16 on
2026-10-23 and found the native list much faster on both. This note covers
the Android native side of his feedback: what caused each problem, what
changed, and what still needs a device. The full checklist and the shared
contract decisions are in the integration branch's
`.plans/native-message-list.md` ("Phone feedback round, 2026-10-23
evening"). The contract additions (revision 3) were agreed by both native
owners and integration before Android sent them. Paths below are under
`apps/mobile/modules/message-list/android/src/main/java/chat/vera/messagelist/`.

Kept as they were: the real-view lift (`Lift.kt`), the third-photo part
lookup (`LiftTarget.kt`), holder pinning and transition-safe removal, the
carousel's `recycleChildrenOnDetach = false`, and the outbound WebSocket
compression policy.

## Causes and changes

### Reactions

- **Holding a chip opened the message menu.** `ChipView` had a press
  target but no hold target, so `MessageListView.Touch.under` fell back to
  the nearest block. Chips and tapbacks now carry a `HoldTarget` with the
  `reactionKey`, and `hold()` sends `element: "reaction"` with the part's
  `part`, `index` and `frame`. No native haptic for it (JavaScript plays
  `impact()`).
- **No feedback on a tap.** `PressShrink` skipped chips and waited 80 ms.
  A reaction now shrinks at touch-down (`pressNow`) and ticks on release
  (`reactionTapped`). The press carries the part's `frame`, for bubbles'
  who-reacted menu.
- **Tapbacks swallowed touches over the bubble.** `TapbacksView` is as wide
  as three fanned out, so with one tapback the rest of it covered the
  bubble's corner. `hitTest` now asks `hasTapbackAt`.
- **Deck tapbacks floated above the photo.** They were placed from the
  deck's top, which includes the room for the cards behind (`PEEK`). They
  now sit on the front photo's corner. They also showed every photo's
  reactions merged; now the front photo's own (`tapbackReactions`), with
  press and hold aimed at it.

### Stacked carousel

- **Photos covered the avatar, then vanished at the column.** The strip
  started at the column with `clipChildren = false`, so cards drew over the
  avatar, but `LinearLayoutManager` recycled a card once it crossed the
  strip's left edge. The strip now spans the row with the column as
  padding, and `CarouselLayoutManager.calculateExtraLayoutSpace` keeps
  cards through the paddings.
- **The rightmost photo snapped away on release.** At the end,
  `StartSnapHelper.findSnapView` returned the first visible card if less
  than half of it was off screen, and snapping it to the start scrolled the
  last card back off. Resting points now come from the cards' widths
  (`CarouselGeometry`), with the end as one of them.
- **The gesture felt hijacked and stopped halfway.** `SnapHelper` replaced
  the fling with a smooth scroll to the next card. Now the fling is the
  platform's: `FlingSpline` projects it, picks the resting point, and
  flings at the exact velocity that ends there.
- **Recycled rows lost their place.** Offsets are kept per row and block.
- **Avatar:** shrinks toward its top as photos pass (see the README).

### Bubbles deck

- **Both directions advanced.** `throwAway` always did `current + 1`. Left
  is now the next photo, right the one before (`deckAfterThrow`).
- **Cards flew a little and disappeared.** The thrown card went 260 px in
  160 ms, then both views were rebound to new photos, which reloaded
  through Glide's 150 ms crossfade. Now three views swap roles, so the
  revealed photo is already loaded; the thrown card leaves to just past
  its width at the finger's speed and tucks in behind on its side.
- **The blur snapped.** It was a fixed 8 dp `RenderEffect` and an alpha
  (an offscreen layer). It's now RN's 4 dp and 15% dim, cleared in four
  steps, with the dim as a color filter.
- **The front photo reset on recycling.** Kept per row and block.

### Typing

- **Photos in DMs.** JavaScript sends `people` in DMs too. Native now
  reads `showFaces` (absent means shown).
- **The morph jumped.** The typing face sat 2 dp and the bubble 4 dp off
  the message's avatar and bubble; in DMs the bubble was 42 dp off. They now
  line up. The morph matches RN's `bubble-morph.tsx` timings and `morphs()`
  eligibility; it ran before for photo-with-caption messages.

## Validation run

On the uncommitted source over 4f87adfe, 2026-10-23:

- `./gradlew :message-list:testDebugUnitTest` (from `apps/mobile/android`,
  under the heavy lock): build successful, 37 tests, 0 failures, 0 errors,
  0 skipped. That's the 11 existing lift, detach and pagination tests
  (`LiftTargetTest`, `CarouselDetachTest`, `PaginationTest`) and 26 new
  ones (`CarouselSnapTest`, `DeckMotionTest`, `TypingAndPartsTest`,
  `ReactionTargetsTest`).
- Then, in order: `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`,
  `pnpm run react-doctor --base origin/t3/native-message-list`, all
  passing; `pnpm run format:fix` changed nothing.

None of this exercises motion, touch or haptics on a device. Everything
below is still open.

## Evidence still needed (integration runs devices)

Before and after on the Android emulator, then Shawn's A16:

- [ ] Stacked chip: tap (shrink, tick, toggle), hold (who reacted, no
  buzz from native), double tap (two toggles).
- [ ] Bubble tapback: tap and hold (who reacted). Holding the bubble beside
  a single tapback still opens the menu.
- [ ] Carousel: flings both ways, a hard fling to the end, a slow release
  near the end (stays), cards reaching the screen edge over the avatar
  column, avatar shrinking and back, scroll away and back (same place),
  tap on a moving strip (stops only).
- [ ] Deck: swipes both ways, quick chains, short drags springing back,
  blur steps (watch for visible stepping), reactions following the front
  photo, hold on the front photo after swiping (lifts that photo).
- [ ] Typing: DM with `dev:replyToMe` (no photo, morph without a jump),
  group with one and several typists.
- [ ] Lift regressions: hold, menu, land, viewer cycles on text, a single
  photo, the third carousel photo, and a deck.
- [ ] `sim.sh frames` and A16 main-thread time for stacked flings with
  carousels (extra layout space lays out about one more card per strip)
  and for deck swipes.
