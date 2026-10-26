# Performance checks

Jest runs the app's real components here with native modules mocked (see
`setup.ts`), to catch React work that makes the app janky before it reaches a
phone.

Their scripts (`pnpm test`, `pnpm typecheck`, `pnpm perf`) are in the repo
root's `package.json`, not the app's: the app's scripts are part of its native
fingerprint, so changing one there would call for a new dev client and store
build.

## In `pnpm test` (CI fails on these)

- **The React Compiler compiles everything** (`compiler.perf.ts`): every
  component and hook in `src/` compiles with the compiler Metro uses. When it
  can't compile a function, it leaves it as written, with nothing memoized,
  and says nothing. The lint rule runs an older compiler that misses most of
  these. The message shows the file, the line, and the reason; usually
  rewriting a line fixes it (see "Fixing a skipped function").

## `pnpm perf` (a report in CI)

[Reassure](https://github.com/callstack/reassure) measures how long React
takes to build a conversation's rows for the native list and to update them
(`message-list.perf-test.tsx`), and how many commits each takes, over ten
runs. The CI job `performance` measures the PR's base and then the PR with
the same tests and dependencies, and writes the comparison to the job's
summary. It doesn't fail the build: the
timings are React's work in Jest (in development mode, with nothing drawn), so
they vary from run to run and only show what changed relative to the base.

Locally, measure a baseline, change something, then measure again:

```sh
pnpm perf --baseline   # on the code to compare against
pnpm perf              # after the change; prints the comparison
```

Results are in `.reassure/` (ignored by git).

## Fixing a skipped function

What the compiler couldn't handle, and the fix:

- A computed key from a condition (`{ [incoming ? "right" : "left"]: x }`):
  write both objects out.
- A default parameter computed from another (`backToChat = then === undefined`):
  compute it in the body.
- Assigning a Reanimated shared value's `.value` inside a worklet: use
  `.set(...)` and `.get()`.
- A local variable with the same name as the function it's in.

## What these can't see: frames

Everything above measures React's work on the JavaScript thread. A
stuttering animation is usually the UI thread: an animation that changes
layout (a height, a margin) makes the whole screen lay out again on every
frame, and in a list that runs at 30fps. Jest draws nothing, so no test here
sees it. Two checks cover it:

- **Lint (`vera/no-layout-animation`, in CI):** fails on the ways to animate
  layout: a layout property in a Reanimated animated style or `Keyframe`, a
  CSS transition of one (or of every property, when there's no
  `transitionProperty`), or a CSS animation of one. Move things with
  `transform` and fade with `opacity`. When layout has to change, change it
  once and draw what moved back where it was with a transform that eases to
  zero.
- **Frames on a device (`scripts/sim.sh frames start` and `stop`):** records
  every frame the UI thread draws in this worktree's simulator or emulator,
  and reports the slow ones (over 1.5 refreshes). Measure any change to what
  moves before and after, on iOS and Android; the `vera-feature` skill asks
  for both reports in the PR.

[Flashlight](https://github.com/bamlab/flashlight) measures FPS and CPU on an
Android device. It doesn't run in CI here: it needs an Android emulator and a
release build on every run (well over the rest of CI's time on free runners),
and an emulator on a shared CI machine gives numbers too noisy to compare.
