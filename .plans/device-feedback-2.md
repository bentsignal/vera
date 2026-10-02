# Device feedback, round 2 (2026-10-02)

Shawn installed the overnight build on his phone. Check items off as PRs
merge. iMessage is the reference for feel throughout.

## Bugs

- [x] Scrolling to the top of a long chat (Weekend crew) loads older messages,
      glitches, and throws you back to the bottom.
- [x] The composer sits on a black box that runs to the bottom of the screen.
      It must float; messages scroll all the way to the bottom edge.

## Messages

- [x] Bubbles feel like iMessage: spacing, roominess, grouping.
- [x] No per-message times in bubbles. Like iMessage, dragging the list left
      slides every message over and reveals its time on the right.
- [x] Reactions: long press a message (with haptic feedback) to pick an
      emoji: heart, thumbs up, thumbs down, laughing first, then a few more.
      Counts show under the message (Slack/Discord style) and tapping one
      toggles your reaction. Works in bubbles and stacked layouts.
- [x] Content fades in when ready instead of a spinner and then a flash
      (conversations, channels, spaces).

## Lists and headers

- [x] Chats list feels like iMessage: spacing, alignment, larger rows,
      gradient initials avatars.
- [x] Inline tab titles (Chats, Spaces, Settings) stay readable while
      scrolling: a soft background-colored fade behind the header that only
      shows once content scrolls under it.
- [x] Search uses the real iOS 27 search tab behavior. Rodge Mail
      (`../rodge-mail`, see `WORM_IOS_27_SEARCH_HANDOFF.md`) works around the
      React Native issue.

## Icons and themes

- [x] App icon modeled on the iMessage icon (white speech bubble on a
      gradient), in every theme color, with light and dark versions. Green,
      close to iMessage's green, is the default.
- [x] A Themes section in Settings: a horizontal carousel of app icons
      (showing the light or dark version to match the current appearance)
      and color circles for the accent themes.
