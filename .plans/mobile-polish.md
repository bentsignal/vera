# Mobile polish and testing (from Shawn's first device test, 2026-10-01)

Shawn signed up on a device dev build, created a space, and sent messages.
Work through these in roughly this order; check items off as PRs merge.

## Testing tools (first: everything else depends on them)

- [x] Dev-only bots: fake accounts on the dev deployment that reply to
      messages, so DMs, groups, and spaces show other people without making
      accounts by hand. Never enabled in production.
- [x] Dev-only simulator sign-in (passkeys cannot work on simulator builds).
      Dev deployment only, guarded by an environment flag.
- [x] Record simulator videos of flows and review them for visual jank.

## Bugs

- [x] Changing the profile photo does nothing.
- [x] Display name reverts after the app restarts.
- [x] Avatar color changes on every keystroke while editing the display name
      (seed colors from the address, not the name).
- [x] Composer: the field is shorter than the attach button, the placeholder
      sits low, and the send button is off-center.
- [x] Sending: the send button grows then vanishes, and reappears below the
      field for a frame when typing again.
- [x] Swiping down while typing feels janky.
- [x] Settings: dragging down should dismiss the keyboard while editing the
      display name.
- [x] Headers show the raw route name (`[spaceId]`, `[conversationId]`) for a
      frame before data loads.
- [x] A stray search bar can appear on the Chats tab when pulling down.
      (Gone since search moved to its own tab; a recorded slow pull on Chats
      shows no search bar.)

## Design changes

- [x] Large titles ("Chats", "Spaces") line up with their toolbar buttons.
- [x] Space screen: plus buttons on the right of the "Text Channels" and
      "Members" section headers replace the bottom buttons.
- [x] Space screen: try the space name in the header that hands off to the
      centered title on scroll (may be reverted). (Native large title: the
      space name collapses into the centered title as the list scrolls.)
- [x] Chat screen: transparent header with a gradient fade so messages get
      more room (Slack-style).
- [x] Message layout setting: bubbles (current) or stacked rows with avatars
      on the left (Slack/Discord-style).
- [x] Smoother sending state than "Sending…" text under the bubble.
- [x] New message search: debounce lookups and show "No users found".
- [x] Search uses the iOS 26+ separate search tab in the tab bar. (It is a
      search tab, but react-native-screens still renders it inline rather than
      as the separate trailing button.)
- [x] Color themes (accent sets) chosen in Settings.
- [x] Alternate app icons, including dark and tinted variants, made with Icon
      Composer through Codex. (iOS only; Android keeps the indigo icon. See
      `apps/mobile/assets/icons/README.md`.)

## Lists and long conversations

- [x] Use Legend List for message and inbox lists (fall back to TanStack
      Virtual only if Legend List cannot be made smooth).
- [x] Jump to latest when scrolled far up.
- [x] Open a conversation at a specific message (notification for a message
      200 back), paginating both older and newer around it, with pages
      prepended and appended without jumps.
- [x] Verify with long seeded conversations and recorded videos.

## Multiple accounts (larger)

- [x] Signed into several accounts at once, email-style: one combined inbox
      and spaces list across accounts, optionally filtered by account, and
      replies go out from the right account. Accounts may live on different
      PDSs, so each keeps its own session and clients. See
      [multi-account.md](multi-account.md).
