# Data pass: lean, decoupled queries (2026-10-22)

Vera is slow to open (inbox, chats, threads), queries are coupled (typing
reruns the conversation), and Convex spend is higher than it should be.
This pass fixes the data layer: what the PDS reads and sends, and how the
app asks for it. The native message list (`t3/native-message-list*`)
fixes rendering; this doesn't touch what the list screen receives
(`useMessages` and friends keep their shape), only how it's fetched.

Principles agreed with Shawn: measure first and fix in order of cost;
split queries by how often their data changes; keep together what must
appear together (nothing shows until what would change its size is in);
send only what screens draw; one round trip per screen on first open.

## How it's measured

- **Production**: `npx convex logs --prod --jsonl --success` for an hour.
  Every request is `pds:dispatchQuery` or `pds:dispatchMutation`, so the
  logs give cost per run (documents and bytes read, bytes returned) but
  not which operation. The router can now log which (`PDS_TRACE=1`, the
  operation's type and the shape of its arguments, never values); turning
  it on in production for an hour would attribute production's costs.
- **Per operation** on an isolated backend (`dev/t3-data-pass`): the
  seeded conversations (`dev:seed`, `dev:seedFull`: 26 conversations) plus
  one busy group (`devBusy:seed '{"count":600,"livened":300}'`: 600
  messages, reactions on a third of the newest 300, 12 threads).
  `scripts/pds-cost.ts once` runs each query once through the router as
  the account and reads its cost from the logs.
- **Live**: `scripts/pds-cost.ts live` is a headless phone. It signs in
  (dev sign-in), subscribes to what the app subscribes to with the busy
  group open (inbox, activity, thread list, spaces, the conversation, its
  member events, typing, both pages of the latest window, their reaction
  and thread-summary batches, the `since` queries, and the profiles
  shown), then runs events and reports what the server ran, by operation,
  and what the phone received.
- **App**: cold-open time to the inbox, a chat and a thread in the
  simulator with a production bundle (below, once measured).

## Before

### Production (an hour of logs, 2026-10-22 evening)

In 59 minutes, functions read 257,902 documents (81 MB) and returned
6.6 MB:

| What                                           |  Runs |   Documents | Share |
| ---------------------------------------------- | ----: | ----------: | ----: |
| App queries (`pds:dispatchQuery`)              | 1,159 |     130,700 |   51% |
| The badge on each push (`notifications:badge`) |    81 |      90,732 |   35% |
| App writes (`pds:dispatchMutation`)            |   143 |      34,620 |   13% |
| Everything else                                |       | under 3,000 |    1% |

- **36 query runs (3%) read 60% of the queries' documents**, over 1,000
  each, returning 4–6 KB: the shape of `activity` (it scans up to 500
  reactions to your messages, 200 mentions, 200 replies and 200 threads
  over the last 7 days, each with its sightings).
- **The badge**: every push works out the recipient's badge, which is
  `activity` counted plus the Inbox rows with something unread. 81 runs,
  median 830 documents, up to 3,093.
- **17 writes (12%) read 82% of the writes' documents**, 1,100–1,500
  each: `markRead`, which scanned every reaction to your messages in
  every conversation to see this one's.

### Per operation (busy group, one run each)

| Query                                   |              Documents |   Read |     Returned |
| --------------------------------------- | ---------------------: | -----: | -----------: |
| `inbox` (26 conversations)              |                    571 | 273 KB |        23 KB |
| `activity` (as the app asks)            |                    597 | 301 KB |       147 KB |
| `inboxThreads`                          |                    312 | 167 KB |        52 KB |
| `conversation` (group)                  |                     35 |  15 KB |       2.8 KB |
| `list` page of 50 (with includes)       |                     96 |  45 KB |        30 KB |
| `list` live page (empty, with includes) |                     21 |   8 KB |       1.1 KB |
| `reactions` batch of 50                 |                     23 |   9 KB |       2.5 KB |
| `threadSummaries` batch                 |                      9 |   4 KB |       0.6 KB |
| `typing`                                |                      7 |   3 KB |       0.2 KB |
| `thread` page (with includes)           |                     44 |  18 KB |       6.6 KB |
| `markRead`                              | 238, growing 21 a call | 121 KB | 20–22 writes |

### Live (headless phone, busy group open)

| Event                      | Server runs                                                      | Documents | Sent to the phone |
| -------------------------- | ---------------------------------------------------------------- | --------: | ----------------: |
| One person typing, 8 s     | `conversation` ×4, `typing` ×4                                   |       312 |             12 KB |
| One message                | `inbox`, `conversation`, live page                               |   2,216\* |             28 KB |
| Your `markRead`            | `markRead`, `activity`, `inbox`, `conversation`                  |     1,484 |            142 KB |
| A reaction to your message | `inbox`, `activity`, `conversation`, both pages, their reactions |     1,428 |            202 KB |
| 30 messages in 15 s        | `inbox` ×30, `conversation` ×30, live page ×30                   |    23,414 |          1,008 KB |

\* includes the phone's own `markRead` that followed.

What it shows, in order of cost:

1. **`markRead` writes ~20 documents every time, even with nothing new**,
   and each write reruns `activity`, which sends ~143 KB. It records each
   reaction to your messages as seen "through now", so the sighting is
   always new; and it reads every reaction to your messages in every
   conversation to find this one's. The rows it adds make it read 21 more
   documents each call.
2. **The inbox reruns on every message in any conversation**, and on every
   `markRead`: 571–623 documents and 24 KB to the phone each time (30
   messages: 19,155 documents, 723 KB). Each row reads its 11 newest
   messages to find the newest that isn't deleted.
3. **`activity` sends ~143 KB each run**: every item carries its whole
   message and conversation (with members).
4. **Pages carry what they include**: a page's subscription reads its
   reactions, thread summaries and profiles too, so a reaction resends
   the whole page (29 KB) on top of the reaction batch. The live page
   resends all its messages on each new one (203 KB for 30 messages).
5. **Typing reruns the conversation** (`conversation` includes `typing`),
   and every thread page; typing in one thread reruns the others' typing.

## Pull requests, in order of cost

Stacked, each on the one before:

1. #267 `markRead` sees only what's new (and the measuring tools).
2. #268 Inbox rows read less.
3. #269 Typing out of the conversation's and threads' includes.
4. #270 The badge counts without reading what only shows.
5. #271 The next page asked for ahead.
6. #272 A small live page.
7. Open timings in a production bundle, and the app opening on the saved
   Home at once (with the simulator's timings).

The rest needs a decision first (proposals below): pages and the
conversation without their includes on every rerun (A), the inbox's rows
apart from its list (B), Activity's shape (C), unread counts (D), and
pushes (E).

## Decided with Shawn (2026-10-22)

- **A, yes.** A query's first answer is a one-shot call (not kept as a
  subscription) that returns everything the first view needs: the page
  with its reactions, thread summaries and profiles, so nothing shows
  until the reactions are in. After that the app subscribes only to the
  small pieces (messages, reactions, thread summaries); a reaction never
  rebuilds a page, and there's no subscription per message. Smaller
  pages are fine if they measure better; lean toward speed without
  wasteful loading. Older apps keep today's behavior. To the person
  using the app, everything arrives together (messages, reactions, reply
  counts and thread lines, profiles and photos); only typing may arrive a
  moment later, animating in as typing does.
- **B, by the numbers**: Convex's pricing for calls, database I/O and
  egress, a realistic day of opens and messages, today's one inbox query
  against a list plus a query per row. Take it if it's a clear gain on
  cost and speed, leaning toward speed. The math is below.
- **C, yes, with items kept separate**: five threads with activity in one
  channel are five items, opened one at a time. Only the repeated
  conversation details go; nothing merges or groups. Older apps keep
  working.
- **D, replaced**: where only a dot shows, don't count; ask whether
  anything is unread. VoiceOver says "unread" without a number.
- **Real unread numbers**: badges show the real number, like Mail, into
  the tens of thousands, not capped at 99. Counting has to be cheap, not
  capped (for example, a sequence number per conversation, unread being
  the newest number minus the last one read), minding deleted messages and
  the reader's own.
- **The badge rule**: the app icon badge counts every unread message from
  a person in a direct message, every unread message in a group, and one
  for each channel with anything unread. Activity items count as now
  unless that clashes (written up below). Shawn tests it on his phone.
- **E, skipped**: pushes aren't coalesced or delayed.

## Proposals (as put to Shawn)

### A. Included queries answered once, not on every rerun

The PDS answers a query's included queries inside that query
(`answerIncluded` in the router), so everything included is part of what
reruns it, and every rerun resends the includes too. A reaction resends
the page it's on (29 KB) as well as the reaction batch; the newest page
resends its `since` reactions, summaries, and profiles with every message;
the inbox reruns when anyone's profile changes. The app subscribes to each
included query on its own anyway (that's how it gets their updates), so a
rerun's includes are redundant.

Two shapes keep "a message never shows without its reactions":

1. **Reactions and summaries keyed by the page's cursor** (Shawn's
   proposal): `reactions({ conversationId, before })` and the like,
   asked for at the same moment as the page, without waiting for its
   message IDs. The PDS works out the page's messages again to find
   their reactions (about 50 more message reads per page and query, and
   the reactions query reruns whenever a message in that range changes,
   so the newest page's reruns on every message). It fixes pages only.
2. **Includes on the first answer only.** The app's first fetch of a
   query is a one-shot that comes back with what it includes (one round
   trip, as now); the live subscription asks with `include: false` and
   carries just its own result. Apps already installed don't send the
   flag and keep today's behavior. On opening, the query runs twice
   (one-shot and subscription), about the same as today's doubled
   includes (today the includes run inside the query and again as their
   own subscriptions). After that, nothing a query includes reruns it.
   It fixes pages, the conversation (member events, profiles), thread
   pages, and the inbox (profiles) at once, and it's what makes B
   possible.

Measured on the busy group, a page of 50: the page alone reads 55
documents and returns 20 KB; with its includes, 96 documents and 30 KB.
A reaction today reruns the page (96 docs, 29 KB to the phone) and its
batch (23 docs, 2.5 KB); with either shape, only the batch.
Recommendation: **2**, since it fixes every screen with one mechanism and
reads less than 1.

### B. The inbox's rows apart from the list

Every message in any conversation, and every `markRead`, reruns the whole
inbox and resends it: 24 KB (29 rows) each time, which #268 made cheaper
to read but not smaller. Splitting the list (who's in it, names, pins,
alerts; changes rarely) from each row's latest message and unread count
(changes with every message) makes a message rerun one row (about 1 KB).
On opening, the list would include its rows (one round trip), which needs
A.2, or its rows would rerun the list again.

Cost on opening: one query per row (29 here) rather than one. Each is
small, and Convex runs them in parallel.

### C. Activity's shape

Each Activity item carries its whole conversation (with every member)
and its whole message: 143 KB for 130 items here, 41 KB of it the same 29
conversations repeated. Listing each conversation once and items pointing
at it would cut it by about half; it changes the result's shape, so the
app reads both until older apps are gone.

### D. Unread counts capped lower

An Inbox row and a conversation count unread messages up to 99, reading
each one, on every rerun. The app draws only a dot; the number shows only
in VoiceOver ("12 unread"). In a busy group you aren't reading, every new
message reruns the inbox and reads up to 99 messages for that row. Capping
at 10 (VoiceOver: "10 or more unread") would cut that to 10.

### E. Pushes coalesced per conversation

The high-load plan's step 1.4: a recipient gets at most one push per
conversation every couple of seconds. Each push works out the badge
(#270 made it 3–5× cheaper); in production the badge was 35% of all
documents read (81 runs in an hour). Coalescing would cut how often it
runs during bursts, and it changes what people receive, so it's Shawn's
call.

## Results

### 1. `markRead` sees only what's new

Reactions to your messages are read by conversation (a new index,
`by_author_conversation_reacted`), and each is seen through its newest
reaction, so reading again with nothing new writes nothing. Replies to
you likewise (`by_quote_author_conversation_sent`).

|                                                |                  Before |                                    After |
| ---------------------------------------------- | ----------------------: | ---------------------------------------: |
| `markRead` documents read                      |      238, +21 each call |                              168, steady |
| `markRead` writes                              |                   20–22 | 2 (read position, conversation sighting) |
| `activity` reruns per `markRead`               | 1 (143 KB to the phone) |                                        0 |
| Documents per `markRead`, everything it reruns |                   1,484 |                                      801 |
| Sent to the phone per `markRead`               |                  142 KB |          0 KB when nothing shown changed |

### 2. Inbox rows read less

Each row read its 11 newest messages to find the newest that isn't a
deleted original; it now reads one (and more only past a deleted one).
A query that lists many channels of a space (the inbox, activity, the
thread list) reads the space, its members, and the caller's membership
once, not once per channel (`spaceReads.ts`). Results are identical.

| One run           |                Before |                After |
| ----------------- | --------------------: | -------------------: |
| `inbox` (29 rows) | 592 docs, 272 KB read | 245 docs, 99 KB read |
| `inboxThreads`    |      312 docs, 163 KB |     249 docs, 142 KB |
| `conversation`    |        36 docs, 13 KB |        26 docs, 9 KB |
| `activity`        |      677 docs, 319 KB |     614 docs, 298 KB |

| Live                                              |   Before |    After |
| ------------------------------------------------- | -------: | -------: |
| One message: documents read, everything it reruns |  2,216\* |      315 |
| 30 messages in 15 s: documents read               |   23,414 |   10,904 |
| 30 messages in 15 s: sent to the phone            | 1,008 KB | 1,008 KB |

\* the before includes the phone's `markRead`; the after doesn't.

What's sent doesn't change: the inbox is one result, so each message
resends all of it (24 KB). That needs the rows apart from the list
(proposal below).

### 3. Typing decoupled

Who's typing is no longer included with the conversation or a thread's
pages: an included query reruns what includes it, so each typing refresh
(every 3 s per typist) reran the conversation and every open thread page.
The app asks for typing when the screen opens, alongside the
conversation, so it still arrives with the messages. Typing is also
indexed by thread (`by_conversation_thread_typed`), so typing in a thread
doesn't rerun the conversation's typing, or the reverse.

Live, the conversation, a thread page, and both typing queries open; one
person typing for 9 s:

|                                         |                                                     Before |           After |
| --------------------------------------- | ---------------------------------------------------------: | --------------: |
| Typing in the chat: server runs         | 16 (`conversation` ×4, the thread page ×4, both typing ×4) | 4 (`typing` ×4) |
| Documents read                          |                                                        486 |              45 |
| Sent to the phone                       |                                                      12 KB |          1.1 KB |
| Typing in the thread: sent to the phone |                                                      27 KB |          1.1 KB |

A closed conversation stays live for 3 minutes (`useStayLive`, up to 5 of
them), so it opens again at once; that no longer includes who's typing,
which nobody sees while it's closed and is asked for again on opening.

### 4. The badge counts cheaply

Production showed a cost the app's queries don't: every push works out
the recipient's app icon badge (`notifications:badge`), once per
recipient account, and that read 64,675 documents in 41 minutes, as much
as every app query together (94,555): 59 runs for 11 messages, median
830 documents, up to 3,093. The badge is `activity` counted, plus the
Inbox rows with something unread.

Counting now skips what only shows: each conversation's item stops at
its newest message from others (whether it's unseen depends only on
that; older apps' badge scanned up to 300 messages per conversation for
up to 99), conversations aren't described (who's in them), and an Inbox
row or thread asks whether anything is unread rather than counting up to 99. Badge values are identical (checked for four account and app
combinations).

| Badge, one run                | Before | After |
| ----------------------------- | -----: | ----: |
| Reads everything, current app |    864 |   693 |
| Reads everything, older app   |  2,555 |   571 |
| Never reads, current app      |    353 |   235 |
| Never reads, older app        |  1,436 |   253 |

Still per push and per recipient; pushes coalescing per conversation
(the high-load plan's step 1.4) would cut how often it runs.

### 5. The next page asked for ahead

A page's cursor is the last message of the page before it, so pages load
one at a time, and the list waits a round trip each time it reaches the
end of what's loaded (about 300 ms on the server for a page with what it
includes, more over a phone's connection). Once the reader scrolls past
the pages the window opened with, the next page that way is fetched as
soon as the one before it arrives (`pagesAhead`), so it's cached when the
list gets there. Opening doesn't fetch anything extra: someone who never
scrolls up costs nothing more, and someone who does costs one page beyond
where they stop.

### 6. A small live page

Each message resends the whole page it lands in, and the newest page
grew to 50 messages before the next one started. Apps following the
newest messages now ask for pages of 20 (`LIVE_PAGE_SIZE`, a new optional
`limit` on `list` and `thread`; older apps don't send it and get 50), and
the next page starts when one fills, as before. A full small page doesn't
include reaction batches, since its app follows those by time.

Headless phone following the newest page as the app does (chaining the
next page when one fills), 60 messages over 30 s:

|                   | Pages of 50 | Pages of 20 |
| ----------------- | ----------: | ----------: |
| Sent to the phone |      528 KB |      287 KB |
| Documents read    |       2,851 |       1,904 |

The longer a conversation stays open, the bigger the difference: a page
of 50 resends 25 messages on average, a page of 20 resends 10. A window
reopened more than one live page behind (20 messages now, 50 before)
opens afresh at the latest messages, as it does when it's more than a
page behind today.

### 7. Opening: timings, and the saved Home at once

`veraDev.timings()` (development and profile bundles on a dev PDS) says
how long the inbox, a conversation, and a thread took to show their
content: from the bundle starting for the first screen, from
`veraDev.open` for each after. `VERA_METRO_PROFILE=1 scripts/sim.sh up`
serves a production bundle to the dev client.

The app now opens on the Home saved on the device at once (it showed only
after the PDS hadn't answered for 2 seconds); the PDS's answers replace
it as they arrive. The deadline still says "Can't connect" if the Inbox
hasn't come from the PDS by then.

iOS simulator, production bundle, the seeded account (29 conversations),
cold launches (the app sent to the background first, so it saves), ms:

| Screen                   | Before (main)               | After (this stack) |
| ------------------------ | --------------------------- | ------------------ |
| Inbox, from launch       | 1,076 · 1,303 · 1,273       | 228 · 233 · 231    |
| Busy group, from opening | 828 · 731 · 741             | 791 · 740 · 874    |
| Thread, from opening     | 709 · 861 · 707 · 693 · 687 | 694 · 741 · 711    |

A conversation or thread opening is one round trip to the PDS plus
drawing, the same before and after: what changed is what they cost the
server and the phone afterwards, not their first answer. (One before run
of a thread took 2,129 ms and didn't repeat.)

### 8. Included queries on the first answer only (A)

A query's first answer is the one-shot fetch TanStack already makes
(`queryFn`); it comes with what the result includes, as before, so a page
arrives with its reactions, thread summaries and profiles. The live
subscription now asks the PDS with `include: false` (a new optional
argument on `pds:dispatchQuery`): the PDS neither answers the includes nor
works out which they'd be (a page's include list is now a function,
`IncludedQueries`), so nothing a query includes reruns it or is resent
with it. Each included query is followed by its own small subscription,
as it already was. A subscription answer that arrives before the one-shot
waits for it, so a page never shows without its reactions. Every page,
not just the ones a conversation opens with, now waits for its reactions
and threads before showing; they come in the same answer, so it costs no
time. Apps already installed don't send the flag and keep today's
behavior.

The live page holds 10 messages (it was 20 in #272); measured below.

Headless phone, busy group, a page of 50 open with its reactions,
summaries, conversation and profiles; one reaction to a message on it:

|                   |                        Before |                   After |
| ----------------- | ----------------------------: | ----------------------: |
| Server runs       | page, reactions, conversation | reactions, conversation |
| Documents read    |                           114 |                      31 |
| Sent to the phone |                         23 KB |                  1.1 KB |

60 messages over 30 s into an open conversation, following the newest
page as the app does:

| Live page                | Documents (page runs) | Sent to the phone |
| ------------------------ | --------------------: | ----------------: |
| 20, with includes (#272) |                 2,160 |            321 KB |
| 20, without              |                 1,117 |            216 KB |
| 10, without              |                   873 |            134 KB |

Pages of 10 take a few more calls (66 against 61 here, one first answer
per page). A window reopened more than 10 messages behind opens afresh at
the latest, as a cold open would.
