# Message list under load (audit and plan, 2026-10-21)

Testing #244, three dev bots sent 300 messages to a group over 83 seconds
while Shawn had it open in Vera Dev. The list lagged, messages showed up out
of order, a message he sent mid-burst never appeared, and reopening the chat
showed "Burst message 80, 81, 82", then other numbers, then a blank screen.
It recovered only after a restart.

This pass makes the list and the data behind it hold up under that kind of
load. The look and animations at normal load stay exactly as they are.

## How it was measured

Isolated backend (`dev/t3-message-list-load-resilience`), iOS simulator, the
seeded "Weekend crew" group, the burst from the task (300 messages, 3 bots,
0.2–0.33 s apart), three sends from the app at 20 s intervals. A temporary
dev-only probe (not committed) recorded JS-thread stalls (a 16 ms timer's
lateness), TanStack cache adds and removes, list renders, and the window's
state; a Hermes CPU profile covered a 100-message burst; a React Profiler
timed commits; `scripts/sim.sh frames` recorded the UI thread; Convex logs
covered the server.

## What broke, and why

### 1. The JS thread was busy 43% of the time (39 s of 90), with stalls up to 4.3 s

Everything on screen waits for the JS thread: new messages, taps, the send
itself. The CPU profile of a 100-message burst:

- **93% of the busy time was synchronous React work.** TanStack Query
  publishes through `useSyncExternalStore`, so every query update is a
  synchronous render and commit that can't be split up. Under load,
  updates arrive many times per message (below), and each one renders the
  whole conversation.
- **Every update re-renders every mounted row**: 6,061 row renders in 109
  list updates, about 55–66 rows each time. A new message should re-render
  one or two. Each row that re-renders also re-registers its Reanimated
  styles with the UI thread (`scheduleOnUI`, worklet cloning), which is
  most of what a row costs. The row's props change every time because
  `renderItem` closes over objects rebuilt on every render (`typing`,
  `leaving`).
- Dev builds (Vera Dev) add React's owner stacks and performance tracks to
  every render, so all of this is several times worse on Shawn's phone
  than in a release build. It has to be fast in dev too.

### 2. Each message triggers a cascade of query updates

On the client:

- Reactions and thread summaries are queried per batch of message IDs, so
  the newest page's key changes with every arrival: [a], [a, b], [a, b, c],
  and so on. 105 new queries were added during the burst and none were
  removed (inactive ones wait out `gcTime`). Each new key unsubscribes one
  query, subscribes another, and also runs a one-shot fetch (two server
  executions), and `held-batches.ts` exists only to paper over the gap.
- `useMarkRead` sends `markRead` for every new newest message.
- `routed-pds-observer.ts` publishes twice per server update (once on the
  update, once after routes reconcile), so every update is two renders.

On the PDS (`packages/decentralized-convex-messages`):

- **Every send writes the conversation's single document twice**
  (`markChanged` sets `changedAt`, then `updatedAt`) **and the sender's
  member row** (`lastReadAt`). Every conversation-scoped query reads that
  document through `requireAccess`, and `list`, `reactions`,
  `threadSummaries` and `typing` also read every member row
  (`memberAddresses`, for routes). So each message re-runs **every live
  query in the conversation**: every page, every reaction and summary
  batch, typing, the conversation, member events, plus the inbox and
  activity. The phone's `markRead` writes its member row, which re-runs
  them all again. The logs show about 7 query executions per message for
  one open phone.
- `notifications.send` runs per message and is O(members), and it computes
  a full badge count (activity plus inbox) per recipient device per
  message.

### 3. Your message never appeared: write conflicts starved it

