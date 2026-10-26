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

Over 40 minutes: 909 query runs read 95,659 documents (30 MB) and
returned 2.6 MB; 102 mutations read 14,868 documents.

- **44 query runs (5%) read 64% of all documents**: 1,260–1,520 each,
  returning 4–6 KB. That's the shape of `activity` (it scans up to 500
  reactions to your messages, 200 mentions, 200 replies and 200 threads,
  each with its sightings, over the last 7 days) and the badge count,
  which runs `activity` per push (`notifications:badge`: 1,354 documents
  a run).
- **11 mutations (11%) read 95% of mutation documents**: 1,100–1,500
  each. That's `markRead`, which scanned every reaction to your messages
  in every conversation to see this one's.

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

## Plan, one pull request each, in order of cost

1. `markRead` sees only what's new (this PR).
2. The inbox: each row reads less; then a message reruns one row, not
   the whole inbox (proposal below).
3. Typing decoupled: out of the conversation's and thread pages'
   includes, and indexed by thread.
4. Pages without their includes on every rerun (proposal below), and a
   small live page.
5. `activity` sends and reads less.
6. Older pages asked for ahead; first open (the inbox saved on the device
   at once).

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

| One run | Before | After |
| --- | ---: | ---: |
| `inbox` (29 rows) | 592 docs, 272 KB read | 245 docs, 99 KB read |
| `inboxThreads` | 312 docs, 163 KB | 249 docs, 142 KB |
| `conversation` | 36 docs, 13 KB | 26 docs, 9 KB |
| `activity` | 677 docs, 319 KB | 614 docs, 298 KB |

| Live | Before | After |
| --- | ---: | ---: |
| One message: documents read, everything it reruns | 2,216* | 315 |
| 30 messages in 15 s: documents read | 23,414 | 10,904 |
| 30 messages in 15 s: sent to the phone | 1,008 KB | 1,008 KB |

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

| | Before | After |
| --- | ---: | ---: |
| Typing in the chat: server runs | 16 (`conversation` ×4, the thread page ×4, both typing ×4) | 4 (`typing` ×4) |
| Documents read | 486 | 45 |
| Sent to the phone | 12 KB | 1.1 KB |
| Typing in the thread: sent to the phone | 27 KB | 1.1 KB |

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
row or thread asks whether anything is unread rather than counting up to
99. Badge values are identical (checked for four account and app
combinations).

| Badge, one run | Before | After |
| --- | ---: | ---: |
| Reads everything, current app | 864 | 693 |
| Reads everything, older app | 2,555 | 571 |
| Never reads, current app | 353 | 235 |
| Never reads, older app | 1,436 | 253 |

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
