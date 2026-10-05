# Releasing the mobile app

Merging to `main` ships nothing. Shawn decides when to release; an agent runs
the release with the `vera-release` skill and
`pnpm release <command>` (`scripts/release.ts`).

## Binaries, channels, and runtimes

| Binary           | App      | Built with                              | PDS             | Update channel | Who has it                                      |
| ---------------- | -------- | --------------------------------------- | --------------- | -------------- | ----------------------------------------------- |
| Store build      | Vera     | `production` (App Store signing)        | `vera.chat`     | `production`   | TestFlight (Team, Friends), later the App Store |
| Android APK      | Vera     | `production-apk` (EAS keystore)         | `vera.chat`     | `production`   | Android testers, by install link                |
| Internal build   | Vera Dev | `eas.json` `internal` (Release, ad hoc) | `dev.vera.chat` | `internal`     | Shawn's phone, for update and channel checks    |
| Android internal | Vera Dev | `internal` (APK)                        | `dev.vera.chat` | `internal`     | Shawn's Android phone, the same                 |
| Dev client       | Vera Dev | `development` (`scripts/phone.sh`)      | worktree's      | none           | Shawn's phones between releases                 |

Vera and Vera Dev are separate apps (`chat.vera.app`, `chat.vera.app.dev`;
see [apps/mobile/README.md](../apps/mobile/README.md#vera-dev)), so Shawn's
phone keeps the TestFlight app on production through a release test. Vera
Dev holds one binary at a time: an internal build replaces the dev client,
and Shawn reinstalls the dev client from its link (`scripts/phone.sh link`)
afterwards.

Android has no Play listing yet, so its testers install APKs from EAS links
([android.md](android.md)). Over-the-air updates reach them the same way:
`pnpm release ota production` publishes for every platform whose latest
production binary has the current runtime.

TestFlight and the App Store run the same binary: Apple promotes a TestFlight
build to the App Store, so there is one store profile and one production
channel.

Each binary accepts over-the-air updates (EAS Update, `expo-updates`) only
for its **runtime version**, which is the native fingerprint (`runtimeVersion:
{ policy: "fingerprint" }` in `app.config.ts`). The fingerprint covers native
code, native dependencies, config plugins, patches, and app config. Changing
any of them makes a new runtime that the old binaries can't run, and that
needs a new store build. Everything else (screens, logic, styles, assets) can
ship over the air.

What moves a platform's runtime: native dependencies, patches, config
plugins and their options, the notification service extension's Swift
(`plugins/notification-service`, added in `fingerprint.config.cjs`; it
counts for Android too) (a plugin's options count for both platforms, even
when they only affect one), and the shared parts of `app.config.ts`. The
other platform's section (`ios: {}` or `android: {}`) doesn't count, and
`apps/mobile/fingerprint.config.cjs` excludes `eas.json`, so editing build
profiles never strands installed binaries. Check before merging anything
native: `VERA_NOTIFICATION_EXTENSION=1 pnpm exec expo-updates fingerprint:generate --platform ios`
in `apps/mobile`, before and after. Vera Dev's runtime (internal builds) is
the same command with `APP_VARIANT=development`; `pnpm release` computes
each channel's own.

Fingerprints differ between macOS and Linux. Builds and updates both run on
Shawn's Mac, so they match. CI's "📱 Native Change" label compares the PR's
base and head on Linux, which is consistent within that one run.

## Release history in git

Every release is an annotated tag on the commit it shipped, with the runtime
in the message:

- `mobile/build/<n>`: iOS store build `n` uploaded to App Store Connect.
- `mobile/internal/<n>`: an iOS internal build.
- `mobile/android/build/<versionCode>` and `mobile/android/internal/<versionCode>`:
  the Android equivalents (production APK and internal APK).
- `mobile/ota/<channel>/<yyyymmddThhmmss>` (UTC): an update, with its EAS
  update group and, per platform, the runtime and the update ID the app
  shows in Settings → About (`ios-update:`, `android-update:`).
- `backend/deploy/<yyyymmddThhmmss>`: a production Convex deploy
  (`pnpm release backend production`).

"Changes since the last release" means the merges since the newest
`mobile/build/*`, `mobile/android/build/*`, or `mobile/ota/production/*` tag. `pnpm release plan` prints
them, whether the release can go over the air (current runtime equals the
last store build's), and whether the backend (including `pnpm-lock.yaml`)
changed since the last production deploy.

`mobile/build/5` (TestFlight build 5, the first one) predates `expo-updates`,
so the first release after it is a store build.

## The flow

[next-release.md](next-release.md) lists one-off steps the next release
needs beyond this flow (extra deploys, setup, checks after shipping). PRs
add them as they merge; the "Release steps" CI check makes every PR say
whether it has any. `pnpm release plan` prints them, production builds and
updates refuse to run until `--next-release-done` confirms them, and after
the release a PR removes the finished steps.

1. **Plan.** On an up-to-date `main`, run `pnpm release plan`. Write the
   release notes from the merged PRs and a test plan of what to try on the
   phone. Send both to Shawn.
2. **Test in the dev client.** Push `main`'s backend to the shared dev
   deployment (`pnpm release backend dev`), then serve `main` to Vera Dev
   on Shawn's phones (`scripts/phone.sh up`). This test is for features
   and rough edges: JavaScript fixes reach the phone without a build. The
   real app gets tested in TestFlight. An internal build or internal OTA is
   only for checking update or channel behavior, or when Shawn asks.
3. **Shawn tests** and approves, or asks for fixes (normal feature PRs, then
   back to step 1).
4. **Ship.**
   - If the backend changed, deploy it to production first
     (`pnpm release backend production`). Old app versions keep talking to
     it, so backend changes must stay compatible with them.
   - OTA: `pnpm release ota production "<notes>"`. TestFlight and App Store
     users get it on the next launch, Shawn included, so his check of the
     real app comes after it's out; a bad update is rolled back.
   - Store: `pnpm release build production` (release Xcode, uploads to App
     Store Connect), then `pnpm release testflight <build> <notes.md>`. The
     Team group gets the build at once; Friends get it after Beta App
     Review.
5. **App Store**, only when Shawn says so: `pnpm release appstore <build>`
   submits the TestFlight build for App Review. The first submission needs
   the store listing filled in first (see the skill).

## Versions

`version` in `app.config.ts` is the marketing version (0.1.0). Build numbers
increment on their own (EAS remote versioning, shared by internal and store
builds, counted separately for Vera and Vera Dev). Bump the version with a PR
after a version is released on the App Store, because Apple closes that
version to new builds. The runtime version is independent of both.
