## Summary

<!-- What changed and why, in a few sentences. Note any decisions you made on Shawn's behalf. -->

<!-- Fixing a GitHub issue? Add "Fixes #<issue>" (one line per issue). Vera follows that link to tell the reporter about the fix. -->

## Evidence

<!-- Screenshots (before/after for UI changes) and videos for motion, from scripts/evidence.sh. Never commit them. -->

## Testing

<!-- What you exercised in the simulator, and the checks you ran. -->

- [ ] `pnpm run lint`
- [ ] `pnpm run typecheck`
- [ ] `pnpm run test`
- [ ] `pnpm run react-doctor --base origin/main` (app changes)

## Release notes

- Backend: <!-- shared dev PDS, or isolated dev/<branch> -->
- Native change: <!-- no / yes, compatible: native code changed, but binaries without it still run this JavaScript (any new native feature is optional and checked for), so updates keep reaching them and it ships in the next store build / yes, new runtime: this JavaScript needs native code older binaries lack, so this raises RUNTIME_VERSION in apps/mobile/app.config.ts and they stop getting updates until they install a store build. See docs/releasing.md → Runtime versions. CI labels native changes "📱 Native Change" and new runtimes "⛔ New Runtime". -->
- Convex deploy needed on release: <!-- no / yes -->
- Breaking backend change: <!-- no / yes: this raises BREAKING_VERSION in services/backend/breaking-version.ts, because the backend change breaks the app version before it (a removed or renamed function, a result old apps can't read). Open older apps then update themselves the moment the backend deploys; see docs/releasing.md → Breaking backend changes. CI checks this line against the file and labels the PR "💥 Breaking Backend". -->
- Extra release steps: <!-- none, or what this PR adds to docs/next-release.md: anything the release must do beyond `pnpm release` (deploys outside Convex like infra/, console or account setup, env vars, ordering, checks after shipping). CI checks this line. -->
