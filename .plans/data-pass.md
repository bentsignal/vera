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
