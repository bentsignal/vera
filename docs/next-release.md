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

## Give production its own secrets (dev no longer shares them)

**When:** before the production update or build, any time after this PR
merges. Dev already has its own storage zone, bug report repo, and dev
tools secret; these steps make sure nothing dev ever held still works on
production. Each one is a production change: do them in order, one at a
time, and verify each before the next. Run Convex commands from
`services/backend`.

### Reset the production storage zone's password

Dev used to upload with `vera-media`'s password. Reset it and give
production the new one straight away (uploads fail for the seconds in
between):

```sh
bunny api POST /storagezone/1962830/resetPassword
bunny api GET /storagezone/1962830 -o json   # the new "Password"
npx convex env set BUNNY_S3_SECRET '<new password>' --prod
```

**Verify:** send a photo in a conversation on production (Vera, the store
app): it uploads and shows for the other person. Dev uploads still work
too (they use `vera-media-dev`, which this doesn't touch).

### New GitHub token for production bug reports (Shawn)

Shawn makes it at github.com → Settings → Developer settings →
Fine-grained tokens; an agent can't.

1. A production token: only repository `bentsignal/vera`; Issues read and
   write, Pull requests read, Contents read. Set it:
   `npx convex env set GITHUB_TOKEN '<token>' --prod`.
2. The dev token (only `bentsignal/vera-dev-reports`) is already made and
   set on the shared dev deployment; nothing to do.
3. Delete the old token both used to share, and the first dev token
   (it could reach `bentsignal/vera` too, so it was never used).

**Verify:** on production, the support inbox still shows issue status
(`npx convex logs --prod` shows no GitHub 401s after a report). On dev,
send a bug report to Vera: it lands in `bentsignal/vera-dev-reports`, not
in `bentsignal/vera`.

### New web search key for production (Shawn)

Dev and production share one Parallel key, and Parallel keys are made in
its dashboard (platform.parallel.ai), which needs Shawn. Make a new key
for production and set it:
`npx convex env set PARALLEL_API_KEY '<key>' --prod`. The old key stays on
dev only.

**Verify:** on production, ask Vera something that needs a web search
(today's news): it answers with sources. `npx convex env get
PARALLEL_API_KEY --prod` and the same with `--deployment
perceptive-magpie-29` differ.

### Check production has no dev tools

```sh
npx convex env list --prod | cut -d= -f1 | grep -E '^DEV_TOOLS' || echo none
(cd apps/mobile && eas env:list --environment production | grep -c DEV_TOOLS)
```

**Verify:** the first prints `none`, the second `0`. No EAS environment
should hold `EXPO_PUBLIC_DEV_TOOLS_SECRET` (only Shawn's Metro gives it to
bundles).

## Media CDN: show only pictures, video, audio and PDFs in a browser

**When:** before the backend deploy (any time before is fine; it changes
nothing the app relies on).

From the repo root, with the bunny CLI logged in:

```sh
node infra/media-cdn/rules.mjs vera-media               # read the plan
node infra/media-cdn/rules.mjs vera-media --apply
bunny api POST /pullzone/6728657/purgeCache             # vera-media's id
```

It adds four edge rules to the `vera-media` pull zone (`media.vera.chat`):
no type guessing on any file, no scripts on any file but PDFs, and a
forced download for anything that isn't a picture, video, audio or PDF
(infra/media-cdn/README.md).
Tested on a throwaway zone before the PR, and already set on the dev zone
(`vera-media-dev`); the purge makes files already cached pick up the new
headers.

**Verify:** a photo in a recent message still shows in the app, and its
URL serves `content-security-policy: sandbox; default-src 'none'` and no
`content-disposition`:

```sh
curl -sI https://media.vera.chat/<path of a recent photo> | grep -i 'content-\|nosniff'
```

A PDF attachment's URL answers with no `content-disposition` and no
`content-security-policy`, and opens in a browser. Any other file (a
`.txt`, say) answers with `content-disposition: attachment`.
