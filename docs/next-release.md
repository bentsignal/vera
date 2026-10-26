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

## Support: clear the old known-bugs copy (after the backend deploy)

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

