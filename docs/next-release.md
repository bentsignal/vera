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

## Native message list: the store-update gate for older binaries

From the native message list (#284 into `t3/native-message-list`, then
main). The native list needs a store build. Binaries already installed
(iOS build 9, runtime `f54bfcd2…`; Android production, runtime
`46edd031…`) never get it over the air, and an OTA reaches a binary only
when their runtimes match (docs/releasing.md → Binaries, channels, and
runtimes). So the prompt that sends them to TestFlight or Play has to be in
JavaScript they already run. It must stay off until the new store build is
actually available on that platform, and never block anyone before then.

**How it works (built, off).** The backend serves
`release.outdatedRuntimes`, the list in
`services/backend/outdated-runtimes.ts`, which is empty now. Store builds
watch it from the home PDS (`WatchOutdatedRuntimes`); dev, internal and
preview builds don't subscribe. A production-channel binary whose own
`Updates.runtimeVersion` is listed for its platform shows "Update Vera"
with one button to TestFlight or Play (`StoreUpdateCover`). It doesn't
depend on the native-list switch. It's a deny list, so a newer store build
can't be trapped by someone forgetting to add its runtime. A PDS without
the query answers with an error, which lists nothing. Once a binary is
running the gate's JavaScript, turning the gate on for it is just a
backend deploy.

### Which installed binaries the gate can reach

An OTA reaches only binaries whose runtime matches, and
`pnpm release ota production` publishes only for the latest production
binary's runtime. From the release tags:

| Binary           | Runtime     | Last production OTA            | Gets the gate                      |
| ---------------- | ----------- | ------------------------------ | ---------------------------------- |
| iOS build 9      | `f54bfcd2…` | 2026-10-23 (`20261023T003538`) | yes, from the prelude OTA (step 1) |
| iOS build 8      | `b5f3142d…` | none                           | no                                 |
| iOS build 7      | `0efd5512…` | 2026-10-04                     | no                                 |
| Android build 6  | `46edd031…` | 2026-10-23                     | yes, from the prelude OTA          |
| Android build 5  | `c04064f3…` | none                           | no                                 |
| Android build 4  | `cd762f30…` | 2026-10-04                     | no                                 |
| Android, earlier | `9e1c4f51…` | 2026-10-04                     | no                                 |

**Rollout limit.** With current tooling, builds older than iOS 9 and
Android 6 can't receive the gate, so they can't be forced to update.
`pnpm release ota` publishes only for the latest production runtime. Their
last JavaScript also predates the breaking-version watcher (added
2026-10-16), so not even raising `BREAKING_VERSION` would prompt them.
They keep the React Native list and keep working as long as the backend
stays compatible with them. What reaches them:

- TestFlight tells testers about new builds, and testers who turned on
  automatic updates get them installed
  ([TestFlight](https://testflight.apple.com/): "you can turn on automatic
  updates to have the latest beta builds install automatically").
  Each TestFlight build also expires 90 days after upload, which ends
  builds 7 and 8 by early January.
- Play updates installed apps on its own schedule, under each user's
  auto-update setting.
- To force them anyway, each old runtime would need a backport OTA built
  from its own build commit plus the gate, which `pnpm release ota` can't
  do (latest runtime only, from a clean main). That's a tooling change,
  with per-runtime checks against today's backend. It isn't planned, but
  it's the way to reach them if it's ever needed.

Not used: Android Play in-app updates
([In-app updates](https://developer.android.com/guide/playcore/in-app-updates),
[Kotlin or Java](https://developer.android.com/guide/playcore/in-app-updates/kotlin-java)).
They need the Play app-update library in the binary, so they can't help
binaries already installed. The immediate flow installs only after the
user accepts it, and only for Play installs, not the private APK. iOS has
no silent install.

### Why the order matters

- Today main (5268ceac) has the production runtimes, and the last
  production OTA (`mobile/ota/production/20261023T003538`, from 5268ceac)
  reached iOS build 9 and Android build 6. So an OTA from main can reach
  them now.
- Once the native list merges into main, main's runtime changes (the
  preview builds' runtimes were iOS `6e60a1ac…` and Android `23784f5a…`).
  From then on `pnpm release ota production` publishes only for the new
  binaries, and the old ones get no more JavaScript.
- So the gate's JavaScript has to reach iOS build 9 and Android build 6 in
  a production OTA from main **before** the native list merges into
  main. The gate's files import nothing from the native list and no API a
  newer binary adds, so they can go to main on their own.

### Steps, in order

1. **Before the native list merges into main:** open a PR to main with
   only the gate: `services/backend/outdated-runtimes.ts`, `outdatedRuntimes`
   in `services/backend/convex/release.ts`,
   `apps/mobile/src/features/updates/{store-gate.ts,store-gate.test.ts,watch-outdated-runtimes.ts,store-update-cover.tsx,store-link.ts}` (main has none of them; `update-cover.tsx` there has its own `STORE_URL`, which `store-link.ts` replaced),
   and the `WatchOutdatedRuntimes`/`StoreUpdateCover` lines in
   `apps/mobile/src/app/_layout.tsx`. Check its fingerprint matches the
   production binaries (`pnpm release plan` says "ota" for both). After
   it merges, deploy and publish with the list empty:
   `pnpm release backend production`, then
   `pnpm release ota production "<notes>"`.
   Verify: the OTA output says `ios: publishing` and `android: publishing`
   against `f54bfcd2…` and `46edd031…`;
   `npx convex run --prod release:outdatedRuntimes` (from
   services/backend) returns `{ android: [], ios: [] }`; a TestFlight phone
   shows the new update ID in Settings → About and no prompt.
2. Merge the native list into main. Make the store builds:
   `pnpm release build production` (iOS, uploaded to TestFlight) and
   `pnpm release build production --android` (submitted to Play internal
   testing), then `pnpm release testflight <build> <notes.md>`. Wait until
   the iOS build is processed and available to the Team and Friends
   TestFlight groups, and the Android build is live in Play internal
   testing. Verify: install from TestFlight and Play on a test phone, and
   the native list shows (Testing in conversation info).
3. Only then, per platform as its build becomes available, add every
   runtime it replaces to `OUTDATED_RUNTIMES` in a PR: iOS
   `f54bfcd2eab4e8cc9688d3e124cb3bad26f8b845` (build 9), Android
   `46edd03177eed9f46c4a9a1cb1e32607cf2248bd` (build 6). The older
   runtimes in the table can be listed too; it's harmless, but they never
   read the list. Deploy it:
   `pnpm release backend production`. Never list the runtime of a build
   that's still current. Verify: on a phone still on iOS build 9 (or the
   old Android build), "Update Vera" covers the app with one button that
   opens TestFlight (or Play). After updating, the app opens normally on
   the native list. A phone on the new build never sees it.
4. Turn the native list on for everyone (`NATIVE_LIST.byDefault` in
   production, an OTA to the new runtime) after Shawn approves.

If a store build is pulled or broken, take its platform's runtimes out of
the list first (a backend deploy), so nobody is sent to a build that isn't
there.
