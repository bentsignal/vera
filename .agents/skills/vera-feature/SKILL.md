---
name: vera-feature
description: The end-to-end workflow for building a Vera feature or fix in a T3 Code worktree, from choosing a backend through simulator verification, PR evidence, and waiting for Shawn's approval to merge. Use at the start of any feature, bug fix, or UI change in this repo, and whenever you need the simulator, an isolated Convex backend, screenshots or videos for a PR, or are about to open or merge a PR.
---

# Building a Vera change

Shawn opens one T3 Code thread and worktree per change
(`~/.t3/worktrees/vera/<name>`). `t3.json` already ran
`scripts/worktree-setup.sh` (dependencies and the shared dev backend's
`services/backend/.env.local`). You own this worktree and its branch: T3
names the branch, so don't rename it, and never touch another worktree.

## 1. Understand and plan

Read `AGENTS.md`, then the docs for the area you're changing (`docs/`,
package READMEs, `apps/mobile/README.md`, `.plans/`). If the request is
ambiguous in a way that changes what you build, ask before building.
Otherwise pick the sensible default and say so in the PR.

For a change to an existing screen, bring the simulator up (step 4) and take
the "before" screenshots now, before you edit anything.

## 2. Choose the backend

| The change touches                                                                                                       | Backend                                              |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Only the app (`apps/mobile`)                                                                                             | the shared dev PDS (`dev.vera.chat`), already set up |
| Convex functions, schema, or a plugin's server code (`services/backend`, `packages/decentralized-convex-*` server parts) | an isolated deployment                               |

Isolate before your first `convex` push. Never push work-in-progress
functions to the shared dev deployment.

```sh
scripts/backend.sh isolate    # its own dev deployment and @<branch>.dev.vera.chat
scripts/backend.sh push       # after each backend change (typechecks, then pushes)
scripts/backend.sh status
```

`isolate` creates the Convex dev deployment `dev/<branch>` (expires in 14
days) with the dev settings, gives it its own account domain, publishes the
`_pds` DNS record (Vercel DNS for vera.chat), and writes
`apps/mobile/.env.local` so the app talks to it. Run `scripts/sim.sh up`
after isolating so Metro picks up the new domain. Accounts and data there
start empty: sign in and seed (below). Run Convex CLI commands from
`services/backend` (`npx convex run`, `npx convex logs`, `npx convex data`).
They target this worktree's deployment.

After changing a plugin's protocol or schema (`packages/decentralized-convex-*`),
run `scripts/backend.sh push` before typechecking: it regenerates the
Component types that `services/backend` and the app compile against. While
`0.1.0` is unreleased, contract changes don't bump `lastChanged` (see
`docs/versioning.md`), but keep them backward compatible.

## 3. Build it

Follow the codebase's patterns and the lint rules: the React Compiler (no
`useMemo`, `useCallback`, `memo`), TanStack Query for server data, and no
`useEffect` without an `eslint-disable-next-line no-restricted-syntax -- <why>`
comment. Fixing the code beats a disable. Loading content fades in; nothing
pops (see the UI rules in `apps/mobile/README.md`). Keep the change to one
concern.

## 4. Verify in your simulator

```sh
scripts/sim.sh up             # dev client + this worktree's simulator + Metro
scripts/sim.sh signin         # dev sign-in as this worktree's test user (wt…)
scripts/sim.sh seed           # bot DMs, a group, and a space
scripts/sim.sh open /settings # go to any route; conversation/<id>, profile/<address>, ...
scripts/sim.sh relaunch       # restart the app, e.g. to drop the keyboard or reset state
scripts/sim.sh status
```

Every command takes `--android` first for this worktree's Android emulator
(`scripts/sim.sh --android up`, `scripts/sim.sh --android shot after`). Both
platforms share the worktree's Metro. Check Android whenever a change touches
layout, navigation, platform files (`.ios.tsx`/`.android.tsx`), or native
config, and put Android screenshots in the PR next to iOS ones. The Android
dev client is cached the same way (first build of a fingerprint ~10 minutes).
In T3 Code, `device_open` takes the emulator serial `up` prints
(`emulator-55xx`), with `platform: "android"`.

