## Summary

<!-- What changed and why, in a few sentences. Note any decisions you made on Shawn's behalf. -->

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
- Native change: <!-- no / yes (needs a store build; CI labels it "📱 Native Change") -->
- Convex deploy needed on release: <!-- no / yes -->
- Extra release steps: <!-- none, or what this PR adds to docs/next-release.md: anything the release must do beyond `pnpm release` (deploys outside Convex like infra/, console or account setup, env vars, ordering, checks after shipping). CI checks this line. -->
