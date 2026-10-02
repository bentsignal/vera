# Mobile polish and testing (from Shawn's first device test, 2026-10-01)

Shawn signed up on a device dev build, created a space, and sent messages.
Work through these in roughly this order; check items off as PRs merge.

## Testing tools (first: everything else depends on them)

- [ ] Dev-only bots: fake accounts on the dev deployment that reply to
      messages, so DMs, groups, and spaces show other people without making
      accounts by hand. Never enabled in production.
- [ ] Dev-only simulator sign-in (passkeys cannot work on simulator builds).
      Dev deployment only, guarded by an environment flag.
- [ ] Record simulator videos of flows and review them for visual jank.

## Bugs

- [ ] Changing the profile photo does nothing.
- [ ] Display name reverts after the app restarts.
- [ ] Avatar color changes on every keystroke while editing the display name
      (seed colors from the address, not the name).
- [ ] Composer: the field is shorter than the attach button, the placeholder
      sits low, and the send button is off-center.
- [ ] Sending: the send button grows then vanishes, and reappears below the
      field for a frame when typing again.
- [ ] Swiping down while typing feels janky.
- [ ] Settings: dragging down should dismiss the keyboard while editing the
      display name.
- [ ] Headers show the raw route name (`[spaceId]`, `[conversationId]`) for a
      frame before data loads.
- [ ] A stray search bar can appear on the Chats tab when pulling down.

## Design changes

- [ ] Large titles ("Chats", "Spaces") line up with their toolbar buttons.
- [ ] Space screen: plus buttons on the right of the "Text Channels" and
      "Members" section headers replace the bottom buttons.
- [ ] Space screen: try the space name in the header that hands off to the
      centered title on scroll (may be reverted).
- [ ] Chat screen: transparent header with a gradient fade so messages get
      more room (Slack-style).
- [ ] Message layout setting: bubbles (current) or stacked rows with avatars
      on the left (Slack/Discord-style).
- [ ] Smoother sending state than "Sending…" text under the bubble.
- [ ] New message search: debounce lookups and show "No users found".
- [ ] Search uses the iOS 26+ separate search tab in the tab bar.
- [ ] Color themes (accent sets) chosen in Settings.
- [ ] Alternate app icons, including dark and tinted variants, made with Icon
      Composer through Codex.

## Lists and long conversations

- [ ] Use Legend List for message and inbox lists (fall back to TanStack
      Virtual only if Legend List cannot be made smooth).
- [ ] Jump to latest when scrolled far up.
- [ ] Open a conversation at a specific message (notification for a message
      200 back), paginating both older and newer around it, with pages
      prepended and appended without jumps.
- [ ] Verify with long seeded conversations and recorded videos.

## Multiple accounts (larger)

- [ ] Signed into several accounts at once, email-style: one combined inbox
      and spaces list across accounts, optionally filtered by account, and
      replies go out from the right account. Accounts may live on different
      PDSs, so each keeps its own session and clients.