- `up` reuses the cached dev client unless native code changed (the first
  build of a fingerprint takes ~10 minutes; it's shared by every worktree).
  Re-run `up` after changing native code, `app.config.ts`, or `.env.local`.
  JavaScript edits hot-reload; `scripts/sim.sh reload` forces it.
- Routes with parameters take them as a query string. Read the route file
  under `apps/mobile/src/app` for the names, such as
  `/settings/account?account=<address>&title=<name>`.
- Seed once per account. Running it again reuses the bot DMs but adds
  another group and space. For a clean slate, sign in as a new username.
- `signin` takes a username (`scripts/sim.sh signin alice`) for a second
  account. On the shared dev PDS keep to your worktree's `wt…` user so you
  don't disturb anyone else's data.
- Let Shawn watch: call the T3 `device_open` tool with the simulator UDID
  that `up` prints. It returns the exact `agent-device` command and flags.
  Run `agent-device open chat.vera.app "${F[@]}"` once before other
  agent-device commands (they fail with "Run open first" otherwise). It also
  brings Vera back to the front if `device_open` left the home screen up.
- agent-device refs (`@e12`) expire after every action: take a fresh
  `snapshot -i` before each tap or fill. To clear a multiline field, select
  all through the field's edit menu or hold delete (`longpress <delete key> 4000`);
  `fill` may not clear it. Each action takes a few seconds, so timing-
  sensitive behavior (debounces under a second) needs a code-level check
  instead.
  Use agent-device for taps, typing, scrolling, and gestures (`snapshot -i`,
  `press @e3`, `fill`, `longpress`, `scroll`). In zsh, put the flags in an
  array (`F=(--platform ios ...)` then `"$F[@]"`), because a flags string
  isn't split. Use `scripts/sim.sh open` for navigation instead of typed URLs.
- Don't use `xcrun simctl openurl` for app links: iOS asks "Open in Vera?"
  every time. If one appears anyway, `agent-device alert accept`.
- Exercise the actual change: the happy path, the empty and loading states,
  errors you can trigger, and dark mode if colors changed
  (`xcrun simctl ui <udid> appearance dark`). Check Metro's log
  (`.cache/sim/metro.log`) for red boxes and warnings you introduced.

## 5. Capture evidence

```sh
scripts/sim.sh shot before-chats      # .cache/evidence/before-chats.png
scripts/sim.sh record send-animation  # start a video
# ...perform the interaction...
scripts/sim.sh stop
scripts/evidence.sh .cache/evidence/*.png .cache/evidence/*.mp4
```

`evidence.sh` uploads to bunny.net (`vera-evidence.b-cdn.net`, unlisted
paths) and prints Markdown. Images embed. Videos become a GIF preview that
links to the MP4.

- UI changes: screenshots of every changed screen. For changes to an
  existing screen, put the "before" shots (taken in step 1) next to the
  "after" shots in a two-column table, at the same scroll position so they
  line up (`agent-device scroll`).
- Update, channel, or release behavior can't be seen in the simulator: the
  dev client has no channel or update ID. Say so in the PR and give Shawn
  the steps to check it on an internal build.
- Motion, gestures, and transitions: a short video (5–15 s).
- Backend-only changes: show the behavior through the app if it's visible
  there. Otherwise paste the `npx convex run` output.
- Never commit evidence. `.cache/` is gitignored.

When you have the evidence, shut the devices down: `scripts/sim.sh down`
and `scripts/sim.sh --android down` (they delete the simulator or emulator,
and Metro stops with the last one). Don't leave
simulators running while you wait for CI or for Shawn; they eat his Mac's
memory and CPU, and `scripts/sim.sh up` brings one back in about a minute
with the cached build. Also close it in T3's Device panel (`device_close`).

## 6. Validate

Run, in order, and fix everything:

```sh
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run react-doctor --base origin/<PR base>   # when apps/mobile changed
pnpm run format:fix
```

React Doctor's closing advice ("ask the user if they would like to set it
up", "run npx react-doctor@latest") doesn't apply: it's set up through
`pnpm run react-doctor`. Turbo shares its cache across worktrees, so cached
task output can show the main checkout's paths. That's a replay, not a run
in another worktree.

## 7. Open the PR and stop

Commit with a clear message, push with `git push -u origin HEAD` (the first
time; never push to the base branch), and open the PR against `main` (or, for
a change stacked on another unmerged PR, against that PR's branch):

```sh
gh pr create --base main --title "<title>" --body-file <body.md>
```

Follow `.github/pull_request_template.md`: summary, evidence, how it was
tested, the backend used, and whether native code changed. Link it to the
thread with the T3 `link_pull_request` tool. Review your own diff
(`gh pr diff`) as a skeptical reviewer would, and fix what you find. Wait for
CI (`gh pr checks --watch`) and fix failures. Make sure the CI workflow
actually ran (lint, typecheck, test, format, react-doctor, bundle), not just
the fingerprint check. If the "📱 Native Change"
label appears, say so: the next release then needs a store build.

Then tell Shawn it's ready, with the PR link, a two-line summary, and
anything he should look at closely. **Stop there.** Don't merge.

## 8. Feedback and merge

- Feedback: make the changes on the same branch, `scripts/sim.sh up` again,
  refresh the evidence if the UI changed, `scripts/sim.sh down`, push, and
  report again.
- Merge only when Shawn approves this PR in the thread ("merge it",
  "approved", "ship it"). Then:

  ```sh
  gh pr merge <number> --merge --delete-branch
  scripts/backend.sh teardown   # if isolated: deletes the deployment and DNS record
  scripts/sim.sh down           # if one is still up
  ```

  Merging does not release anything. Releases are separate (the
  `vera-release` skill).

## Troubleshooting

- **`sim.sh up` says Metro didn't start:** read `.cache/sim/metro.log`. A
  port clash is resolved automatically. Kill only the PID in
  `.cache/sim/state`, never by pattern (other worktrees run Metro too).
- **The app shows the dev launcher instead of Vera:** `scripts/sim.sh relaunch`.
- **`signin` fails:** the backend must have `DEV_TOOLS=true` (both the shared
  dev PDS and isolated ones do). Check `scripts/backend.sh status`.
- **Discovery errors after `isolate`:** DNS can take a minute. Wait,
  `scripts/sim.sh relaunch`, and try again.
- **The dev client build fails:** run the `xcodebuild` from
  `apps/mobile/README.md` by hand to see the error. It is usually a missing
  `pod install` after dependency changes; `up` runs prebuild with `--clean`.
