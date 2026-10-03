# Device feedback, round 4 (2026-10-02)

Shawn tested the round 3 `internal` build. A separate thread replaced the
app icon (aloe pinwheel, single icon) and the splash; that work is settled.

## This round

- [x] Bubble tails: the tail hangs from the bottom edge, past the rounded
      bottom corner toward the center, not from the side. No visible seam.
- [x] Conversation header: drop our own fade at the top. Messages should
      reach up behind the floating avatar and name; only the system's own
      edge treatment at the very top.
- [x] Reactions: keep Glass Overlay + Chips, remove the experiment settings
      and the other options.
- [x] Reaction chips: the glass container is missing on first render (until
      you toggle), for your own reactions and others'. Fix so it always
      shows. Remove the smiley "add reaction" chip; long press is enough.
- [x] "View Reactions" under Copy in the long-press menu opens a sheet like
      Discord's: a row of each emoji with its count at the top, tap to
      switch, and the list of people who reacted with it.
- [x] Tab titles: native large titles. "Chats" starts big at the top left,
      scrolls with the content, and the glass bar takes over with the small
      centered title once it scrolls past. Same for Spaces and Settings.
      Drop the title glow.
- [x] Notifications show photos (or initials) and never the old icon: the
      notification service extension ships in every EAS build since #58
      (credentials set up through the App Store Connect API key).

## Parked: message threads (do last, together)

Shawn says threads are still rough overall. Revisit as one focused pass:

- [ ] Sending: still janky. Record a send on device-like conditions and make
      it buttery (iMessage is the bar): no shifting, no snapping.
- [ ] Paging from the middle (Developer → Open a Long Thread in the Middle):
      untested by Shawn. Scrolling up must prepend without jumps; scrolling
      down must append.
- [ ] General thread feel: spacing, scroll behavior, keyboard.

Done and confirmed: drag-to-reveal times, blue default, conversation header
look, info and profile screens.
