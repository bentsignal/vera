# Instant loading (decided with Shawn, 2026-10-18)

Opening the app and switching between chats should feel instant, with
nothing shifting under the user and without fetching everything in the
background.

## Pass 1: one round trip per screen (#148)

- [x] A query's result names the queries the app asks for next to show it
      (`queryResult(data, { include })`); the PDS answers them in the same
      round trip and the client caches them. A page of messages includes
      its reactions, thread summaries, and the profiles it shows; the inbox
      includes its rows' profiles; a group includes its joins and leaves.
- [x] Reactions and thread summaries read their rows concurrently.
- [x] The inbox waits only for the names its rows show; a channel only for
      the people on screen.
- [x] The login token is saved and reused while it's valid.

## Pass 2: saved conversations, shown only as a fallback (stacked on #148)

Built in `apps/mobile/src/features/saved`. Saving follows the live cache
(`saving.ts`); a screen still loading at its deadline fills in what's saved
(`show-saved.ts`); a conversation then opens at the window its pages were
saved from, so new messages join below. Dev builds can hold back the
server's answers (Developer > Server Answers) to try it.

**Fresh data first** (the Inbox changed in the data pass, 2026-10-22: the
app opens on the saved Home at once and the server's answer replaces it;
see `.plans/data-pass.md`). A screen shows nothing until the server
answers, as before. Only when it hasn't answered in 2 s (when the PDS client itself
gives up on a server's first answer) does it show what's saved on the
device instead. From then on the account's server counts as not
answering, so its other screens show what's saved as they open, until a
live result arrives. Most opens never show saved data. An underglow under
the header was tried and dropped (unclear, showy, it covered the top
message, and it lagged on Android).

**Saying it can't connect** (`features/saved/offline-pill.tsx`): once the
account's server has counted as not answering for 4 s more (about 6 s
after a screen opens; a slow answer is common, and saved data already
shows at 2 s), a glass "Can't connect · Retrying…" pill shows at the top of Home (the list makes room for it) and
under the name in a conversation or thread, held at least a second so it
never flickers. A thread still loading at the deadline counts too. A query
that timed out counts as still loading, not as empty, so Activity shows
the spinner instead of "All Caught Up".

**Slow loading** (`components/pending.tsx`, like TanStack Router's
`pendingMs`/`pendingMinMs`): a screen shows nothing for its first second;
still loading, a spinner fades in and stays at least a second, so it never
flickers. Lists show it at the top, where their rows start; conversations
in the middle. Still nothing at 6 s, "Can't Connect / Retrying…" fades in
below it (at once if screens already say the server can't connect), unless
the screen's pill already says so. On every `ScreenList`, conversations,
and threads.

**Saving** happens as the app leaves the screen ("inactive" or
"background", since an app closed from the iPhone's app switcher is only
inactive), and only if something changed. Each save takes 10 to 60 ms of
the JavaScript thread on Android, so never while the app is in use.

**Trying it** (Developer, dev builds only): Server Answers picks Right
Away, After 1.5 / 3 / 10 Seconds, or Never; Forget Saved Conversations
deletes what's saved and saves nothing until the next launch.

- Saved per account: the inbox, and the 20 most recent conversations'
  latest 50 messages with their reactions, thread summaries, and the
  profiles they show. Signing out deletes it. Photos rely on expo-image's
  disk cache.
- [x] **Measured** with the full seed (Developer > Seed 20 Full
      Conversations, or `/dev-seed?full=1`: 4 DMs, 8 groups, 10 channels of
      60 messages with photos of every shape, links, long and short text,
      reactions, and threads). What's saved is about 35 KB a conversation
      and 29 KB for the inbox: 0.7 MB for all 20. Photos dominate: 171 of
      their 200 photos in expo-image's disk cache took 36 MB (218 KB each),
      so about 45 MB for all of them. That cache already existed; offline
      photos last as long as it keeps them.
- **One swap.** Once fresh data replaces saved data on screen, it does so
  in one update, never piece by piece.
- **Nothing moves under the user:**
  - Conversation at the bottom: new messages slide in as live ones do.
  - Conversation scrolled up: what they're reading stays put; new messages
    wait below with jump-to-latest. Edits and reactions update in place.
  - Inbox untouched: updates at once, no animation.
  - Inbox while touched or scrolling: the update waits until the list
    rests, then applies at once. This applies to live updates too.

## Pass 3: keep recent chats current (#151, stacked on pass 2)

- [x] Who's typing comes with a chat's first load: the PDS includes it with
      the conversation and with a thread's page, and the chat waits for it
      before fading in, so the indicator never pops in after. A saved chat
      shows nobody typing until the PDS says.
- [x] Chats you leave stay live for three minutes (five at most), so
      reopening one shows its new messages, reactions, and who's typing at
      once (`features/messaging/stay-live.ts`).
- [x] A `changedAt` marker on each conversation, set by messages, replies,
      edits, deletions, and reactions.
- [x] When the live Inbox shows a saved conversation changed while it isn't
      open or staying live, its latest messages are fetched again (two at a
      time) and the next save writes them (`features/saved/refresh-saved.ts`,
      with each saved conversation's version in `versions.json`). Quiet
      conversations cost nothing.
- [x] Inbox rows start loading as a finger lands.

## Later

- Typing indicators merged to main and into this stack (done).
- Not covered: a connection that drops while a screen is already open
  shows no pill; that would need the client's connection state.
- Shawn merges the whole stack at once, after testing.
