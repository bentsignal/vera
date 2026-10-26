# Message list overhaul

Shawn's list of what made conversations feel broken, and what each fix is.

## Scroll and loading jank

- [x] Rows drew over each other and the header while scrolling up, and
      things shifted as a conversation faded in or a page of older messages
      loaded. Legend List places every row at an estimated position, then
      moves it once measured and corrects the scroll offset from JavaScript,
      so on a phone those corrections show. The conversation is now an
      **inverted `FlatList`** inside react-native-keyboard-controller's
      `KeyboardChatScrollView` (`message-list.tsx`):
  - It lays out from the newest message up, so it opens at the bottom
    without scrolling there.
  - Older pages are appended past the top in layout order. Nothing on
    screen moves when they load or are measured, with no scroll correction
    at all.
  - Rows are laid out by Yoga in flow, never at an estimated spot first.
  - Newer messages (and newer pages, in a conversation opened around an
    old message) keep what's on screen in place with the native
    `maintainVisibleContentPosition`. At the bottom, a new message slides
    into view (`autoscrollToTopThreshold`).
- [x] Reactions loaded after their messages, so chips (now tapbacks) popped
      in and pushed rows around after the list showed. A page of messages
      now shows only once its reactions have loaded too
      (`useSettledPages` in `conversations.ts`), including the opening
      pages. A PDS that fails to answer for reactions counts as none.
- [x] Names and photos could swap in after the list showed. The list waits
      for the members' profiles; a profile whose PDS fails counts as none
      instead of holding the screen forever.
- [x] The jump-to-latest button flashed while a conversation opened (the
      list scrolled to the end after showing). An inverted list starts at
      the end, so it never does.

## Sending

- [x] Stacked: the time popped in next to the name once a message sent. It
      is always laid out now, transparent until sent, then fades in.
- [x] Bubbles: no "Delivered" under your newest message. A message is half
      opacity while sending and fades to full once the PDS has it
      (`SendingFade`).
- [x] Messages could stay "sending" forever with no way to retry: a send
      whose request hangs never settled. A send now shows "Not sent. Tap
      to try again." after 20 seconds (`SEND_TIMEOUT_MS` in `outbox.ts`).
      Sends are idempotent by message ID, so a late success and a retry
      agree. A message the PDS took also shows as sent even before the
      conversation's pages list it.
- [x] Sending while iOS offered an autocorrection put the corrected word
      back in the cleared field. The composer drops a whole word landing in
      the empty field within a second of sending (typing adds a letter at a
      time).

## Reactions

- [x] Bubbles: iMessage tapbacks instead of chips under the message. Each
      emoji is a small round bubble stacked over the message's top corner
      (top right of theirs, top left of yours), yours tinted, with a count
      past three emoji or several people. Tapping them shows who reacted.
      Stacked rows keep Slack's chips underneath.
- [x] Double tap a message (either layout) to react and see who reacted,
      iMessage-style: the message lifts with the reaction bar above and a
      glass list of each person's photo, name, and emoji below. Long press
      still opens the actions, including View Reactions (the sheet).
- [x] Photos, videos, and files couldn't be long pressed (their own tap
      took the press), so media-only messages had no menu. They open it
      now, and photos and videos have **Save to Photos**
      (`expo-media-library`, add-only access; a native change).

## Round 2 (Shawn's phone test)

- [x] Chats opened a few hundred points above the bottom, then scrolled
      down. The list used to follow new messages by scrolling to them; an
      update arriving while it opened scrolled it. Now, at the bottom it is
      **pinned**: no scroll anchor, so it stays at offset 0 (the bottom of an
      inverted list) through new messages, a growing composer, and rows that
      change size, with no scrolling at all. Only your own drag or fling
      unpins it, and reaching the bottom pins it again (`useLatest`).
- [x] Rapid replies didn't keep you at the bottom; scrolling away while they
      arrived fought you. Same fix: pinned follows with no scroll, and any
      scroll up unpins at once.
