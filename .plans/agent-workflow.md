# Agent workflow and releases (2026-10-03)

Shawn's direction after the first TestFlight build: stop using one giant
thread. Each feature or fix gets its own T3 Code worktree and agent; the
agent builds it, proves it in a simulator, attaches evidence to a PR, and
waits. Shawn reviews and says when to merge. Releases are deliberate, not
on every merge, and prefer Expo over-the-air updates over store builds.

## Feature flow (one worktree, one agent, one PR)

1. T3 Code creates the worktree; `t3.json` runs `scripts/worktree-setup.sh`
   (install, copy the shared dev backend's `.env.local`).
2. The agent decides the backend:
   - UI or app-only work uses the shared dev PDS (`dev.vera.chat`).
   - Anything that changes Convex code or data shape gets its own Convex dev
     deployment (`scripts/backend.sh isolate`): a named `dev/<branch>`
     deployment that expires on its own, with its own account domain, and
     the app pointed at it through `EXPO_PUBLIC_VERA_PDS_URL`.
3. Builds the change, runs focused checks.
4. Verifies in its own simulator (`scripts/sim.sh`): one simulator and one
   Metro port per worktree, a cached dev client reused until native code
   changes, dev sign-in and navigation by deep link.
5. Captures evidence (screenshots; video for motion) and uploads it with
   `scripts/evidence.sh` (bunny.net zone `vera-evidence`, not committed).
6. Opens the PR with the evidence, then stops and reports. It merges only
   when Shawn says so.

## Checks on every PR

Lint (strict: React Compiler, no `useMemo`/`useCallback`/`memo`, no
`useEffect` without a justified disable, TanStack Query for data),
typecheck, tests, format, React Doctor (new issues only), an iOS JS bundle
export, and a native-fingerprint check that labels PRs that change native
code.

## Releases

- Nothing ships on merge. Shawn asks for a release; the release agent
  (`vera-release` skill) lists what changed since the last release and what
  to test, and gets a build or update onto his phone.
- Over-the-air first. `expo-updates` with the fingerprint runtime version:
  if no native change since the binary in people's hands, ship an EAS
  Update. Only a native change (or an Apple requirement) means a new store
  build.
- Store builds come from release Xcode, go to TestFlight (Team, then
  Friends after beta review), and to the App Store only when Shawn says so.

## Proving it

Before calling this done, sub-agents run the flow for real from fresh
worktrees: a UI-only change, a backend change on an isolated deployment,
and a release request. Fix whatever they stumble on.
