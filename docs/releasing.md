# Releasing the mobile app

Merging to `main` ships nothing. The one exception is the shared dev
deployment (`dev.vera.chat`): a PR that changed the backend pushes main's
backend there right after it merges (`pnpm release backend dev`; see
AGENTS.md → Feature workflow). Shawn decides when to release; an agent runs
the release with the `vera-release` skill and
`pnpm release <command>` (`scripts/release.ts`).

## Binaries, channels, and runtimes

| Binary           | App      | Built with                              | PDS             | Update channel | Who has it                                      |
| ---------------- | -------- | --------------------------------------- | --------------- | -------------- | ----------------------------------------------- |
| Store build      | Vera     | `production` (App Store signing)        | `vera.chat`     | `production`   | TestFlight (Team, Friends), later the App Store |
| Play build       | Vera     | `production` (app bundle, Play signing) | `vera.chat`     | `production`   | Play internal testing ("Vera testers")          |
| Private preview  | Vera     | `preview` (ad hoc iOS, signed APK)      | `vera.chat`     | `preview`      | Shawn only, installed from an install page     |
| Internal build   | Vera Dev | `eas.json` `internal` (Release, ad hoc) | `dev.vera.chat` | `internal`     | Shawn's phone, for update and channel checks    |
| Android internal | Vera Dev | `internal` (APK)                        | `dev.vera.chat` | `internal`     | Shawn's Android phone, the same                 |
| Dev client       | Vera Dev | `development` (`scripts/phone.sh`)      | worktree's      | none           | Shawn's phones between releases                 |

