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

## Media CDN: show only pictures, video and audio in a browser

**When:** before the backend deploy (any time before is fine; it changes
nothing the app relies on).

From the repo root, with the bunny CLI logged in:

```sh
node infra/media-cdn/rules.mjs vera-media-dev --apply   # dev, if not done yet
node infra/media-cdn/rules.mjs vera-media               # read the plan
node infra/media-cdn/rules.mjs vera-media --apply
bunny api POST /pullzone/6728657/purgeCache             # vera-media's id
```

It adds three edge rules to the `vera-media` pull zone (`media.vera.chat`):
no scripts and no type guessing on any file, and a forced download for
anything that isn't a picture, video or audio (infra/media-cdn/README.md).
Tested on a throwaway zone before the PR; the purge makes files already
cached pick up the new headers.

**Verify:** a photo in a recent message still shows in the app, and its
URL serves `content-security-policy: sandbox; default-src 'none'` and no
`content-disposition`:

```sh
curl -sI https://media.vera.chat/<path of a recent photo> | grep -i 'content-\|nosniff'
```

A file attachment (a PDF, say) answers with `content-disposition:
attachment`, and opening it in the app offers to download it rather than
showing it in the browser sheet.
