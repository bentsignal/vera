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
  which queues them so many worktrees can share the Mac. Shut it down (`scripts/sim.sh down`) as soon as
  you have your evidence, before reporting; never leave simulators running.
- UI changes need screenshots (before and after where something changed);
  motion and gestures need a video. Upload with `scripts/evidence.sh` and put
  them in the PR description. Never commit PR assets.
- Keep each pull request to one coherent change, with a description covering
  the summary, the evidence, and the validation that was run.
- Open the PR, review your own diff, wait for CI to pass, then tell Shawn it
  is ready and **stop**. Merge only after Shawn approves that PR in the
  thread ("merge it", "ship it", "approved"), with a merge commit, deleting
  the branch. Approval of one PR is not approval of another.
- Never commit directly to `main`. Do not leave work uncommitted between
  sessions; push it and note its state in the PR.

## Releases

Merging does not release anything. When Shawn asks for a release, follow the
`vera-release` skill ([docs/releasing.md](docs/releasing.md) explains the
model): list what changed since the last release with a test plan, get a
test build or update onto his phone, and ship only after he approves.
Over-the-air updates are the default; a store build happens only when
native code changed or Apple requires one.

## Phone builds

Shawn's phone has two Vera apps side by side: **Vera** (TestFlight or the
App Store, production) and **Vera Dev** (`chat.vera.app.dev`, amber icon,
dev PDS). Every development binary is Vera Dev; only store builds are Vera.
See [apps/mobile/README.md](apps/mobile/README.md#vera-dev).

- **Day to day, Vera Dev is the dev client.** To let Shawn try a change on
  his phone, run `scripts/phone.sh up` (`--android` for his Android phone)
  in your worktree. It serves the worktree's Metro over the tailnet and
  prints an open link and a QR code: send both, with the QR PNG embedded.
  JavaScript changes then hot-reload on his phone with no build.
- **Native builds only when native code changed.** `phone.sh up` builds a
  new dev client (about 15 minutes) only when the worktree's native
  fingerprint has none yet, and prints its install link. Tell Shawn when he
  has to install one; otherwise he only opens the link.
- **Releases are tested in the dev client too**, serving `main` (the
  `vera-release` skill), so fixes reach his phone without a build. The real
  app gets tested in TestFlight.
- When Shawn asks for a "build on his phone" or a "development build",
  that means `scripts/phone.sh up`, not an internal build. Make an internal
  build (`pnpm release build internal`) only when he asks for one by name,
  or to check update or channel behavior, which a dev client can't show.
  It replaces the dev client in the Vera Dev slot; he reinstalls it from
  `scripts/phone.sh link`.
- `scripts/phone.sh down` when he's done with it, like the simulators.

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
code ("📱 Native Change"), since those need a store build to ship.

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
