---
name: support-inbox
description: Read and answer the Vera Support account's messages, triage bug reports, and tell reporters when a fix is being worked on and when it ships. Use when Shawn asks to check the support inbox, look at bug reports, reply to a user as support, or let reporters know about a fix.
---

# Vera Support inbox

`support@<account domain>` is a verified account on each PDS. It welcomes
every new account with a DM inviting bug reports, so people report problems
by replying there. A model answers them (Grok 4.7, or Gemini 4 Argon when
Grok fails, through the Convex AI Gateway,
`services/backend/convex/supportAgent.ts`): it asks for what's
missing, warns that reports are public, files each one as an anonymized
GitHub issue labeled "user report", and messages the reporter as the issue
is picked up, worked on, fixed, and released (`supportReports.ts`). You
can still read and reply through the operator commands in
`services/backend/convex/support.ts`, as the support account, when Shawn
asks; the model sees your messages as its own.

Run every command from `services/backend`, in any worktree or the main
checkout. Production needs `--prod`; use the dev deployment only when Shawn
says so (dev users are worktree test accounts, not real people).

## Environments

Each Convex deployment has its own support account and inbox:

| Deployment                   | Who writes in                       | Command flag                            |
| ---------------------------- | ----------------------------------- | --------------------------------------- |
| Production (`vera.chat`)     | real people (TestFlight, App Store) | `--prod`                                |
| Shared dev (`dev.vera.chat`) | release tests, worktree test users  | none, from a worktree on the shared PDS |
| Isolated `dev/<branch>`      | that worktree's simulator           | none, from that worktree                |

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

## Bug reports support filed

```sh
npx convex run supportReports:list '{"open":true}' --prod   # drop the arg for every report
npx convex run supportReports:track --prod                   # check GitHub now instead of waiting for the cron
```

`list` gives each report's GitHub issue, stage, and who reported it and in
which conversation. The issue itself never names the reporter: look them up
here when Shawn needs to. Issues never include screenshots, only support's
description of them; read the conversation (`support:read`) for the images.

Before filing, support checks the team's known bugs, kept in Convex
(`supportKnownBugs.ts`): every issue support filed, the moment it's filed,
and every other GitHub issue, synced every 10 minutes. The model reads all
the open ones and compares them by meaning; keywords and GitHub's search
cover closed issues and merged fixes. When one matches, it follows that bug
for the reporter instead of filing a duplicate (they get the same updates
as the first reporter), or tells them the fix is already out.

```sh
npx convex run supportKnownBugs:list '{"open":true}' --prod   # each known bug and who follows it
```

A PR that fixes one says `Fixes #<issue>` in its description. That links
the PR to the issue, which is how support knows a fix is being worked on,
merged, and then shipped (its merge commit in the newest
`mobile/ota/production/*` or `mobile/build/*` tag, plus `backend/deploy/*`
for backend changes). Reporters get those updates without anyone sending
them. Assigning the issue tells them someone picked it up. Closing it as a
duplicate of another issue moves them onto that one. Closing it with a
comment has support explain the comment to them in plain words, so say
why when you close one.

Without `GITHUB_TOKEN` and `GITHUB_REPOSITORY` on a deployment, reports
are kept on the PDS only and logged instead of filed. They're still known
bugs there, so duplicates are caught the same way. Production and the
shared dev deployment have both, and an isolated deployment copies them
from shared dev, so support files real public issues on `bentsignal/vera`
from all of them. Before testing support on an isolated backend, remove
them there (`npx convex env remove GITHUB_TOKEN` and `GITHUB_REPOSITORY`,
from `services/backend` in that worktree). A dev bot (maya, jonah, priya,
leo) can then write to support without a device:

```sh
npx convex run devSupport:write '{"username":"maya","body":"<message>"}'
npx convex run support:read '{"conversationId":"<the ID it returns>"}'
```

## Triage for Shawn

Summarize the reports, not the raw JSON: for each conversation, who wrote
(the address), what they reported in one line, whether it's a bug, a
request, or a question, its GitHub issue if support filed one, and the
conversation ID. Group duplicates. Shawn decides what gets fixed. Each fix
is a normal change (the `vera-feature` skill). A fix for a filed report
says `Fixes #<issue>` in its PR description. For a report support didn't
file (from before it filed issues), list the conversation instead:

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

- Support's model already answers every message and sends the updates
  below for reports it filed. Write as support only when Shawn asks, such as
  for a report it didn't file.
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
