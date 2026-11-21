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

## Inbox paging: check the inbox order filled in (after the backend deploys)

**What:** The backend adds a stored inbox order per person
(`inboxEntries`, .plans/inbox-paging.md). It fills itself in for existing
conversations after the deploy, starting with the first message anyone
sends; nothing to run. Until it finishes, inboxes are listed the old way.

**When:** Right after `pnpm release` deploys the backend to production.

**Verify:** A few minutes after the deploy (once someone has sent a
message), from `services/backend`:

```sh
npx convex data --prod --component messages sequencing
```

shows a row with key `inboxFill` and `done: true`, and

```sh
npx convex data --prod --component messages inboxEntries --limit 5
```

lists rows. If `inboxFill` isn't there after 15 minutes, send any message
in the app (that starts it) and check again. If it's there with
`done: false` for over 30 minutes, tell Shawn: inboxes still work, the
old way, but the fix isn't in effect.