- [x] Scrolling up fast reached the top, and older messages appeared in
      several steps. Older pages load three screens early, render a whole page
      at once (`maxToRenderPerBatch`), and no longer wait for their reactions
      (they load past the edge, where rows that grow move nothing in view).
- [x] Tapbacks redone to match Messages: one round bubble per reaction (two
      ❤️ show two, no counts), the newest at the corner with a thought-bubble
      tail and up to two fanned behind, sitting in space above the bubble.
      They hide while the message is lifted into its menu, so closing it no
      longer flickers them over the lifted copy.
- [x] Reactions that arrive while you watch open their space smoothly
      (`Expand`), for tapbacks and stacked chips; ones already there when a
      row appears are just there.
- [x] iOS jump-to-latest button is a Liquid Glass circle that materializes
      and dissolves.
- [x] Android: the inbox's last row ended under the tab bar.
- Testing a conversation opened in the middle: Settings → your account →
  Developer → Open a Long Thread in the Middle (a 600-message DM, opened 200
  back).

## Round 3

- [x] Tapbacks: no tail dots; 34pt circles with a 1pt ring and more room
      around the emoji. They sit in the bubble's box and rise beside the
      sender's name, moving past it rather than covering it, so a reaction
      never pushes the name up. The gap under the name is a little larger.
- [x] Reaction bar: yours are an inset tinted circle, so two side by side
      never touch; no count badges.
- [x] Who reacted (double tap): a column per emoji with overlapping photos
      and "+N", scrolling sideways, instead of a row per person. Tapping a
      column opens the sheet on that emoji.
- [x] New messages arrive like Messages (`Arrive`): their space opens
      smoothly at the bottom so the conversation glides up, and the message
      floats up into it as it fades in.
- [x] Stacked chips' glass was clipped when it swelled on press (`Expand`
      clipped); the space no longer clips, its contents fade in instead.
- [x] Android: everything vanished scrolling in the long thread. The
      opened-on highlight built an `rgba()` string from a tiny number
      (`5e-16`), which Reanimated on Android throws on, killing the list's
      animations. The tint now fades its opacity. Pages the list asked for
      twice (two `before` cursors) are no longer added twice.
- [x] Newer messages load three screens early too.
- [x] The open fade could shift at the end: the list showed before the
      composer's height was known, then made room. It now waits for it.
- [x] Performance: every row on screen redrew on any list update (824 row
      renders for one send) because `Row` spread its props into a new
      object; and `profileOf` changed each render. Props are passed one by
      one and profiles are shared structurally: about 10 per send now.
- [x] Android inbox: rows draw 1000pt ahead so a fast fling on a slow
      phone doesn't outrun them.

## Round 4: measured, not eyeballed

Measured with a temporary UI-thread frame probe (Reanimated
`useFrameCallback`, logging frames over 24ms) in the iOS simulator, opening
the bot group by route so nothing else touched the device meanwhile.

- [x] Open fade stuttered: after opening, the list kept mounting rows in
      batches (60 at a time, from round 2) for ten screens around the
      bottom, and each batch held the UI thread for 50–80ms, 2–6 times per
      open, right during the fade. Now it renders just the screen until the
      fade finishes (`windowSize` 1, then 11, in batches of 8), and the fade
      starts two frames after the list is placed. After: no slow frames
      during the fade.
- [x] Arriving messages ran at 30fps (a run of 33ms frames per arrival):
      the row's height was animated, which re-lays out the list every
      frame, and the clipping showed an edge they rose from. Now a new
      message is laid out once at full size below the screen (the native
      scroll anchor keeps everything still), then the platform's animated
      scroll slides it into view while it fades in. After: one slow frame
      when the row mounts, before anything moves; none during the slide.
- [x] Bubbles measured themselves and rendered twice to draw the tail as
      one SVG of the whole bubble. The tail is now a fixed SVG over an
      ordinary rounded background: one render, no measuring.
