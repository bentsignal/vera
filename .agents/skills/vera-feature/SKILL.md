---
name: vera-feature
description: The end-to-end workflow for building a Vera feature or fix in a T3 Code worktree, from choosing a backend through simulator verification, PR evidence, Shawn's test on his phone, and his approval to merge. Use at the start of any feature, bug fix, or UI change in this repo, and whenever you need an isolated Convex backend, screenshots or videos for a PR, or are about to open or merge a PR. Simulator and emulator use also requires the vera-simulator skill.
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

**Fixing a GitHub issue.** Read it first (`gh issue view <n>`). Issues
labeled "user report" were filed by Vera Support for a real person, who
gets messages as the fix moves along, all driven by the PR's link to the
issue. So the PR description must say `Fixes #<n>`, one line per issue
(`Closes` and `Resolves` work too; a bare `#<n>` doesn't link). GitHub only
links PRs that target `main`, so a stacked fix doesn't link until it's
retargeted. Assigning yourself the issue (`gh issue edit <n> --add-assignee
@me`) tells the reporter someone picked it up. Its screenshots are
described in words, never attached; reproduce from the steps.

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

Every backend change has to keep working with the app version before it,
which open apps keep running until their update lands. If one can't (a
removed or renamed function, a result old apps can't read), raise
`BREAKING_VERSION` in `services/backend/breaking-version.ts` by one in the
same PR: open older apps then update themselves the moment the backend
deploys (`docs/releasing.md` → Breaking backend changes). Say "Breaking
backend change: yes" in the PR's release notes, with why it can't stay
compatible; every other PR says "no". CI fails a PR whose line doesn't
match the file, and labels a raise "💥 Breaking Backend".

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

**Measure anything that moves.** Smooth animation is not optional, and
neither lint nor Jest can see frames. For any change to an animation, a
transition, or what moves when something changes (a message arriving, a
reaction, a row growing, a list scrolling), record the UI thread's frames
around the interaction on iOS and Android:

```sh
scripts/sim.sh frames start
# ...do the interaction, a few times...
scripts/sim.sh frames stop   # {"frames":…,"hz":60,"slow":0,"dropped":0,"worst":[]}
```

`frames start` waits until no device on the Mac is booting, and no device
boots until your `frames stop`, so stop as soon as you have the
interaction. `frames stop` ends with a `mac:` line: if it says a device
booted during the recording, or the Mac was busy and the report shows slow
frames, measure again.

`slow` must be 0 while things move (one slow frame as something mounts,
before anything moves, is the most to accept). Measure before and after
your change, and put both reports in the PR. A slow animation usually
animates layout (the `vera/no-layout-animation` lint rule catches the
common ways); move things with `transform` and `opacity` instead.

## 4b. Shawn tests it on his phone

The simulator is your check. Every change also gets Shawn's own test on his
phone, in its worktree, before it merges: the release no longer re-tests
each change, so this is where a change gets right. He tests in Vera Dev (the
dev variant, `chat.vera.app.dev`, amber icon; the TestFlight app stays
beside it).

**Serve it as soon as the work is ready to test** (step 7), and keep it up
through every round of feedback. It comes down when the PR merges (the
`merge` skill) or Shawn drops the work. A server the phone hasn't
loaded from in 24 hours stops on its own; `phone.sh up` brings it back,
so run it again at the start of each feedback round and when Shawn says
the link doesn't load.

```sh
scripts/phone.sh up             # iPhone; --android for his Android phone
scripts/phone.sh link           # the links again
scripts/phone.sh down           # when the PR merges or the work is dropped
scripts/phone.sh main           # main's dev client, to put back on his phone
scripts/phone.sh list           # every cached dev client, marking main's
```

- Before serving, merge `origin/main` into the branch (fix conflicts,
  re-run the validation, push), so he tests what will merge.
- Vera Dev on his phone is normally **main's dev client**, which runs every
  worktree that hasn't changed native code. `up` compares this worktree's
  native fingerprint with main's and says which case it is:
  - **Main's dev client:** he only taps the open link.
  - **This worktree's own dev client** (native code changed): `up` builds
    it if needed (about 15 minutes, cached for every worktree) and he
    installs it first. Afterwards he needs main's back (see `down`).
  - **A new dev client for main** (main's native code changed since he last
    installed one): he installs it once; it serves every worktree after.
- `up` starts the worktree's Metro (the same one the simulators use). One
  Metro serves both the Mac's Wi-Fi, for when Shawn is home, and his
  tailnet, for when he's out: `up` puts `tailscale serve` (HTTPS, tailnet
  only) in front of it, so there's no second server. An open link is an
  https page that opens Vera Dev on this worktree's server in one tap.
  `up` prints what to send him between the `----` lines:

  ````
  ---- send Shawn this as it is ----
  - [Open in Vera Dev on iPhone](https://vera-evidence.b-cdn.net/dev-client/open-cfde0a5324fd.html?url=http%3A%2F%2F10.0.0.124%3A8651)
  - [Open in Vera Dev on iPhone over Tailscale](https://vera-evidence.b-cdn.net/dev-client/open-cfde0a5324fd.html?url=https%3A%2F%2Fairshawn.tailf45482.ts.net%3A8651)

  Home Wi-Fi:

  ```text
  http://10.0.0.124:8651
  ```

  Tailscale:

  ```text
  https://airshawn.tailf45482.ts.net:8651
  ```
  ---- end ----
  add when he has to install first:
  - [Install Vera Dev on iPhone](https://vera-evidence.b-cdn.net/dev-client/ios/…/index.html)
  ````

  Put it first in your message, every time, copied exactly as printed
  (without the `----` lines). He's usually home; the Tailscale link and
  address are for when he isn't, and need Tailscale on on his phone. Each
  part has to keep its form, or he's back to copying and pasting by hand:
  - **The open links are a Markdown list of clickable links.** One `- `
    item per line (lines without it run together into one paragraph),
    each `[label](url)`. Never in backticks or a code block, never the
    bare URL, and never the `vera-dev://` URL: his chat only makes http
    and https links tappable, and the page opens `vera-dev://` for him.
    Don't edit a URL; a space or line break inside the parentheses breaks
    it.
  - **Each server address is in its own fenced code block** (` ```text `),
    which T3 gives a copy button. Inline code has none.

  The open links are for his iPhone. On Android they crash Vera Dev for
  now (an Expo bug, see `apps/mobile/README.md`), so there he copies an
  address and pastes it into Vera Dev. That makes the block the same for
  both phones (`phone.sh --android up` prints it too); send it once. If
  Tailscale isn't running on the Mac, `up` prints no Tailscale link or
  address; say so. Add the install link (for the phone that needs it) only
  when he has to install, and say plainly whether he does. Don't send QR
  codes unless he asks.

- JavaScript edits hot-reload on his phone. Re-run `up` after native
  changes, `app.config.ts`, or `.env.local`.
- With an isolated backend, Vera Dev talks to this worktree's domain, which
  has no accounts. Give Shawn two throwaway accounts, one for his iPhone
  (`ios@<domain>`) and one for his Android phone (`android@<domain>`), so he
  can test on both without saving a passkey. `scripts/backend.sh status`
  prints both links (`<site>/dev/sign-in?username=ios`, a dev-only page on
  the backend). Always send both as clickable Markdown links, labeled with
  the account each creates:

  ```md
  - iPhone: [ios@my-branch.dev.vera.chat](https://<deployment>.convex.site/dev/sign-in?username=ios)
  - Android: [android@my-branch.dev.vera.chat](https://<deployment>.convex.site/dev/sign-in?username=android)
  ```

  He taps the one for the phone he's on. The page opens Vera Dev, which
  signs in (or adds the account if he's already signed in elsewhere). The
  page works in any browser; a bare `vera-dev://` link only works pasted
  into Safari.

- Leave it up while you work on his feedback. If this worktree has its own
  dev client, `down` at close-out prints main's install link: send it so
  he can put main's dev client back.
- Never make an internal build for this. Those are only for when Shawn
  asks for one by name, or to check update or channel behavior, which a
  dev client can't show.

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

When you have the evidence, close the devices in T3's Device panel
(`device_close`) and shut them down (`scripts/sim.sh down`, plus
`--android` if you used it; see the `vera-simulator` skill). Never leave
one running while you wait for CI or for Shawn, or past the end of your
turn.

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
tested, the backend used, whether native code changed, whether it's a
breaking backend change, and extra release steps. A fix for an issue says
`Fixes #<n>` (step 1).

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
label appears, say so: the next release then needs a store build. If the
"💥 Breaking Backend" label is on it, say so too: the release must ship it
with `--with-backend`, and open apps on older versions will show "Updating
Vera…" for a few seconds when it does.

Then start the dev server (step 4b) and tell Shawn it's ready to test:
the block `phone.sh up` prints first (the open links as a list of
clickable links, then each address in its own code block, step 4b), then (with an isolated backend) the iPhone and
Android sign-in links (step 4b), then the PR link, a two-line summary, what
to try on his phone (concrete steps for this change), whether he has to
install its own dev client, and anything he should look at closely. **Stop there.**
Don't merge.

## 8. Feedback and merge

- Feedback: make the changes on the same branch with the dev server still
  up (JavaScript hot-reloads on his phone; re-run `phone.sh up` after
  native changes, or if it stopped for being idle). `scripts/sim.sh up` again, refresh the evidence if the
  UI changed, `scripts/sim.sh down`, push, and report again. Expect a few
  rounds; refining the change here is cheaper than finding it in the
  release.
- Merge only when Shawn approves this PR in the thread ("merge it",
  "approved", "ship it"), normally after testing it on his phone. Then
  follow the `merge` skill: it merges, tears down an
  isolated backend, pushes main's backend to the shared dev deployment,
  stops the dev server and devices, and settles the thread. Merging does
  not release anything; releases are separate (the `vera-release` skill).
- If Shawn drops the work instead (closes the PR, abandons it, or replaces
  it with another thread), wind it down the same way without merging: the
  `merge` skill's steps 1 and 5, plus `scripts/backend.sh teardown`
  if the worktree has an isolated backend.

## Troubleshooting

- **Simulator problems:** see the `vera-simulator` skill's troubleshooting.
- **`signin` fails:** the backend must have `DEV_TOOLS=true` (both the shared
  dev PDS and isolated ones do). Check `scripts/backend.sh status`.
- **Discovery errors after `isolate`:** DNS can take a minute. Wait,
  `scripts/sim.sh relaunch`, and try again.
