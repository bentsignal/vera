# Android message list

`MessageListModule` exposes the Expo view backed by a reversed RecyclerView.
The shared contract is `src/features/native-list/contract.ts`, relative to the
mobile app. JavaScript supplies the rows, appearance, timings, and menu layout.

## Optional capabilities

- `benchFling` scrolls with Choreographer and `scrollBy`, without injected
  touches or fling physics. It reports actual distance and time at the older
  edge. Use the same speed and duration as the React Native benchmark.
- `liftHandoff` adds `landLift()`. JavaScript starts it as the menu closes
  and keeps the transparent Modal mounted until its promise resolves.
- `lift` moves the held native view and its tapbacks into the React Modal
  window's decor overlay. The row keeps its space and defers binding changes
  until landing. The view returns during the conversation window's pre-draw. A landing-only
  drawing of the same native views covers that exact resting position until
  the source window commits its frame. Android's Dialog and activity buffers
  commit independently; pre-draw alone left a one-frame hole. The cover does
  not use a bitmap or create another message view, and it never moves apart
  from the original.
- Custom React rows currently use `fallbackText`. This binary does not report
  `customRows`.

A plain text lift gets the same card as the existing menu: 10 dp horizontal
and 8 dp vertical inset, radius 16. The overlay reserves drawing space around
its children because Android clips overlay RenderNodes to their bounds.

## Reactions

A tap on a chip or tapback fires on release, without waiting for a double
tap. The chip shrinks to 0.9 at touch-down and the tap plays `CLOCK_TICK`;
JavaScript plays no tap haptic. The `press` carries `frame`, the window
frame of the part the reaction belongs to. A hold on one sends `hold` with
`element: "reaction"` and `reactionKey`, and the `part`, `index` and
`frame` of that part (the photo, for a carousel item's chip). Native plays
no haptic for it; JavaScript's `impact()` does. A double tap on a chip is
two taps. Tapbacks take touches only where they're drawn, not across their
whole fan. A deck's tapbacks are the front photo's own, on its corner.

## Stacked carousel

The strip spans the row, with the text column and the right margin as
padding, and `CarouselLayoutManager` asks for those paddings as extra
layout space, so cards stay laid out and drawn until they leave the screen.
`CarouselGeometry` works out resting points from the cards' widths: each
card's start, clamped to the end, so the last card rests fully on screen. A
fling projects the platform's own deceleration (`FlingSpline`, OverScroller's
curve), picks the resting point nearest it (at least one on), and flings at
the velocity that ends there. A slow release settles on the nearest. Where a
strip was left is kept per row and block. A touch on a moving strip only
stops it. When the strip passes the avatar (a run's first row, the carousel
first), the avatar shrinks toward its top to clear the photos, as a function
of the offset.

## Bubbles deck

Three image views take turns as the front photo and the two behind (next on
the right, previous on the left, each tilted 3°). Left brings the next
photo, right the one before. Past 70 dp or 600 dp/s the front card leaves
to just past its width, goes behind, and tucks into its side; below that it
springs back with the release velocity. The card coming forward clears its
blur and dim in four steps, so a `RenderEffect` changes at most four times a
swipe. The front photo is kept per row and block. `DeckMotion.kt` has the
pure parts.

## Typing

`showFaces: false` (JavaScript sends it in one-on-one conversations) hides
the photos: the bubble starts at the margin, and the stacked label at the
text column. Missing means shown. With photos, the typing face and bubble
sit where the message's avatar and bubble will. A message grows out of the
typing bubble only if it's text alone in bubbles (`morphs`), over 320 ms,
the dots gone by a third, the text fading in after.

## Pagination

The older-page signal uses a lower bound for the remaining rows, rather than
multiplying their count by the height of the currently visible media. Known
text and media dimensions contribute to the bound; uncertain wrapped lines,
reactions, and footers are omitted. JavaScript still owns `loadAheadScreens`.

## Validation

Use the repository's simulator skill and shared heavy-work lock. A focused JVM
check, from `apps/mobile/android`, is:

```sh
./gradlew :message-list:testDebugUnitTest
```

`PaginationTest` covers short rows following tall media, sufficient remaining
content, a newly appended page, font scaling, and ordinary versus panoramic
photo dimensions. `/dev-native-list` exercises
both layouts, the lift menu, reactions, typing changes, keyboard, and media.
Its `bench` button runs 5,500 dp/s for ten seconds and logs the result.

`CarouselSnapTest` covers resting points with the last card at the end,
releasing near the end, flings in both directions and across cards, and the
fling curve's inverse. `DeckMotionTest` covers direction, swiping back,
the photos behind, the blur steps, and the spring. `TypingAndPartsTest`
covers `morphs`, a deck's tapbacks, and decoding `showFaces`.
`ReactionTargetsTest` (Robolectric) covers a chip's hold target, holding a
chip versus its photo, and tapbacks' touch area.

`LiftTargetTest` covers a held third photo whose part differs from its media
block after a caption, omitted blocks in the rendered slot mapping, and an
unknown item that must not fall back to lifting the caption. Carousel lifts
resolve the containing block by item part, then lift only its visible tile.

`CarouselDetachTest` uses Robolectric to model a native screen transition's
recursive `startViewTransition` ownership, then detaches and reattaches at the
third photo three times. Restoring `recycleChildrenOnDetach = true` reproduces
the attached-view recycling exception; the normal detach policy passes.
It also checks that a transition-owned tile can move to the lift overlay and
back, and that its inner carousel holder can remain pinned until landing.

Carousels keep their children on window detach. `react-native-screens` marks
descendants as transitioning, so eagerly removing and recycling a card during
the same detach traversal can recycle a view that still has a parent. See
[Screen's recursive transition ownership](https://github.com/software-mansion/react-native-screens/blob/4.26.2/android/src/main/java/com/swmansion/rnscreens/Screen.kt)
and [LinearLayoutManager's optional detach recycling](<https://developer.android.com/reference/androidx/recyclerview/widget/LinearLayoutManager#setRecycleChildrenOnDetach(boolean)>).
Lifts end transition ownership before removing a native part and pin both the
outer row and any inner carousel holder. These changes complement the item-part
lookup fix; correcting which item lifts alone does not fix the detach crash.

The Android emulator uses software GL on this Mac. Frame intervals include
that rendering cost and host contention; recordings establish visual behavior,
not a 60 fps phone result. The integration branch owns the same-chat,
production-bundle comparison and the final phone clients. Do not enable the
native list for everyone based on emulator recordings alone.
