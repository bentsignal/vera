# AGENTS.md

## Repository summary

Vera is a decentralized, easily self-hostable messaging platform built on
decentralized Convex. The first release is a mobile app (`apps/mobile`) backed
by Vera's own PDS (`services/backend`). Product and infrastructure decisions
are in [docs/mobile-launch.md](docs/mobile-launch.md); the framework design is
in [docs/architecture.md](docs/architecture.md) and
[docs/versioning.md](docs/versioning.md). Read those before asking design or
infrastructure questions; treat recorded decisions as settled.

## Project knowledge

Record decisions, plans, and durable context as Markdown in this repository
(`docs/`, package READMEs, or `.plans/`). Do not use external memory or task
CLIs (such as UAV) or Claude Code auto memory for this project.

## Computer use

For anything that needs a browser, dashboard, or GUI (for example the Convex,
Vercel, or bunny.net dashboards), use the Codex CLI with the GPT 6.1 Sol model,
headless where possible, instead of driving the screen yourself:
`codex exec -m gpt-6.1-sol -s danger-full-access "<task>" < /dev/null`
(run it from the repo, since Codex refuses untrusted directories, and close
stdin or it waits for input). Prefer each
service's CLI or API first. Never open repeated browser tabs or login pages in
the background; tell Shawn before anything opens on his machine. Shawn has
authorized accepting service terms (Firebase, Google Cloud, and similar) for
Vera's own accounts; say so in the Codex prompt, or Codex stops at them.

## Feature workflow

Shawn starts each feature or fix in its own T3 Code worktree and thread
(`t3.json` runs `scripts/worktree-setup.sh` on creation). Follow the
`vera-feature` skill. In short:

- Work only in the worktree and branch you were given. T3 names the branch;
  do not rename it.
- Changes to Convex functions or data get an isolated backend
  (`scripts/backend.sh isolate`). App-only changes use the shared dev PDS.
- Verify in this worktree's own simulator (`scripts/sim.sh`), never another
  worktree's or a shared one. Load the `vera-simulator` skill before any
  simulator or emulator use: devices start only through `scripts/sim.sh`,
  which queues them so many worktrees can share the Mac: up to three run
  at once, and a boot never overlaps a performance measurement. Open a device in
  T3's Device panel (`device_open`) at most once, and close it
  (`device_close`) before `scripts/sim.sh down`. Shut the device down as
  soon as you have your evidence, and always before you end your turn;
  never leave simulators running. A Stop hook sends you back if one is
  still up, and the queue deletes devices left idle for 30 minutes.
- UI changes need screenshots (before and after where something changed);
  motion and gestures need a video. Upload with `scripts/evidence.sh` and put
  them in the PR description. Never commit PR assets.
- Keep each pull request to one coherent change, with a description covering
  the summary, the evidence, and the validation that was run.
- A fix for a GitHub issue says `Fixes #<issue>` in its PR description (one
  line per issue) and targets `main`. That link is how Vera Support tells
  the person who reported it that a fix is in progress, merged, and live.
- Open the PR, review your own diff, wait for CI to pass, start the dev
  server (`scripts/phone.sh up`), then tell Shawn it is ready to test and
  **stop**. Shawn tests every change on his phone in its worktree before it
  merges, and you refine it on the branch until he's happy; the release
  doesn't re-test each change. The dev server stays up through the rounds
  of feedback and comes down when the PR merges or Shawn drops the work.
