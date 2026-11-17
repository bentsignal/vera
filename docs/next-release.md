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

## Make Vera an assistant on production (@Vera mentions)

**When:** after the backend deploy.

From `services/backend`:

```sh
npx convex run --prod vera:setup
```

It marks `vera@vera.chat` as an assistant in the messages plugin, so the
app's `@Vera` mentions are kept (bolded) in groups, channels, and direct
messages. The first summon would do it anyway, but until then the
mentions aren't stored.

**Verify:** in a group on production, send a message that mentions
`@Vera` from the picker: the mention is bold, and Vera answers in a
thread on it.
