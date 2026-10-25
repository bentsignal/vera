# Native-list release scope, October 25

## Approval and boundaries

Shawn approved the tested native work and Android target highlight at
23b26022df0d9bb3382f6a7b7fff9ac34867db3d, then requested Google Play internal
testing and TestFlight distribution. Parent owns GitHub merge/closure and
production release orchestration. Preparation stays in this existing integration
worktree, Sol only, without Claude, a new thread, or a new author.

Release NATIVE ONLY now. All15 data-pass PRs remain OPEN for an entirely
separate future combined test/release. Contacts/privacy PR #155 remains OPEN and
unrelated. No data-pass merge is authorized by native approval.

Shawn has signed out of the native isolated backend on BOTH phones, fulfilling
the merge skill's sign-out requirement. Do not ask again. Preserve Metro8492
until parent coordinates shutdown. phone.sh down can call main_client and
unexpectedly build a missing main Dev cache; inspect that cache before cleanup
and use safe existing shutdown functions if restoration cannot be served yet.
Never fabricate fingerprint/cache metadata or build an unnecessary Dev client.

## Camera result and deferred cosmetics

Shawn reports the Galaxy A16 private-production camera path DID NOT CRASH.
The rounded staged-preview cosmetic result did not fully pass. He explicitly
waived that cosmetic bug for this release and requested release now after his
testing. Record no-crash acceptance, not a full rounded-preview pass. The
unrounded camera preview remains a deferred follow-up, without an established
RAM cause and without a camera/dependency rewrite in this release. No further
phone approval or camera test is a release gate under this explicit waiver.

## Compatibility audit

Current origin/main is 6a699907b446c7bc0fda2b277b5070edf7c0c8e8. Latest production
OTA mobile/ota/production/20261025T010504 and backend deploy
backend/deploy/20261025T010443 both point there. Live production
release.breakingVersion returned 3; integration and production-tag source are
also 3. The live release.outdatedRuntimes query is absent, so no runtime deny
list is active. Integration's two OUTDATED_RUNTIMES lists are empty and its
client treats missing-query errors as empty.

Keep the lists EMPTY and the forced-update gate OFF. Do not raise the breaking
version or publish an old-runtime gate prelude for this release. Old iOS build 9
f54bfcd2… and Android build 6 46edd031… retain their existing RN list and compatible
backend until users update, subject to normal store/TestFlight platform rules.
A different native fingerprint cannot ship its JavaScript to those binaries.
The older mandatory prelude/activation instructions are superseded in
next-release.md; a future gate prelude is optional and deferred.

Native-side changes from common ancestor 5268ceac add only an empty
release.outdatedRuntimes query, DEV_TOOLS+identity-guarded devBusy/devMixed
fixtures, seed helpers, generated API entries and a dev-fixture package export.
There are no native-side package wire/protocol source changes, endpoint or
argument removals, or BREAKING_VERSION change. Ecosystem version stays 0.1.0.
The backend lock importer matches after normalizing the mobile RN patch peer
hash. Current main's newer profile, word-notification and assistant code was
already deployed; a two-dot diff from this formerly behind branch is not proof
of removals. Merge main rather than replacing it with the tested old tree.

## PR inventory and disposition

| PR | Exact head in tested 23b26022 | Agreed disposition, parent executes |
| --- | --- | --- |
| #284 | 23b26022 | Retarget main and merge the complete integration once after current checks/CI |
| #266 | 61c0961b, yes | Verify contained, then close as integrated if GitHub has not marked merged |
| #275 | 8359e4bd, yes | Same, Android source fully contained |
| #277 | 97ca1798, yes | Same, iOS source fully contained |
| #258 | b0aa39f5, NO | Close unmerged as superseded, do not import 92 prototype/performance files |
| #155 | a4d96186, no | Leave open, unrelated |

Base t3/native-message-list at 7a17bd63 is already an ancestor of the integration;
there is no separate open PR for it. Retargeting #284 to main avoids an extra
base-to-main implementation merge. Closing predecessor PRs must link #284 and
say contained versus superseded accurately, without claiming #258 was merged.

Data-pass inventory, all exact heads and unique patch IDs absent from native:

| PR | Untested native-combination scope |
| --- | --- |
| #267 | markRead cost and per-operation measurements |
| #268 | cheaper inbox reads |
| #269 | typing out of includes |
| #270 | badge count query |
| #271 | older/newer page prefetch |
| #272 | smaller live page |
| #273 | saved Home and first-open timing |
| #274 | included queries once |
| #276 | unread counts |
| #278 | unread booleans |
| #279 | badge rules |
| #280 | Activity grouping |
| #281 | per-row inbox queries |
| #282 | typing on row press |
| #283 | omit unused space query |

The native branch's devBusy fixture mentions the data-pass plan but contains
none of this product/server data-pass implementation. Do not infer combined
phone validation from that fixture or merge any of these 15 PRs for cleanup.

## Main integration and bounded checks

Authorized local merge e31b5648 combines current main into integration without
conflicts. Both auto-merged files were reviewed: Activity keeps main's name/
keyword headline plus native exact-target routing, and generated API retains
both agentModels and native dev helpers. Main's profile picture fix,
notification settings/protocols and assistant changes remain present. The
native module tree is identical to approved 23b26022; no product redesign.

Run required ordered lint, typecheck, test, React Doctor against the PR base,
then format. Existing tests cover main profile/word notifications and native
Activity routing. Compare before/after production fingerprints without building.
Any later release smoke is limited to main's Activity headline/target routing
and Settings notification/Experimental coexistence, not a full animation,
firehose or benchmark matrix. Shawn's release approval persists; do not invent
another phone-approval gate unless an actual new defect requires attention.

No GitHub PR merge/closure, backend deploy, OTA, store build, teardown or
server shutdown was performed during this preparation. Parent executes those
only after the prepared source and current CI are ready.

Production fingerprint comparison before/after the main merge is unchanged:
iOS 251eec9a9649c31d0eec62ca3696fc6e76ee8b26,
Android d6cd0d4b0106d90b8ca76a5aa5327d7432ff2bca. Both use the production home,
notification extension enabled, and no dotenv/profile override. This compares
source fingerprints only, without a build, deploy or store submission.

Ordered lint/typecheck/test/React Doctor/format pass after the main merge.
No native source changed and no native build or device was needed for this
preparation. CI must pass on the final documentation commit before parent
merges PR284.

Cleanup cache audit: pre-merge main6a699907 has cached Dev installers on both
platforms, but the soon-to-be-main native iOS fingerprint
7e7af22a7b365c70d626f1d1c7c112f5db3a6a7b has NO phone Dev cache. Android
fb703bdcb01aa364f82a9ecd7f0c236f5c7a2ee9 is cached. After merging, a plain iOS
phone.sh down could therefore trigger an unnecessary Dev build through
main_client. Parent must stop safely without that build, or explicitly defer
main Dev restoration. Existing files/cache fingerprints were not altered.