- Merge only after Shawn approves that PR in the thread ("merge it", "ship
  it", "approved"), following the `merge` skill: a merge commit,
  deleting the branch, then the dev server and devices down and the
  thread settled. Approval of one PR is not approval of another.
- After merging a PR that changed the backend (Convex functions, schema, or
  a plugin's server code; anything that got an isolated backend), push
  main's backend to the shared dev deployment right away
  (`pnpm release backend dev`, from `origin/main` after
  `scripts/backend.sh teardown`). Otherwise main's app and every worktree on
  `dev.vera.chat` run against an older backend until the next release.
- Never commit directly to `main`. Do not leave work uncommitted between
  sessions; push it and note its state in the PR.

## Releases

Merging does not release anything (only the shared dev backend follows
main, as above). When Shawn asks for a release, follow the
`vera-release` skill ([docs/releasing.md](docs/releasing.md) explains the
model): list what changed since the last release, and what to test where
those changes overlap (each one was already tested on its own before it
merged), run those tests yourself first in the iOS simulator and Android
emulator, get main onto his phone for what only he can check, and ship
only after he approves.
Over-the-air updates are the default; a store build happens only when
native code changed or Apple requires one.

**Extra release steps go in [docs/next-release.md](docs/next-release.md),
in the PR that needs them.** Some changes need more from a release than
`pnpm release` does: a deploy outside Convex (such as `infra/`), console or
account setup, environment variables, an order to do things in, or a check
after shipping. List each one there (what, when, the commands, and how to
verify it) in that same PR, and say so on the PR's "Extra release steps"
line. Another agent runs releases and only knows what that file says; CI
fails a PR without the line, and production builds and updates stop until
the steps are done.

## Phone builds

Shawn's phone has two Vera apps side by side: **Vera** (TestFlight or the
App Store, production) and **Vera Dev** (`chat.vera.app.dev`, amber icon,
dev PDS). Every development binary is Vera Dev; only store builds are Vera.
See [apps/mobile/README.md](apps/mobile/README.md#vera-dev).

- **Day to day, Vera Dev is main's dev client.** When your worktree's work
  is ready to test, run `scripts/phone.sh up` (`--android` for his Android
  phone) in it. One Metro serves the Mac's Wi-Fi address and, through a
  Tailscale proxy, his tailnet for when he's away from home. It prints a
  block to send him as it is, first in your message, every time: the two
  **open links** as a Markdown list (one tap on his iPhone opens Vera Dev
  on this worktree's server, at home or over Tailscale), then the home and
  Tailscale server addresses, each in its own code block so he can copy it
  in one tap. **Keep it exactly as printed**: the links as list items in
  `[label](url)` form, never in backticks, never bare, never the
  `vera-dev://` URL the page opens (his chat only makes http and https
  links tappable), and each address in its own fenced block. On Android
  he pastes an address into Vera Dev, because the open links crash it
  there (an Expo bug, see apps/mobile/README.md), so the block is the same
  for both phones; send it once. Don't send QR codes unless he asks.
  JavaScript changes then hot-reload on his phone with no build.
- **Native builds only when native code changed.** `phone.sh up` compares
  the worktree's native fingerprint with main's. A worktree that changed
  native code gets its own dev client (built once, about 15 minutes, and
  cached); he installs it from the install link, and when he's done,
  `phone.sh down` prints main's install link to put main's dev client back
  (`phone.sh main` any time). Tell Shawn when he has to install something,
  with the install link `phone.sh` prints (a list item too, labeled by
  phone); otherwise he only taps the open link. `phone.sh list` shows every
  cached dev client.
- **Releases are tested in the dev client too**, serving `main` (the
  `vera-release` skill), so fixes reach his phone without a build. The real
  app gets tested in TestFlight.
- When Shawn asks for a "build on his phone" or a "development build",
  that means `scripts/phone.sh up`, not an internal build. Make an internal
  build (`pnpm release build internal`) only when he asks for one by name,
  or to check update or channel behavior, which a dev client can't show.
  It replaces the dev client in the Vera Dev slot; he reinstalls main's
  from `scripts/phone.sh main`.
- Keep it up until the PR merges or Shawn drops the work, then
  `scripts/phone.sh down`. A server the phone hasn't loaded from in 24
  hours stops on its own (any worktree's `phone.sh up`, `sim.sh up`, or
  an agent's turn ending checks); `phone.sh up` brings it back.

## Required validation after changes

At the end of every run, run these in order:

1. `pnpm run lint`
2. `pnpm run typecheck`
3. `pnpm run test`
4. `pnpm run react-doctor --base origin/main` when the app changed (use
   the PR's base branch if it isn't `main`)

If all succeed, run `pnpm run format:fix`, then summarize the changes.

Lint enforces the React rules: the React Compiler handles memoization (no
`useMemo`, `useCallback`, or `memo`); server data goes through TanStack Query
(`pdsQuery`/`pdsMutation`), never fetched in an effect; and `useEffect` is
banned except with an `eslint-disable-next-line` comment saying why nothing
else works. CI also exports the iOS bundle and labels PRs that change native
code ("📱 Native Change"), since those need a store build to ship, and PRs
that raise the backend's breaking version ("💥 Breaking Backend"), since
those must ship with `--with-backend` (docs/releasing.md → Breaking backend
changes). Every PR says "Breaking backend change: no" or "yes" in its
release notes, and CI checks it against the file.

Two more rules, also enforced by lint:

- **User actions respond instantly.** A tap shows its result right away,
  never after a server round trip. Give the mutation an `optimisticUpdate`
  (`pdsMutation`) that changes the query results it affects, then close the
  sheet or navigate immediately. When the app opens something new, it makes
  the ID itself (`createdId`, `directConversationId`) and passes it along.
  Don't `await mutateAsync` before responding or disable a control while
  `isPending`. Report a failure with `.catch(() => Alert.alert(...))`; the
  update rolls back on its own. Use a ref, not `isPending`, to stop a double
  submit. The only exception is a result only the server can produce (an
  invite link's code); say so in a comment.
- **Search is debounced and never flickers.** Every search goes through
  `useSearchText` and `useSearchQuery`
  (`apps/mobile/src/features/search/use-search-query.ts`): the query waits
  for typing to pause, and the previous results stay up until the next ones
  arrive.

**No explanation text under self-explanatory UI.** Don't add footers,
captions, or hint text that explain an option, button, or field whose
label already says what it does. Add one only when Shawn asks for it.

## Decentralized Convex release invariant

All official `@decentralized-convex/*` packages and the wire protocol use one
exact ecosystem version. The source of truth is
`packages/decentralized-convex-core/src/release.ts`.

- Never version one decentralized Convex package independently.
- On every release, bump every `@decentralized-convex/*` `package.json` and
  every internal `workspace:<version>` dependency together.
- Every package owns a root `metadata.ts` and exports its
  `decentralizedConvexPackage` object from `./metadata`. Update that package's
  `lastChanged` only when the package actually changes.
- Never add a registry of package metadata to core. Release tooling discovers
  and validates the standardized package exports.
- Do not write a plugin protocol version manually; `definePluginProtocol`
  injects the ecosystem version.
- Run `pnpm run decentralized-convex:check`; it is also enforced by lint.
- Component data upgrades belong behind the PDS management surface. Do not ask
  application developers to run plugin-specific migration commands directly.
