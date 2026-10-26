# Next release: extra steps

One-off steps the next release needs on top of the normal flow in
[releasing.md](releasing.md). The `vera-release` skill requires working
through this file. Do every step in order, and check each one's **Verify**
before moving on. A step that fails or can't be done blocks the release; tell
Shawn instead of skipping it.

`pnpm release plan` lists these steps, and production builds and updates
refuse to run until `--next-release-done` confirms the ones due by then are
done. After the release, open a PR that removes the finished steps (leave
the heading and intro so the file stays in place for the next release).

Adding steps: any PR whose release needs something beyond `pnpm release`
adds a section here in that PR (see AGENTS.md → Releases).

## Fold Vera Support's conversations into Vera

This release's backend makes Vera Support part of Vera: Vera takes bug
reports now, and nothing answers `support@vera.chat`. A one-time migration
moves each person's conversation with support into their conversation with
Vera (every message at its original time, read where it was read), points
their bug reports at the Vera conversation, and then deletes support's
conversations and the support account. Shawn approved deleting them
(2026-10-26).

**When:** right after the production backend deploy
(`pnpm release ota production "<notes>" --with-backend`), in the same
sitting. Until it runs, support's conversations get no replies and bug
report updates for them fail.

**Commands** (from `services/backend`):

```sh
npx convex run mergeSupport:conversations --prod   # how many will move
npx convex run mergeSupport:run --prod
```

It can't be undone. Each conversation moves in its own transaction, so if
it stops partway, run it again; it picks up what's left.

**Verify:**

- `mergeSupport:run` returned `"accountRemoved": true`.
- `npx convex run mergeSupport:conversations --prod` returns `[]`.
- `npx convex run supportReports:list '{"open":true}' --prod` shows every
  `conversationId` with `vera@vera.chat`, none with `support@`.
- `npx convex run affiliations:list --prod` no longer lists
  `support@vera.chat`.
- In the Vera app, the Vera Support conversation is gone and its messages
  are in the Vera conversation.

## Bug reports: clear the old known-bugs copy (after the backend deploy)

PR #307 made GitHub's issues the only record of bugs and removed the
`knownBugs` table, which held a copy of every issue. Production still has
its rows, and bug reports still point to them in an unused `bug` field. Once
the backend with #307 is deployed, from `services/backend`:

```sh
npx convex run supportReports:forgetKnownBugs --prod
printf '' > /tmp/empty.jsonl
npx convex import --prod --table knownBugs --replace -y /tmp/empty.jsonl
```

**Verify:** the first command returns `cleared` equal to `reports` or
fewer, and running it again returns `"cleared": 0`;
`npx convex data knownBugs --prod` says there are no documents. A later PR
drops the `bug` field from the schema.