- [x] Reacting from the menu: the reaction now lands once the menu has
      closed, so it animates in where you can see it, and in stacked rows
      the lifted copy no longer covers the message while its row grows.
- [x] Tapbacks fade back in after the menu closes (the fade was a CSS
      transition on a plain Pressable, which doesn't animate).
- [x] Emoji are optically centered in their circles (`Emoji`): Apple's sit
      a little left of the middle of their advance.
- [x] Who reacted: no outline on the photos.
- Known: adding the first reaction still animates the row's height
  (about 35–45ms frames for 0.4s in the simulator). Moving it to native
  frame animations is the next step if it shows on the phone.

## Round 5

- [x] A tapback that would cover the sender's name pushes the name up above
      it, as in Messages; one that clears the name sits beside it.
- [x] A reaction on your bottom message dipped it down and back up: the
      list's anchor was one row off (`ANCHOR` 0; VirtualizedList adds one for
      the header itself), and following the newest message restarted every
      frame while the tapback space opened. It now follows only when the
      newest message or the composer changes, so the bottom message stays put
      and the rest moves up.
- [x] With the keyboard up, holding or double tapping a message no longer
      moves the conversation. The menu is a modal, which takes the keyboard
      down on iOS: the list freezes as it opens, the messages stay over the
      space the keyboard leaves, and closing back to the chat brings the
      keyboard back before the list lets go (`useMenuKeyboard`).
- [x] Performance tooling (`apps/mobile/perf/`, see its README):
  - Render budgets in `pnpm test`: a new message, a reaction, or an older
    page re-renders only the messages it changes.
  - A check that the React Compiler compiles every component and hook. It
    found five it silently skipped, the worst `useMenuKeyboard`, whose
    new object on every render re-rendered every message's reactions and
    press handling on any list update. All five are fixed.
  - Reassure (`pnpm perf`, and a CI report comparing a PR with its base).
    The fixes above: an update to the list takes about half the React work
    it did (78–82ms → 36–38ms per update in Jest, opening 36 → 27ms).
  - Flashlight (Android FPS) isn't in CI: it needs an emulator and a release
    build each run, and emulator frame rates on shared runners are too noisy
    to compare.

## Round 6: frames, measured on the device's UI thread

- [x] A tapback pushing the sender's name up ran at 30fps. Two causes:
  - The space it opened animated its height, which re-lays out every row
    in the list on every frame. Now the space opens at once, and the rows
    it moves (older rows, the name, a stacked row) are drawn back where they
    were and ease into place with a transform (`GrowingSpace`, `useRowLift`
    in `grow.tsx`). A row below the screen is left to the scroll anchor.
  - Reanimated 4 sends even transform and opacity animations through a
    full layout pass every frame unless `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS`
    and `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS` are on. They are now
    (package.json's "reanimated" key, a native change, counted in the
    fingerprint by `fingerprint.config.cjs`). Every animation in the app
    gets the faster path.
