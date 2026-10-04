# Device feedback, round 3 (2026-10-02)

Shawn tested the round 2 build on his phone. Check items off as PRs merge.

## Rules (also in apps/mobile/README.md)

- Anything that loads fades in. Nothing ever flickers or pops in.
- Builds for Shawn are standalone (no dev server): the `internal` EAS
  profile, Release JS against the dev PDS.

## Defaults

- [x] Blue is the default theme and app icon (Apple may object to a green
      Messages lookalike). Splash screen too.

## Conversations

- [x] A temporary dev tool that opens a long thread in the middle, to test
      paging both ways from an old notification.
- [x] Bubble tails sit under the bottom corner like iMessage and flow into
      the bubble; corners slightly less pointy.
- [x] iMessage-style header: no big bar. Floating back button, the other
      person's photo and name in a glass capsule centered under the Dynamic
      Island, and an info button on the right.
- [x] Info for a conversation, and a basic profile page for a person
      (reachable from search too).
- [x] Sending is smooth: the new message animates in, nothing jumps.
- [x] Drag-to-reveal times stops at the time's width and settles back with
      only a little spring.
- [x] Reactions feel native: glassy picker, better animation, nicer counts.
      Several options switchable in Settings for Shawn to compare.

## Lists and settings

- [x] Chats (and every loading list) fade in on first load.
- [x] Tab titles get a subtle background-colored shadow for legibility,
      instead of the band behind the whole header.
- [x] The Themes carousels fade at their edges, only where content is cut
      off (never over the first item at rest).

## Notifications

- [~] Communication notifications: the sender's photo with the app badge,
  sender as the title, group or channel name as the subtitle, message as
  the body. Needs a notification service extension (one-time Apple
  credentials step from Shawn).
  Sender title, group/channel subtitle, and message body ship now. The
  photo needs the extension, built only with
  `VERA_NOTIFICATION_EXTENSION=1` after Shawn's one-time
  `eas credentials` step (see apps/mobile/README.md).
- [x] Shawn picks reaction styles (Settings → Experiments) and the
      experiment settings are removed (round 4: Glass Overlay + Chips).
