# Releasing the mobile app

Merging to `main` ships nothing. Shawn decides when to release; an agent runs
the release with the `vera-release` skill and
`pnpm release <command>` (`scripts/release.ts`).

## Binaries, channels, and runtimes

| Binary           | Built with                              | PDS             | Update channel | Who has it                                      |
| ---------------- | --------------------------------------- | --------------- | -------------- | ----------------------------------------------- |
| Internal build   | `eas.json` `internal` (Release, ad hoc) | `dev.vera.chat` | `internal`     | Shawn's phone, by install link                  |
| Store build      | `production` (App Store signing)        | `vera.chat`     | `production`   | TestFlight (Team, Friends), later the App Store |
| Android APK      | `production-apk` (EAS keystore)         | `vera.chat`     | `production`   | Android testers, by install link                |
| Android internal | `internal` (APK)                        | `dev.vera.chat` | `internal`     | Shawn's Android testing                         |

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
plugins and their options (a plugin's options count for both platforms, even
when they only affect one), and the shared parts of `app.config.ts`. The
other platform's section (`ios: {}` or `android: {}`) doesn't count, and
`apps/mobile/fingerprint.config.cjs` excludes `eas.json`, so editing build
profiles never strands installed binaries. Check before merging anything
native: `VERA_NOTIFICATION_EXTENSION=1 pnpm exec expo-updates fingerprint:generate --platform ios`
in `apps/mobile`, before and after.

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

1. **Plan.** On an up-to-date `main`, run `pnpm release plan`. Write the
   release notes from the merged PRs and a test plan of what to try on the
   phone. Send both to Shawn.
2. **Test build.** Push `main`'s backend to the shared dev deployment
   (`pnpm release backend dev`). Then:
   - OTA release: if the latest internal build has the current runtime,
     publish to the `internal` channel. Otherwise make an internal build.
   - Store release: make an internal build (`pnpm release build internal`)
     and send the install link.
3. **Shawn tests** and approves, or asks for fixes (normal feature PRs, then
   back to step 1).
4. **Ship.**
   - If the backend changed, deploy it to production first
     (`pnpm release backend production`). Old app versions keep talking to
     it, so backend changes must stay compatible with them.
   - OTA: `pnpm release ota production "<notes>"`. TestFlight and App Store
     users get it on the next launch.
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
builds). Internal builds use the same bundle ID, so installing one replaces
the TestFlight app on that phone. Bump the version with a PR
after a version is released on the App Store, because Apple closes that
version to new builds. The runtime version is independent of both.
