# Inbox paging (security audit, section 5)

Decided with Shawn in the audit thread: the inbox, the badge, activity,
and space member and channel lists are paged or bounded, not capped or
rate limited. This file is the design.

## In short

- Each person has a stored list of the conversations in their inbox,
  ordered by latest activity (`inboxEntries`). The inbox reads the newest
  page of it, and the app asks for the next page as you scroll.
- A message doesn't write anyone's list. A background job moves the
  conversation up everyone's list a moment later, in batches, so a busy
  channel in a big space costs a bounded amount of work per message burst
  and sends never wait on it or conflict.
- Inbox rows carry only what they draw. A channel row no longer carries
  its whole space's member list. Space members and channels load a page at
  a time where they're shown.
- The badge and activity look only at your newest conversations (pinned
  ones plus the newest 50, the inbox's first page), so they can't be made
  too big to run.

## The ordering: `inboxEntries`

One row per person and conversation in their inbox:

| Field            | What                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| `accountId`      | whose inbox                                                          |
| `conversationId` | the conversation                                                     |
| `activityAt`     | its latest activity: created, or its newest message (as `updatedAt`) |
| `section`        | `chats` (direct and group), `channels`, or `hidden` (left out)       |
| `pinnedAt`       | when this person pinned it, if they did                              |
| `spaceId`        | a channel's space, so leaving the space removes its entries          |

Indexes: `by_account_section_activity` (pages), `by_account_pinned`
(pins), `by_account_conversation` (upkeep), `by_conversation` (moving a
conversation up everyone's list, and deleting a channel), and
`by_account_space` (leaving a space).

An entry is only an ordering hint. Every read still checks access
(`findAccess`), so a stale entry (a job not done yet) never shows anything
it shouldn't; the row's `conversation` query answers null and the app
leaves it out.

### Moving a conversation up (`inboxOrder.bump`)

Sends write nothing shared (see `send`): that keeps a busy conversation's
sends from conflicting. So each message schedules `bump` a second later,
which:

1. Reads the conversation's activity (as `toConversation` works out
   `updatedAt`) and its `inboxBumps` row (how far it's been moved up).
2. Stops if that's already done, or a pass is under way (the pass looks
   again when it finishes).
3. Otherwise walks the conversation's entries (`by_conversation`),
   `BUMP_BATCH` (200) per run, raising each `activityAt`. A longer list
   continues in the next run.
4. At the end, if more messages came meanwhile, it goes again: at once
   for a conversation that fit in one run, after `BIG_BUMP_COOLDOWN`
   (30 s) for one that didn't. A channel in a space of 10,000 people moves
   up their lists at most every 30 seconds during a burst, rather than
   writing 10,000 rows per message.

Two bumps of one conversation conflict on its `inboxBumps` row, and Convex
retries the loser, which then sees the work done. Rows already loaded in
the app don't wait on this: each row is its own live `conversation` query,
and the app orders rows by their live data. The delay only affects when a
conversation further down rises onto the first page.

### Who has entries

Kept up by the mutations that change who's in what:

| Change                                     | Entries                                       |
| ------------------------------------------ | --------------------------------------------- |
| `openDirect`, `createGroup`                | inserted for every member (at most 50)        |
| `addGroupMembers`                          | inserted for the added (at most 50)           |
| `leaveConversation`                        | the leaver's deleted                          |
| `createSpace`                              | the creator's, for #general                   |
| `createChannel`                            | a job inserts one per space member, in pages  |
| joining a space (add, accept, invite link) | a job inserts one per channel, in pages       |
| `removeSpaceMember`                        | a job deletes the person's for that space     |
| `deleteChannel`                            | a job deletes the channel's, in pages         |
| `setShowInInbox`                           | the person's `section` (`channels`/`hidden`)  |
| `setPinned`                                | the person's `pinnedAt`                       |

Inserting is an upsert by person and conversation, so a job and a live
mutation racing to make the same entry end with one.

### Existing data

`inboxOrder.fill` builds entries for everything from before this change:
every direct and group membership, then every space membership's channels
(a join job each). It runs in batches and starts itself after the deploy,
on the first message after it (the way numbering's backfill does), so
nobody runs a migration by hand. Its progress is the `sequencing` row
`inboxFill`. Until it's done, inbox queries use the old way of listing
(every membership), so nobody's inbox is missing rows during the minutes
it takes. The old way, and this fallback, go in the PR after the release
that ships this.

The PDS management surface for component upgrades doesn't run migrations
yet (docs/versioning.md → Component upgrades); this follows the same rule
it will: the component owns its upgrade, and nobody runs a
plugin-specific command.

## Queries

### `inboxPage` (new)

`inboxPage({ channels?, before?, limit? })` returns
`{ conversationIds, pinned, next }`:

- `conversationIds`: the newest `limit` (default and most
  `INBOX_PAGE_SIZE`, 50) unpinned entries, newest first, with
  `activityAt` at or before `before` when given. Rows tied with the last
  one at the same millisecond come along, so a page never splits a tie.
- `pinned`: on the first page only (no `before`), the pinned ones in pin
  order, at most `MAX_PINNED` (100).
- `next`: the `before` for the next page, or null at the end.

Its first answer includes every row (as `inboxConversations` does), so a
page arrives in one round trip with its rows and the names they show.

Pages are fixed ranges, not offsets, so a row moving up doesn't shift the
pages below. The app keeps every conversation any page has listed this
session and orders them by their live rows. A row that gets pushed off
the first page by newer activity stays where it is in the app's list
(its row query is still live), so nothing falls into the gap between
pages.

### Older apps

Older apps (and older binaries that never get new JavaScript) call
`inboxConversations` and `inbox`. They keep their arguments and result
shapes and now answer the pinned conversations plus the newest
`LEGACY_INBOX_ROWS` (100). An older app shows its newest 100
conversations; it can't scroll for more, but it opens. **Not a breaking
backend change.**

### Rows: `conversation`

A channel's `members` is now empty: the row doesn't draw them, and the
screen loads them a page at a time (below). Direct messages and groups
keep their members (at most 50, and the row's title is made of them).
Older apps used a channel's `members` for its info screen's member list
and @mention suggestions; those now show empty on older apps until they
update.

### Spaces

- `space` and `spaces` answer the first `SPACE_PAGE_SIZE` (50) members
  (by address), channels (by position), and invited people, with
  `moreMembers`, `moreChannels` and `moreInvited` when there are more. The
  space's unread dot looks at those channels. `spaces` lists at most
  `MAX_SPACES_LISTED` (50) spaces, each with a preview of
  `SPACE_PREVIEW_SIZE` (20) members and channels.
- `spaceMembers({ spaceId, after? })` and
  `spaceChannels({ spaceId, after? })` page through the rest, by address
  and by position.
- Older apps show the first page, and counts like "50 members".

### Badge and activity

- **Home's count** (`homeCount`, every push's badge) counts the pinned
  conversations and the first inbox page (the newest 50), the same rows
  the app's own Home badge counts, so the two agree.
- **`clearBadge`** marks read the same rows.
- **Activity's conversation items** come from the newest
  `MAX_ACTIVITY_CONVERSATIONS` (100) entries active within
  `ACTIVITY_HORIZON`. Its other items (reactions, mentions, replies,
  threads) were already bounded by how many it scans.
- **`markActivitySeen`** was already bounded (`MAX_ACTIVITY_SIGHTINGS`);
  each item's sightings are now read with a limit too.

An unread conversation older than your newest 50 doesn't count in the
badge. Real conversations with unread messages are almost always among
the newest; the cost of counting every one is what this change removes.

## The app

- `inbox-rows.ts`: an account's list is its pages. The first page is live
  and saved with Home, so the Inbox still opens instantly from what's
  saved. Scrolling near the end asks for the next page; its rows join
  once their names load, like a conversation that arrives.
- The Home badge counts the first page's rows and pins, as the server
  does.
- Taps stay instant: pinning, hiding, leaving, and new conversations
  change the loaded pages optimistically, as they changed the list.
- A channel's @mention suggestions and its info screen's members come from
  `spaceMembers`, a page at a time; a space's screen shows its first
  members and channels and loads more from a row at the end.

## Not in this change

- A channel's `list`, `typing`, `reactions`, and thread queries still read
  the whole space's member list for their `routes`, and pushes for a
  channel message go to every member. Those make one big channel slow,
  not anyone's inbox; they need routes by home PDS rather than by person.
- Search over conversations covers the pages loaded.