Server logs: the app's `send` failed with Convex's conflict error on the
`conversations` table ("changed while this mutation was being run and on
every subsequent retry"). Every bot send writes that document, so the
app's send, which reads more and runs longer through the router, kept
losing the race. The three sends were made at about 22, 42 and 62 s; the
server took them at 98–102 s, after the burst ended. Meanwhile:

- The live tail page is capped at 50 messages (`MESSAGE_PAGE_SIZE`). Past
  that, `hasNewer` turns true and `unconfirmedSends` returns nothing, so
  your own unsent messages vanish from the list.
- With `hasNewer` true, `sendMessage` calls `jumpToLatest`, which throws
  the window away and opens a new one. Its pages aren't cached, so the
  list unmounts until they load: a blank screen.
- `newestSentAt` is undefined, so read state stops following.

No messages were lost: all 300 plus the three sends were in the pages at
the end.

### 4. Reopening shows an old point, then a blank screen

Reproduced exactly: back out after a 150-message burst, reopen, and the
list ends at "grow message 56" with 94 newer messages missing; a second
later the screen is blank, and stays blank for over 10 s while 186
messages are loaded and nothing is loading.

- The 10-minute window reuse keeps only `openedAt`, not the pages loaded
  since, so it reopens on `[before T, after T]`: the 50 messages after T,
  not the latest.
- The list then loads newer pages through `onStartReached`, adding 50 rows
  at a time below what's on screen. The native
  `maintainVisibleContentPosition` keeps the scroll position on the old
  rows, but VirtualizedList keeps rendering the same index range, which now
  holds the new rows below the screen. The rows on screen aren't rendered:
  blank (the accessibility tree shows rendered rows 3 pt tall at the top
  edge, `hiddenContentAbove`).

### 5. "Badly out of order"

The pages merge and sort by `sentAt` correctly; the ordering itself is
right. What looked out of order was the window showing an old point and
filling in pages of newer messages (4), your own sends appearing at the
bottom a minute late (3), and rows lagging seconds behind (1).

### Frames

UI thread over the 90 s burst: 146 slow frames, 231 dropped, worst 224 ms.
Most are the JS-driven commits landing on the UI thread (each row
re-registering animations), not the arrival animation itself. The arrival
animation is measured again once the commits are fixed (step 3 below).

## The plan

The common thread: the list's data is a set of independent queries that
each change on every message, merged from scratch on every render, with
state like `hasNewer` doing several jobs. The fix makes the live part of a
conversation stable and the list incremental, so a new message costs one
small update end to end.

### Step 1: the PDS stops making every message expensive

1. **Sends don't write shared documents.**
   - `updatedAt` for the inbox comes from the conversation's latest
     message, which `toConversation` already reads; the stored field stays
     for creation and renames.
   - `changedAt` (saved copies) is the latest of the newest message, the
     newest reaction (a new index), and the stored field, which edits and
     deletions still set (they're human-paced).
   - Read position moves out of `members` into its own `readStates` table,
     one row per account and conversation. Reads fall back to
     `members.lastReadAt`, so no migration. Only queries that need it
     (inbox, conversation, activity) read it, so `markRead` and a sender's
     own read update no longer re-run everyone's queries.
   - Result: two people sending at once never conflict, and a message only
     re-runs the queries whose results it changes (the live page, the
     conversation, the inbox).
2. **Live reactions and thread summaries by time.**
   `reactions({ conversationId, since })` and
   `threadSummaries({ conversationId, since })`: everything reacted or
   replied to after `since`, from new indexes. Additive to the protocol,
   so older apps are unaffected. The tail page includes them in its round
   trip, the same way pages include their batches today.
3. **A per-account send limit.** A token bucket in `services/backend`'s
   `rateLimits` table, the same shape as `assistant-limits.ts`, checked in
   the PDS router before a client's `messages.send` reaches the component.
   The router is the only path clients have, and server-run bots (the
   assistant, Support, dev bots) don't go through it. A refusal is
   `ConvexError({ code: "RATE_LIMITED", retryAfterMs })`. Proposed limit:
   **30 messages at once, refilling one every 2 seconds** (30 a minute
   sustained). A person sending one-word messages as fast as they can type
   them stays well inside it; a script at the burst's rate (1.2 a second
   per account) hits it in about 45 s.
4. **Pushes coalesce per conversation** (smaller, could be its own PR): a
   recipient device gets at most one push per conversation per couple of
   seconds, and the badge count is worked out once per push, not per
   message.

### Step 2: a window that follows the live conversation

`message-window.ts` and `messages.ts` become a small pure model
(`window-model.ts`, tested with `node:test`) plus the hook that feeds it
query results.

- **The live window is a chain of sealed pages plus one live tail.** When
  the tail fills (50 messages), the next page starts automatically after
  its last message (by `sentAt`, inclusive, deduplicated by ID, so a
  millisecond tie at the boundary can't drop a message). Paging no longer
  depends on scrolling, and "at the latest" is a property of the window,
  not of one page's `hasNewer` at a given moment.
- **Reactions and summaries:** sealed pages keep their per-page batches
  (their IDs no longer change), and the live part uses the `since` queries.
  A message arriving changes no query keys. `held-batches.ts`,
  `held-ids.ts` and the settle-gate workarounds go.
- **Your sends always show at the bottom while the window is live**, until
  the pages list them. A refused send waits and retries in order when the
  limit allows, still shown as sending, and shows "Not sent" after the
  existing 20 s.
- **Opening:** the window remembers its whole chain, not just `openedAt`.
  Reopening restores the same pages (cached, so instant) if its tail is
  still current. If it's behind by more than a page, or the chain grew
  past six pages, it opens fresh at the latest instead. Either way it
  never streams pages of newer messages under the reader while opening.
- **Jumping to the latest** (sending from history, or the jump button)
  keeps showing the current list until the new window's pages are ready,
  then swaps with the usual fade. Never a blank screen.
- **`markRead`** follows the newest message at most once every two
  seconds, always ending on the newest.
- **One render per frame:** TanStack's notify scheduler batches updates to
  the next animation frame, so ten updates arriving within a frame render
  once.
- The transport publishes once per server update, not twice
  (`routed-pds-observer.ts`).

### Step 3: the list renders only what changed

- Rows get stable props, and per-row state that changes (arriving, typing
  morph, leaving) is read by the row itself from a small store keyed by
  row, so a new message re-renders the new row and its neighbor (for name
  grouping), not every mounted row.
- The merged message list keeps each unchanged message the same object
  across updates (built from TanStack's structurally shared data), so
  memoization holds without effort.
- Newer pages in an opened-in-the-middle window load past the bottom edge
  with VirtualizedList's render window kept in step with the native scroll
  anchor, so they can't blank the screen. (In the live window this no
  longer happens at all, since rows arrive one or a few at a time.)
- Arrivals: measured again after the above. If messages arriving faster
  than the 420 ms arrival animation still drop frames, arrivals within one
  animation join it and rise together. At normal pace nothing changes.

### Tests that keep it fixed

- `window-model.test.ts`: a 300-message burst arriving in random order with
  sends mid-burst. Sends stay visible; the chain seals and continues;
  nothing is lost or duplicated at page boundaries (including identical
  `sentAt`); reopening behind by more than a page opens fresh; jumping
  keeps the old list until the new one is ready.
- `unconfirmed.test.ts`: sends while the tail is momentarily behind.
- Mark-read throttle and send-limit bucket (pure functions).
- PDS tests (`convex-test`): a send writes no `conversations` or `members`
  document; `reactions`/`threadSummaries` with `since`; concurrent sends
  don't conflict.
- Render budget in `apps/mobile/perf`: 50 messages arriving one by one
  into a 200-message list re-render at most 2 rows each.
- Before and after: the burst's JS-stall and frame reports, the reopen
  sequence, iOS and Android, and videos for the PR.

## Decided with Shawn (2026-10-21)

- Send limit: 30 at once, refilling one every 2 seconds.
- Arrivals faster than the animation rise together, only under load.
- One pull request for all of it, tested together on his phone.

## What was built

Everything in steps 1–3 above, with these changes from the plan, found by
measuring:

- **Rows are memoized** (`Row` in `message-row.tsx`, with a comment on
  why). The list is inverted, so each new message is inserted first and
  moves every other row's index, and FlatList redraws each cell whose
  index moved. That redraw happens inside FlatList, where the React
  Compiler can't skip it: 50–80 row renders per update before, under 1
  after. Moving per-row state onto row items (the plan's first idea) didn't
  help, since the index still moves.
- **Pacing** (`paced-messages.ts`): others' new messages wait while a
  rise is in progress (`GROW_MS`) and then rise together; your own
  messages, older pages, reactions, edits, and deletions show at once. At
  a normal pace nothing waits: the first after a pause shows in the same
  render as its data.
- **Query updates** (`account-session.ts`): screens learn of new results
  in the next frame and at most every 400ms (`NOTIFY_GAP_MS`), except while
  something you did is on its way, so optimistic updates stay instant.
  Every React commit costs something fixed while the arrival moves run
  (Reanimated reapplies the moving rows' props on each commit): with the
  conversation at the bottom, Fabric's `completeRoot` was 4.6s of a 20s
  burst, 1.5s scrolled up where nothing moves on screen.
- **Rows that finish fading in at once open in one commit** (`inNextFrame`
  in `lib/next-frame.ts`), instead of one commit each.
- **Sends** go one after another per account, so they reach the PDS in
  order, and a send over the limit waits its turn.
- **`dev:burst`** schedules a burst from the bots on the backend, so the
  computer running it doesn't compete with the simulator:
  `npx convex run dev:burst '{"conversationId":"…","count":300,"seconds":83}'`.
- **Not done: push coalescing** (step 1.4). The PDS's per-message push work
  was about 0.1s of server time each and doesn't affect the app; it's left
  for its own change.

## Results

iOS simulator, dev build (Vera Dev), the seeded group, 300 messages over
83 seconds from three bots, three sends from the app during it.

| | Before | After |
| --- | --- | --- |
| Your sends, taken by the PDS | 76s late (write conflicts), hidden meanwhile | on time, shown throughout |
| Messages missing or doubled at the end | none | none |
| The window thrown away (blank) | when sending past 50 arrivals | never |
| Reopening after 120 arrived away | an old point, then blank for 10s+ | the latest message, at once |
| How far behind the list ran | growing, seconds | 0.8s median, 1.1s p90, steady |
| Longest JavaScript stall | 4.3s | 1.4s (local burst), 0.6s (server burst, 90 messages) |
| Row renders per update | 55–66 | under 1 |
| Queries added during the burst | 105 (none removed) | 30 |
| Server query runs per message (one phone open) | ~7, plus a second round for each `markRead` | the live page, the conversation, the inbox |
| UI frames at a normal pace (6 messages, 3s apart) | 6 slow, ~34ms each | 6 slow, ~34–47ms each |

The JavaScript thread is still busy most of a burst in a dev build: dev
React's owner stacks, performance tracks, and DevTools bookkeeping run on
every commit (a release build has none of it), and so does Reanimated's
reconciling of the moving rows. What matters is that the list keeps up and
nothing falls further behind; the remaining cost is per commit, and the
next step if it shows on a phone is fewer commits still while messages
stream in (for example, pausing arrival moves for rows off screen).
