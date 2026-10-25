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

## Native list: production default and persisted opt-out

The October 25 private-phone feedback requests native lists on by default,
with Settings → Experimental → Native Message List visible in production.
Before distributing that change, check that an existing explicit off choice
remains off after update/relaunch and that switching off uses the RN fallback.
Older binaries without compatible native support must continue using RN even
when the unchosen preference defaults on. About/Testing is no longer the switch
location. This check does not authorize a build or public distribution.

## Native message list: voluntary store updates and old-client continuity

Shawn approved the tested native list on October 25 and explicitly requires
installed clients to keep working until users choose to update. This policy
supersedes the earlier mandatory old-runtime prelude and deny-list activation
sequence. The release is native-only. Data-pass PRs #267–274, #276, #278–283 remain
open for a separate test/release; unrelated contacts/privacy PR #155 stays open.

### Required for this release

- Keep services/backend/outdated-runtimes.ts OUTDATED_RUNTIMES empty for both
  platforms. Do not list any old runtime, activate StoreUpdateCover, raise
  BREAKING_VERSION, or publish an old-runtime gate prelude for this release.
- Preserve current main's production APIs while merging the tested native
  integration. The native changes add a public release.outdatedRuntimes query
  and development-only fixtures; they remove no existing production operation
  or argument. The query may be deployed with empty lists. Missing-query errors
  are also treated as empty, so an older PDS does not block the app.
- Verify production release.breakingVersion remains 3 and any deployed
  release.outdatedRuntimes returns { android: [], ios: [] }. Until that additive
  query is deployed, its absence is the expected fail-open state, not a reason
  to deploy or enable the gate early.
- New native binaries need store builds. The installed iOS build 9 runtime
  f54bfcd2eab4e8cc9688d3e124cb3bad26f8b845 and Android build 6 runtime
  46edd03177eed9f46c4a9a1cb1e32607cf2248bd continue running their existing
  React Native list and compatible production backend. They cannot load the
  new native runtime's JavaScript over the air. Do not send them a new native
  bundle under an old runtime.
- Native lists default on in compatible new binaries, with the persisted
  Settings → Experimental → Native Message List opt-out. Explicit off and
  older-binary RN fallback stay intact. No later activation OTA or tester-only
  switch is required. The previous section records the validation of that
  behavior.

Production's latest release at this audit is
mobile/ota/production/20261025T010504 and backend/deploy/20261025T010443,
both from 6a699907. The live breaking version is 3. The outdated-runtimes query
is not deployed there. Keep these compatibility facts current before deploying;
none of this checklist authorizes a production mutation on its own.

### Optional future gate prelude, deferred

The gate implementation remains available but off. Backporting its JavaScript
to an old runtime and later populating a deny list would be a separate policy
change requiring explicit approval. Neither is a prerequisite for this voluntary
store release. Current OTA tooling targets only the latest production binary's
runtime, so any future old-runtime backport needs its own source/runtime review.
Normal TestFlight expiration and users' TestFlight/Play automatic-update
settings remain platform behavior; Vera adds no forced-update requirement.

The Galaxy A16 private-production camera no-crash result and Shawn's explicit
waiver of rounded-preview cosmetics are recorded in
[the release scope](../.plans/native-list-release-20261025.md). That cosmetic
follow-up is deferred and is not a blocker for this release.
