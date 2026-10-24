---
name: merge
description: Use whenever Shawn asks you to merge this thread's pull request or approves it to merge, such as "merge it", "merge", "ship it", or "approved".
---

# Merge

Shawn's approval to merge covers the PRs linked to this thread and nothing
else, and everything that follows a merge: the dev server and devices come
down and the thread is settled. Do each step that applies, in order,
without asking.

## 1. Stop what's running

The dev server has been up since the work was ready to test. Bring it and
every device down, then check nothing is left. First call `device_list`
and `device_close` every device it shows open in this thread's Device
panel. Then:

```sh
scripts/phone.sh down; scripts/phone.sh --android down
scripts/sim.sh down; scripts/sim.sh --android down
scripts/sim.sh status        # ios: none, android: none, metro: stopped
xcrun simctl list devices booted | grep "Vera $(basename "$PWD")" || echo gone
```

If a simulator won't shut down (stuck "Shutting Down"), the Mac's simulator
service is jammed: tell Shawn in your report, and don't settle the thread
as if everything is stopped. If this worktree had its own dev client,
`phone.sh down` prints main's install link: send it so Shawn can put
main's dev client back.

## 2. Check the PR is ready

- Nothing uncommitted or unpushed in the worktree (`git status`, then
  `git push`).
- CI passed on the PR's latest commit (`gh pr checks <number> --watch`).
  Fix failures before merging.
- If the PR's description no longer matches the change (later feedback
  rounds), update it.

## 3. Merge

If this worktree has an isolated backend and Shawn signed in to it on his
phone, ask him to sign out of that throwaway account in Vera Dev first
(More > the account > Sign Out), and wait for him.

```sh
gh pr merge <number> --merge --delete-branch
gh pr view <number> --json state     # MERGED
```

`gh pr merge` may say it can't switch to `main` because another checkout has
it. The merge still happened. Delete the remote branch with
`git push origin --delete <branch>` if it's still there. For a stack, merge
from the bottom up, retargeting each layer to `main` as the one below it
merges.

## 4. Backend

Only if the PR changed the backend (Convex functions, schema, or a plugin's
server code; anything that got an isolated backend):

```sh
scripts/backend.sh teardown          # if isolated
git fetch origin && git checkout --detach origin/main
pnpm install --frozen-lockfile
pnpm release backend dev
```

Then call what changed on the shared deployment (`npx convex run` from
`services/backend`, or `curl` the HTTP route) to check it's live.

## 5. Settle the T3 thread

- `list_thread_pull_requests`: every PR from this work is linked and
  merged. Link any that's missing.
- `unwatch_pull_request` for each PR being watched.
- `t3_thread_organize` with `action: "settle"`. It takes effect when your
  turn ends.

## 6. Report

Say what was merged (PR link), whether the dev backend was updated, and any
extra release steps the PR added to `docs/next-release.md`. Keep it short.
