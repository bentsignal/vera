# Inbox and Spaces (decided with Shawn, 2026-10-04)

Chats and Spaces were separate tabs, so reading a space's #general took three
taps (Spaces, the space, the channel). The app moves to one Inbox for
everything you read and a Spaces tab for browsing and managing spaces.

## Decisions

- Tabs: **Inbox · Spaces · Settings · Search**. Inbox replaces Chats and is
  first. Its large title (and the collapsed header) says "Inbox".
- The Inbox lists direct messages, groups, and space channels together,
  newest first. Channel rows show the space name with the channel name.
- **Pinned** conversations of any kind sit at the top, in the order they
  were pinned. Pins belong to each account (per membership). Pin and unpin
  by swipe or long press. No limit; reordering can come later.
- **Show in Inbox**: each channel has a per-account setting, on by default
  (including channels created later). Switch it from the space's channel
  list or the channel's info screen. Hidden channels are still read from the
  Spaces tab. Separate from **mute**, which keeps a conversation in the
  Inbox but silences its notifications.
- **Filter** button top left of the Inbox (native menu): Show All / Unread,
  and From Everything / Chats / Channels / one space. The icon fills when a
  filter is on; the filter is remembered between launches. Pins stay on top
  of the filtered list.
- The Inbox's top-right **compose** button opens one sheet with a
  **Chat | Group** segmented control. Chat: pick a person and the
  conversation (or the existing DM) opens; no confirm button. Group: check
  people, **Next** in the toolbar, then name it and **Create** in the
  toolbar. No buttons inside the list. The From account picker stays when
  several accounts are signed in.
- The Spaces tab's **plus** goes straight to New Space (name, then people,
  Create in the toolbar). Spaces are created only there.
- No badge on the Spaces tab: channel unreads count toward Inbox's badge.
- The backend keeps today's `inbox` response for older apps and adds the new
  data alongside it, so the change ships over the air.

## Stack (one PR each)

1. [ ] Create flows: compose sheet (Chat | Group), New Space with toolbar
       buttons.
2. [ ] Backend: inbox with channels (that show in the Inbox) and their space
       name; per-account pin and Show in Inbox.
3. [ ] Inbox tab: rename, merged list, pins, filter menu, Show in Inbox
       toggles, Spaces tab without a badge.

## Later: invite links

How people get into a space, Discord-style: any link opens the space's join
screen (which offers the channel picker, all checked). Links expire after
15 minutes, 30 minutes, a day, a week, or never. Needs links that open the
app, a web fallback for people without Vera, and expiry and revoke on the
backend. Open: who can create links (anyone or owners) and whether links
have a use limit.
