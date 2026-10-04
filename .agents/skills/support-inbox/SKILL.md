---
name: support-inbox
description: Read and answer the Vera Support account's messages, triage bug reports, and tell reporters when a fix is being worked on and when it ships. Use when Shawn asks to check the support inbox, look at bug reports, reply to a user as support, or let reporters know about a fix.
---

# Vera Support inbox

`support@<account domain>` is a verified account on each PDS. It welcomes
every new account with a DM inviting bug reports, so people report problems
by replying there. Nothing answers automatically: you read and reply through
the operator commands in `services/backend/convex/support.ts`, as the
support account, when Shawn asks.

Run every command from `services/backend`, in any worktree or the main
checkout. Production needs `--prod`; use the dev deployment only when Shawn
says so (dev users are worktree test accounts, not real people).

## Environments

Each Convex deployment has its own support account and inbox:

| Deployment                   | Who writes in                        | Command flag                            |
| ---------------------------- | ------------------------------------ | --------------------------------------- |
| Production (`vera.chat`)     | real people (TestFlight, App Store)  | `--prod`                                |
| Shared dev (`dev.vera.chat`) | internal builds, worktree test users | none, from a worktree on the shared PDS |
| Isolated `dev/<branch>`      | that worktree's simulator            | none, from that worktree                |

Bug reports that matter come in on production. Without `--prod`, commands
go to whatever deployment `services/backend/.env.local` names (check with
`scripts/backend.sh status`).

A deployment gets these commands when the backend is deployed to it
(`pnpm release backend dev` or `production`, see `vera-release`). If
`support:inbox` fails with "Could not find function", that deployment
doesn't have them yet: tell Shawn rather than deploying it yourself.

## Read

```sh
npx convex run support:inbox '{"unreadOnly":true}' --prod   # unread first; drop the arg for everything
npx convex run support:read '{"conversationId":"<id>"}' --prod
npx convex run support:read '{"conversationId":"<id>","before":<sentAtMs>}' --prod   # older
```

`inbox` lists each conversation's ID, the people in it, the unread count,
and the latest message. `read` returns up to 50 messages, oldest first, with
attachment URLs (open screenshots to see them). The support account sees only
messages stored on this PDS, so it misses what people on other PDSs write.
Every Vera account is on `vera.chat` today.

## Triage for Shawn

Summarize the reports, not the raw JSON: for each conversation, who wrote
(the address), what they reported in one line, whether it's a bug, a
request, or a question, and the conversation ID. Group duplicates. Shawn
decides what gets fixed. Each fix is a normal change (the `vera-feature`
skill). Put the reports a PR fixes in its description:

```markdown
## Support reports

- direct:alice@vera.chat:support@vera.chat (photos sideways in groups)
```

The release step uses that list to tell those people the fix is live.

## Reply

```sh
npx convex run support:send '{"conversationId":"<id>","body":"<text>"}' --prod
npx convex run support:send '{"to":"alice@vera.chat","body":"<text>"}' --prod   # a DM by address
npx convex run support:markRead '{"conversationId":"<id>"}' --prod
```

These go to real people, from Vera Support, as push notifications.

- Send only what Shawn asked for in this thread. If he asked you to work on
  reports and keep people posted, that covers the two updates below for
  those reports. Anything else, show him the text first.
- Write like a person on the Vera team: short, plain, friendly. No dates or
  promises, no internal details (PR numbers, branch names, stack traces).
- One message per update. Mark a conversation read once you've triaged it.

When work on a report starts:

> Thanks for reporting this! We're working on a fix and will let you know
> here when it's out.

When the fix reaches production (after `vera-release` step 4, not when the
PR merges):

> This is fixed in the latest update. Close and reopen Vera to get it.

For a store build, say it's in the newest version on TestFlight or the App
Store instead. If a fix only partly addresses the report, say what changed.

## Setup

The support account creates itself the first time anyone signs up after a
deploy. To create it immediately, or to welcome accounts made before it
existed (each account is welcomed at most once):

```sh
npx convex run support:setup --prod
npx convex run support:welcomeEveryone --prod
```

Ask Shawn before `welcomeEveryone` on production: it messages every
existing account.