Vera and Vera Dev are separate apps (`chat.vera.app`, `chat.vera.app.dev`;
see [apps/mobile/README.md](../apps/mobile/README.md#vera-dev)), so Shawn's
phone keeps the TestFlight app on production through a release test. Vera
Dev holds one binary at a time: an internal build replaces the dev client,
and Shawn reinstalls main's dev client from its link (`scripts/phone.sh main`)
afterwards.

Android testers use Google Play internal testing
([android.md](android.md#getting-builds-to-android-testers)). They join
from the opt-in link after Shawn adds them to the "Vera testers" list in
Play Console (Test and release → Internal testing → Testers), and new
builds arrive through the Play Store. Over-the-air updates reach them too:
`pnpm release ota production` publishes for every platform whose latest
production binary has the current runtime. Play re-signs builds with
Google's key, whose SHA-256 is in the passkey variables and
`assetlinks.json`.

TestFlight and the App Store run the same binary: Apple promotes a TestFlight
build to the App Store, so there is one store profile and one production
channel.

Private production tests use `eas build --local --profile preview`, then
`scripts/install-page.sh` with its fourth argument `production`, so its
page names Vera and explains the replacement. This profile inherits
production configuration,
uses an empty, separate preview update channel, and submits to no store.
It can build the integration branch before Shawn approves merging it.
The native-list switch defaults on in that channel and is available under
Testing in conversation info and More → About.

The iOS preview uses the production bundle ID and signing team. Install it
over TestFlight without deleting Vera to keep its app data and keychain;
reinstall from TestFlight to return. Android's APK uses EAS's production
key, while Play uses Google's key, so switching in either direction needs
uninstalling Vera and signing in again. Check the APK certificate against
the live passkey and invite-link association files before distributing it.

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

### When an update goes in

The app checks for an update on every launch, every return from the
background, and every minute in the foreground, and downloads it without
showing anything (`apps/mobile/src/features/updates`). Then it restarts into
it behind a splash-colored screen and reopens on the screen it was on:

- at once, if the update is ready within about 3 seconds of opening;
- otherwise at the first quiet moment: 10 seconds with no touches, the
  keyboard down, and no photo or video open. Someone typing, scrolling, or
  watching a video is never interrupted; someone reading sees a blink.

It never restarts while a message is sending or failed, or a change is still
on its way to a server, since a restart would lose them. A launch always
starts on the newest downloaded update. So within about a minute of an
update going out, every open app has it.

### Breaking backend changes

A backend change should keep working with the app before it (new fields
optional, old requests still accepted), because open apps run the old code
against it until their update lands. When one can't, its PR raises
`BREAKING_VERSION` in `services/backend/breaking-version.ts` by one. The
backend serves that number as a live query (`release.breakingVersion`), and
the app compiles in the number it was built with. The moment a deploy with
a higher number goes live, every open older app covers the screen with
"Updating Vera…", looks for its update every 2 seconds, and restarts into
it as soon as it's downloaded, whatever the person was doing. If no update
comes within 3 minutes (a binary too old for any over-the-air update), the
cover says to get the new version from TestFlight or the Play Store. Dev
clients only log a warning, since they can't update themselves and every
worktree shares the dev PDS; a worktree behind on it merges main.

So the update has to be out seconds after the deploy:
`pnpm release ota production "<notes>" --with-backend` builds the update,
deploys the backend, and publishes the update straight after, about 15–20
seconds of "Updating Vera…" for anyone in the app. `pnpm release plan`
says when the number went up.

## Release history in git

Every release is an annotated tag on the commit it shipped, with the runtime
in the message:

- `mobile/build/<n>`: iOS store build `n` uploaded to App Store Connect.
- `mobile/internal/<n>`: an iOS internal build.
- `mobile/android/build/<versionCode>` and `mobile/android/internal/<versionCode>`:
  the Android equivalents (Play build and internal APK). Builds 3 and 4
  were production APKs; Play builds start at 5.
- `mobile/ota/<channel>/<yyyymmddThhmmss>` (UTC): an update, with its EAS
  update group and, per platform, the runtime and the update ID the app
  shows in More → About (`ios-update:`, `android-update:`).
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
   release notes from the merged PRs. Each change was already tested on
   Shawn's phone in its worktree before it merged, so the test list covers
   only what merging could have broken: places where the changes overlap
   or interact (shared files and screens, the same flow from two ends,
   backend changes against the app and against old app versions, native
   changes together in one store build). The agent runs that list itself
   first, in the iOS simulator and Android emulator, and fixes what fails.
   Then it sends Shawn the notes, what it checked (with evidence), and the
   steps left for him: what a simulator can't settle.
2. **Test in the dev client.** Push `main`'s backend to the shared dev
   deployment (`pnpm release backend dev`; usually already current, since
   backend PRs push it when they merge), then serve `main` to Vera Dev
   on Shawn's phones (`scripts/phone.sh up`). This test is for how the
   changes work together: JavaScript fixes reach the phone without a build. The
   real app gets tested in TestFlight. An internal build or internal OTA is
   only for checking update or channel behavior, or when Shawn asks.
3. **Shawn tests** the steps left for him, plus his own quick use of the
   app, and approves, or asks for fixes (straight to `main` when small, feature PRs
   when not, then back to step 1).
4. **Ship.**
   - If the backend changed, ship it together with the app:
     `pnpm release ota production "<notes>" --with-backend` deploys it
     between building and publishing the update, so open apps wait seconds
     for code that matches it. Old app versions keep talking to it, so
     backend changes must stay compatible with them, or raise the breaking
     version (above). With no app changes,
     `pnpm release backend production` deploys it alone.
   - OTA: `pnpm release ota production "<notes>"`. TestFlight and App Store
     users get it the next time they open the app, Shawn included, so his
     check of the real app comes after it's out; a bad update is rolled
     back.
   - Store: `pnpm release build production` (release Xcode, uploads to App
     Store Connect), then `pnpm release testflight <build> <notes.md>`. The
     Team group gets the build at once; Friends get it after Beta App
     Review. On Android, `pnpm release build production --android` builds
     an app bundle and submits it to Play internal testing, where testers
     get it with no review.
5. **App Store**, only when Shawn says so: `pnpm release appstore <build>`
   submits the TestFlight build for App Review. The first submission needs
   the store listing filled in first (see the skill).

## Versions

`version` in `app.config.ts` is the marketing version (0.1.0). Build numbers
increment on their own (EAS remote versioning, shared by internal and store
builds, counted separately for Vera and Vera Dev). Bump the version with a PR
after a version is released on the App Store, because Apple closes that
version to new builds. The runtime version is independent of both.
