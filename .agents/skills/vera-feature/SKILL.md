---
name: vera-feature
description: The end-to-end workflow for building a Vera feature or fix in a T3 Code worktree, from choosing a backend through simulator verification, PR evidence, and waiting for Shawn's approval to merge. Use at the start of any feature, bug fix, or UI change in this repo, and whenever you need an isolated Convex backend, screenshots or videos for a PR, or are about to open or merge a PR. Simulator and emulator use also requires the vera-simulator skill.
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
the "before" screenshots now, before you edit anything. Then `down` it while
you build; `up` again when you're ready to verify.

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
`apps/mobile/.env.local` so the app talks to it. A simulator started
before isolating needs `scripts/sim.sh up` again so Metro picks up the new
domain. Accounts and data there
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

**Load the `vera-simulator` skill first and follow its rules.** Every
worktree shares Shawn's Mac, so devices start only through `scripts/sim.sh`
and its queue, and `up` may make you wait your turn.

Exercise the actual change: the happy path, the empty and loading states,
errors you can trigger, and dark mode if colors changed. Check Android too
whenever a change touches layout, navigation, platform files
(`.ios.tsx`/`.android.tsx`), or native config, and put Android screenshots
in the PR next to iOS ones.

## 4b. Put it on Shawn's phone

The simulator is your check. Shawn checks on his phone, in Vera Dev (the dev
variant, `chat.vera.app.dev`, amber icon; the TestFlight app stays beside
it). Do this when he asks to try a change, and offer it whenever a change is
something he should feel, not just see (gestures, keyboard, haptics,
notifications, passkeys, performance on a device):

```sh
scripts/phone.sh up             # iPhone; --android for his Android phone
scripts/phone.sh link           # the links and QR codes again
scripts/phone.sh down           # when he's done
```

- `up` reuses the dev client for this worktree's native fingerprint, or
  builds one (about 15 minutes, once per fingerprint, shared by every
  worktree) when native code changed. Then it starts the worktree's Metro
  (the same one the simulators use) and prints:
  - an **install** link, which Shawn needs only when `up` built a new dev
    client, or when an internal build or an older dev client is in the Vera
    Dev slot;
  - an **open** link (`vera-dev://expo-development-client/?url=...`) that
    points Vera Dev at this worktree's Metro over the Mac's Wi-Fi (the
    phone must be on the same network).
- Send Shawn the open link with its QR code embedded
  (`![open](/abs/path/.cache/sim/phone-ios-open.png)`, from `up`'s output),
  plus the install link and its QR code when he needs it. Say plainly
  whether he has to install something.
- JavaScript edits then hot-reload on his phone. Re-run `up` after native
  changes, `app.config.ts`, or `.env.local`.
- Never make an internal build for this. Those are only for when Shawn
  asks for one by name, or to check update or channel behavior, which a
  dev client can't show.
- With an isolated backend, Vera Dev talks to this worktree's domain, which
  has no accounts. Tell Shawn to sign in with
  `vera-dev:///dev-sign-in?username=<name>` (or make a QR code of it), and
  that the account is a throwaway.
- `down` before you report, unless Shawn is still trying it; it leaves
  Metro to the simulators if one is up.

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
- Update, channel, or release behavior can't be seen in the simulator or a
  dev client: neither has a channel or update ID. Say so in the PR and give
  Shawn the steps to check it on an internal build.
- Motion, gestures, and transitions: a short video (5–15 s).
- Backend-only changes: show the behavior through the app if it's visible
  there. Otherwise paste the `npx convex run` output.
- Never commit evidence. `.cache/` is gitignored.

When you have the evidence, shut the devices down (`scripts/sim.sh down`,
plus `--android` if you used it; see the `vera-simulator` skill). Never
leave one running while you wait for CI or for Shawn.

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
tested, the backend used, whether native code changed, and extra release
steps.

**Extra release steps.** If the next release has to do anything for this
change beyond `pnpm release` (deploy something outside Convex such as
`infra/`, set up a console or account, set environment variables, deploy in
a particular order, check something after shipping), add it to
`docs/next-release.md` in this PR: what, when, the commands, and how to
verify it. Then fill the template's "Extra release steps" line with what you
added, or `none`. Another agent runs the release and only learns about these
steps from that file; the "Release steps" CI check fails without the line.
Note the steps when you tell Shawn the PR is ready. Link it to the
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

- **Simulator problems:** see the `vera-simulator` skill's troubleshooting.
- **`signin` fails:** the backend must have `DEV_TOOLS=true` (both the shared
  dev PDS and isolated ones do). Check `scripts/backend.sh status`.
- **Discovery errors after `isolate`:** DNS can take a minute. Wait,
  `scripts/sim.sh relaunch`, and try again.