- [x] Why the checks missed it: Jest and Reassure measure React's work on
      the JavaScript thread, and this was the UI thread. New checks:
  - `vera/no-layout-animation` (lint): fails on animating a layout property
    (animated style, keyframe, CSS transition or animation). It found two
    more in the composer (its side padding with the keyboard, and the
    staged attachments strip's height), left for their own PR.
  - `scripts/sim.sh frames start|stop` records the UI thread's frames in
    the simulator or emulator and reports the slow ones, with when they
    happened. `veraDev.conversation().react(text, emoji)` and `.send(text)`
    drive a conversation without tapping: the simulator's tap automation
    itself stalls the app for ~180ms while it reads the screen.
  - The `vera-feature` skill now asks for before and after frame reports
    for anything that moves.

## Round 7: typing indicators (Shawn's phone test of "Stays last")

Shawn picked "Stays last" from the five variants; the picker and the others
are gone. What his recordings showed, and the fixes:

- [x] A reaction arriving on your message moved the messages above it down
      for a frame, then up. The space opened through a layout commit, which
      waits while React is committing (as the list re-renders around a new
      reaction), but the moves went straight to the views a frame or more
      earlier. Now every space and the moves it makes are set in one frame
      callback (`inFrame`), and while a move is `pending` its styles carry
      a prop Reanimated sends through the same commit (`IN_COMMIT` in
      `moves.ts`), until the space's height is in the layout (`land`).
- [x] A message from someone typing pushed the typing indicator under the
      composer, then the list scrolled up. Who's typing is now the list's
      newest row (`TypingRow`), the scroll anchor's row, so nothing below the
      newest message ever moves: a new message opens right above it
      (`Arrive`), the messages above make room, and the message rises out of
      its space with them, cut off at the indicator, so it never covers
      anything. Nothing scrolls for new messages or typing any more; only a
      taller composer does (`useLatest`).
- [x] The last person typing sending their message: in bubbles, the typing
      bubble grows into the message's (`BubbleMorph`): the dots fade, the
      bubble stretches from its tail to the message's size (four corners and
      two stretching bands, all transforms), and the text and name fade in.
      In stacked rows, and for messages with photos, links or quotes, the
      message opens where the indicator was as the indicator fades.
- Known: in the simulator a move still drops a few points for one frame now
  and then (about one run in two, under 15pt), when React commits at the
  same moment. Holding the moves in the layout commit for the whole move
  made it worse.

## Round 8: pace and the rise's edge (Shawn's phone test)

- [x] Everything felt rushed next to the rest of the app. The moves now take
      420ms on a gentle ease (`GROW_MS`, `GROW_EASING`: CSS `ease`) instead
      of 260ms ease-out cubic, which was mostly done in its first 60ms. The
      bubble morph, the text fading in, the indicator appearing, and the
      stacked crossfade slowed with it.
- [x] With a slower start, what a move makes room for (a reaction's chips,
      the typing indicator) showed over the messages still moving off it. It
      now fades in from a quarter of the way through (`showWithRoom`).
- [x] A message rising in had a hard line where it was cut off. It now shows
      10pt further down, through a band that fades from clear to the
      background (`Fade` in `arrive.tsx`, `EMERGE`), inside the gap above
      the indicator, so the cut is at the band's solid end and can't be
      seen. The band goes as the message's last point clears it.
- [x] The bubble growing out of the typing indicator showed its text before
      it had grown, spilling out. The message forgot it was growing once
      the indicator it took over was gone (a frame or two in), so its text
      showed at once. What it became is now kept with its arrival
      (`arrived` in `arrive.tsx`), and the text fades in only once the
      bubble is its size (320ms, then 220ms).

## Round 9: Android (Shawn's phone test)

- [x] A bubble that grew out of the typing indicator turned square (and, on
      Shawn's phone, lost its text) once the keyboard went down. It had no
      background while it grew and got one after, and Android loses the
      corners of a view whose background is added after it's drawn (the
      same bug as c1637105 and 6cf91717). Its outer view now never has a
      background; one that grew draws it in a rounded view of its own,
      mounted with its color (`BubbleBackdrop`). Its text's opacity goes
      back to React once it has faded in (`FadingText`).
- [x] Half see-through while sending, an outgoing bubble's tail showed a
      darker square where it overlaps the bubble: Android fades each child
      on its own. Everything that fades a bubble (`SendingFade`, `Opening`,
      the typing indicator, a leaving row) now sets
      `needsOffscreenAlphaCompositing`, so it fades as one.

## Round 10: under load

A burst of 300 messages in 83 seconds broke the list: sends hidden, a
blank screen, an old point on reopening, seconds of lag. The audit, the
fixes, and before-and-after numbers are in
[message-list-high-load.md](message-list-high-load.md). In short: the
window follows new messages page by page on its own (`window-model.ts`),
reactions and threads of new messages come by time (`since`), sends no
longer write shared documents on the PDS, rows are memoized, and others'
messages arriving faster than they can rise in wait and rise together.
