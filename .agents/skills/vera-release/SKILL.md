---
name: vera-release
description: Run a Vera mobile release end to end, covering changes since the last release, the interactions between them worth testing, a first pass of those tests in the iOS simulator and Android emulator, testing main on internal builds on Shawn's phones, then the over-the-air update or TestFlight store build, and an App Store submission when asked. Use when Shawn asks to release, ship, cut a build, push an update, put something on TestFlight, or submit to the App Store, or asks what changed since the last release.
---

# Releasing Vera

Read `docs/releasing.md` first; it explains channels, runtimes, and tags.

**Then read `docs/next-release.md`.** It lists one-off steps this release
needs beyond this skill, such as deploys `pnpm release` doesn't run, their
order, and checks after shipping. Do every step it lists, at the point it
says, and verify each one. A step you can't do blocks the release: tell
Shawn. Include its steps in the plan (step 1) and the report (step 4), and
after shipping open a PR that removes the finished ones.
Releases always come from `origin/main`, never from a feature branch.
Nothing reaches users without Shawn's explicit go-ahead at step 4.

Commands below run from the repo root unless noted. `pnpm release` is
`scripts/release.ts`. It reads Apple credentials from
`~/.appstoreconnect/vera.env` and needs no Apple login. EAS is logged in as
`directedbyshawn`.

## 0. Get onto main

Work in a clean checkout at `origin/main`. In a T3 worktree:

```sh
git fetch origin && git checkout --detach origin/main && pnpm install --frozen-lockfile
```

`pnpm release build` and `ota` refuse to run unless `HEAD` is `origin/main`
and the tree is clean.

## 1. Plan, run the test list yourself, and tell Shawn

```sh
pnpm release plan
gh pr view <n> --json title,body   # for each merged PR it lists
```

Each merged PR's description ends with a "Release notes" section (backend,
native change, deploy needed, breaking backend change); start from those,
together with `docs/next-release.md`. A merged PR labeled "💥 Breaking
Backend" (or `plan` saying BREAKING) means this release ships with
`--with-backend`, and open apps on older versions show "Updating Vera…" for
a few seconds; tell Shawn so he can time it.

Write up for Shawn:

- **Kind**, per platform, from `plan`:
  - over the air (`kind: ota`): the runtime version is unchanged, so the
    update reaches every binary on it;
  - native changes waiting: the runtime is unchanged, but merged native
    changes ("Native change: yes, compatible") reach people only in a
    store build. The update still goes out to everyone now; the store
    build is a separate release Shawn times (the same sitting, or later
    with more native work). Recommend one and say why;
  - store build required (`kind: store-build`): a merged PR raised the
    runtime ("yes, new runtime", labeled "⛔ New Runtime"), so the update
    reaches only the new build, and older binaries keep their last update
    until people install it.
- **Backend:** whether production needs `npx convex deploy`.
- **What's new:** a short list in his words, not PR titles. No internal
  refactors unless they change behavior.
- **What to test:** only what merging could have broken. Shawn already
  tested each change on his phone in its own worktree before it merged
  (the `vera-feature` skill), so don't list every change again, and don't
  list a regression pass: he uses the app a bit himself before shipping.
  Look for where the merged changes meet, and give him one ordered list of
  concrete steps for those spots, each saying which changes it covers and
  why it's at risk. Look at:
  - files, components, hooks, or screens that more than one change touched
    (`git log --format='%h %s' --name-only <last release tag>..origin/main`
    shows the overlap), especially shared ones such as the message bubble,
    the composer, lists, and navigation;
  - changes that touch the same flow from different ends (one changes how a
    message is sent, another how it's shown or notified);
  - changes that each assumed the old behavior of something another one
    changed;
  - a backend change paired with app changes that didn't test against it,
    and old app versions still talking to the new backend;
  - native changes: the store build has every native change together for
    the first time, so check each one there;
  - native changes waiting for a store build: the update also runs on
    binaries without them. Run main's JavaScript on a dev client built from
    the last store build's native code: check out its native files from
    the build's tag into the release checkout
    (`git checkout mobile/build/<n> -- <native paths>`), `scripts/sim.sh up`
    (it reuses a cached dev client for that fingerprint if one exists),
    check the screens those native changes touch, then
    `git checkout origin/main -- <native paths>`;
  - changes merged without a phone test (a PR Shawn approved from its
    evidence alone): those get their own steps.

  If nothing overlaps, say so; the list can be short or empty.

### Run the list yourself first

Before sending Shawn anything, run every step of that list yourself, in
this checkout's iOS simulator and its Android emulator (the
`vera-simulator` skill), against the dev PDS with `main`'s backend
(`pnpm release backend dev`). Sign in as the checkout's `wt…` user and
`scripts/sim.sh seed` for bots to talk to; a second account
(`scripts/sim.sh signin <name>`) or the dev bots play the other side of a
two-person step, and Developer tools (Server Answers, the seeds) set up
slow or offline states. Take a screenshot of each result, or a video for
motion, and upload them with `scripts/evidence.sh`.

Fix what fails before Shawn sees it (the same way as fixes in step 3) and
run that step again. `sim.sh down` each device when you're done with it.

Send Shawn the write-up with the list in two parts:

- **Checked:** each step you ran, on which platforms, what you saw, any
  fix, and its evidence.
- **For you:** only what the simulators can't settle, each with why: how
  motion and gestures feel on a real phone, real push notifications, the
  camera and photo library, a real network dropping, two physical phones
  at once, and anything you ran but couldn't judge.

Then go straight to step 2 unless he says otherwise.

## 2. Put main on his phones as internal builds

Shawn's last look at main before a release is on internal builds, not the
dev client. An internal build is a Release build with the JavaScript
bundled in, so launches, animations, and opening from a notification take
as long as they will in the app people get. A dev client is a Debug build
that loads its bundle from Metro: slower, and a notification open
sometimes waits on the bundle. Release tests on internal builds also give
Shawn a baseline, so slower load times in a later release test point at
the release, not at the dev client.

Internal builds run against the dev PDS, so push `main`'s backend there
first (this refuses to run from a worktree with an isolated backend). Then
build both, one after the other, from the release checkout (`HEAD` at
`origin/main`, clean tree, or they refuse):

```sh
pnpm release backend dev
pnpm release build internal             # iPhone
pnpm release build internal --android   # Android
```

They're local builds and take about 20 to 30 minutes for the pair. Start
them right after you send the step 1 write-up. Each prints an install
page. Send Shawn both, as Markdown list items labeled by phone:

```md
- [Install Vera Dev internal build 13 on iPhone](https://vera-evidence.b-cdn.net/internal/ios/13/index.html)
- [Install Vera Dev internal build 4 on Android](https://vera-evidence.b-cdn.net/internal/android/4/index.html)
```

Never put the links in backticks or send them bare. Each one replaces the
dev client in the Vera Dev slot and installs over it without an uninstall
(the Android APK has the dev clients' signing certificate, and the iOS ad
hoc build installs over the dev client too), so he stays signed in. Tell
him so.

Ask him to note how long the app takes to launch cold, to open a chat, and
to open from a notification. That's the baseline for the next release
test; put what he reports in the step 4 report.

## 3. Wait for Shawn

He tests the "For you" part of the list and either approves ("ship it",
"release it", "looks good, send it") or asks for fixes. He works through
the list at his own pace; don't send it again item by item.

Fixes found during the release test happen in the release thread, not new
T3 threads. Every fix lands on `main` first, and his final look is always
on an internal build running `main`:

- **Small JavaScript fixes.** Fix them in the release checkout, run
  the required validation, review the diff, commit, and push to `main`.
  Then publish them to his internal builds:

  ```sh
  git fetch origin && git checkout --detach origin/main
  pnpm release ota internal "<what the fix changes>"
  ```

  `ota internal` publishes on the `internal` channel for each platform
  whose latest internal build has the current runtime. Internal OTAs don't
  count as releases: `plan` compares against production tags only. Tell
  him to open Vera Dev; it restarts into the update within a few seconds.
- **Many or large fixes.** These get a PR each, following the
  `vera-feature` skill, and so does a fix that needs several rounds of
  feel on his phone (an animation, a gesture). The dev client is for
  that iteration: `phone.sh up` serves the PR's worktree and edits
  hot-reload. Subagents in their own worktrees can take independent
  fixes in parallel. For that round he installs a dev client over the
  internal build: main's from `scripts/phone.sh main`, or the PR's own
  from `phone.sh up` when it changed native code. Once the PRs merge, run
  `ota internal` from `origin/main` and send him the install pages from
  step 2 again. Reinstalling the internal build puts him back on bundled
  JavaScript, and the OTA brings the fixes. An install page stays up for
  30 days.
- **A fix that changes native code** needs new internal builds (step 2)
  after it merges. An OTA can't carry it.
- **A backend fix** goes to the dev PDS (`pnpm release backend dev`)
  before he retests.

Once the fixes are in, update the release notes and the list (step 1),
running new or changed steps in the simulators first. Don't ship without
an explicit approval of this release.

## 4. Ship

While `docs/next-release.md` lists steps, `pnpm release build production`
and `ota production` refuse to run until you add `--next-release-done`.
Only add it once every step that file puts before that command is done and
verified. The flag is your confirmation; don't use it to get past the check.

If `plan` says the backend changed, ship it with the update in one command:
it builds the update, deploys the backend (tagging `backend/deploy/<stamp>`,
which the next `plan` compares against), and publishes the update right
after, so open apps wait seconds for code that matches the new backend. If
`plan` says BREAKING, this is required: open older apps show "Updating
Vera…" from the moment the backend deploys until the update is out (see
`docs/releasing.md` → Breaking backend changes).

```sh
pnpm release ota production "<release notes, one paragraph>" --with-backend
```

A backend change with no app change deploys alone:
`pnpm release backend production`.

**Over the air:**

```sh
pnpm release ota production "<release notes, one paragraph>"
```

`ota` publishes for each platform whose latest production binary
(`mobile/build/*` for iOS, `mobile/android/build/*` for Android) has the
current runtime version (`RUNTIME_VERSION` in `app.config.ts`), and says
which it skipped. Every older binary on that runtime gets it too.

**OTA now, store build later.** When `plan` says native changes are
waiting but the runtime is unchanged, the update and the store build are
separate releases: ship the update, and the store build when Shawn wants
it, which needs no further OTA, since it carries the same JavaScript. Each
needs its own go-ahead.

Shawn's TestFlight app gets an OTA at the same moment as everyone else, so
his check of the real app happens after it's out. Tell him it's live and
ask him to open Vera, or switch back to it: it restarts into the update
within a few seconds of opening, and an app left open gets it within about a
minute, at a pause (see `docs/releasing.md` → When an update goes in). If something is wrong, roll back (below).

**Store build (iOS):**

```sh
pnpm release build production            # Xcode 27, App Store signing, uploads to App Store Connect
printf '%s\n' "<What to Test text>" > /tmp/whats-new.md
pnpm release testflight <build> /tmp/whats-new.md
```

`testflight` waits for processing, sets What to Test, adds the build to
Friends, and submits it for Beta App Review. It fails loudly if the
submission fails; don't tell Shawn Friends will get it unless it succeeded. The Team group (Shawn) gets
every build without review. Tell Shawn the build number and that Friends
will see it after Apple's review, usually within a day.

**Android build** (when `plan` says Android needs one): testers get it
through Google Play internal testing:

```sh
pnpm release build production --android   # app bundle (production profile), submitted to Play's internal track
```

It checks the bundle's runtime, submits it with `eas submit` (track
`internal`, release status `completed`, the service account key at
`~/.config/vera/play-service-account.json`), and tags it. Testers get it
from the Play Store with no review; there is no link to send. A new tester
joins from the opt-in link
`https://play.google.com/apps/internaltest/4701256487800921587` once Shawn
adds their Google account to the "Vera testers" list (Play Console → Test
and release → Internal testing → Testers). Internal Android builds for
Shawn: `pnpm release build internal --android`.

Every command tags the release (`mobile/build/<n>`,
`mobile/android/build/<versionCode>`, `mobile/ota/production/...`) and pushes
the tag.

Then give him main's dev clients back, for feature work:

```sh
scripts/phone.sh main             # iPhone
scripts/phone.sh --android main   # Android
```

Report what shipped, the tag, anything that didn't work, the load times
he noted on the internal builds (step 2), and both install links as
Markdown list items labeled by phone. Installing them replaces the
internal builds in the Vera Dev slot.

Then make sure the people who reported what shipped hear about it. Bug
reports Vera filed itself (GitHub issues labeled "user report")
tell their reporters on their own: a cron checks every 10 minutes whether
each fix's commit is in the newest production tags. Run it right away so
they hear now: `npx convex run supportReports:track --prod` (from
`services/backend`). For a released PR whose description has a "Support
reports" section listing conversations instead (reports from before
Vera filed issues), send each one the "fixed" message from the
`support-inbox` skill. Do it after the production OTA or store build is
out, never after only the internal build.

## 5. App Store (only when Shawn asks)

```sh
pnpm release appstore <build>
```

This attaches the build to the App Store version for `app.config.ts`'s
`version` and submits it for review. It fails until the store listing is
complete. **The first submission** needs, in App Store Connect (app "Vera
Chat", Apple ID 6818656155):

- Description, keywords, support URL, and marketing URL
  (`appStoreVersionLocalizations`), and the subtitle and privacy policy URL
  (`appInfoLocalizations`).
- Screenshots for the 6.9" iPhone (and iPad, since `supportsTablet` is on).
  Capture them in a simulator with production-like seeded data (the
  `vera-simulator` skill).
- Category, age rating (`ageRatingDeclarations`), price (free), and
  availability.
- App Privacy answers. The API can't set these, so use Codex in the web UI.
- The review contact and notes. Reviewers create their own account (sign-up
  needs no code).

Use `pnpm release asc <METHOD> <path> [json]` for API calls. Use
`codex exec -m gpt-6.1-sol -s danger-full-access "<task>" < /dev/null` only
for what the API can't do, and tell Shawn first, because it drives his
signed-in Chrome. Draft the listing copy and screenshots, then get his
approval before submitting. After Apple releases a version, open a PR that
bumps `version` in `app.config.ts`.

## Verifying an update reached people

After `ota production`:

- Ask the update server what a binary's runtime gets (the tag lists each
  platform's runtime and update ID). It should return that update's ID,
  and 204 for any other runtime:

  ```sh
  curl -s https://u.expo.dev/5680db13-57a8-4b74-ae41-1f52abbda0b1 \
    -H "expo-platform: ios" -H "expo-runtime-version: <ios-runtime>" \
    -H "expo-channel-name: production" -H "expo-protocol-version: 1" \
    -H "accept: multipart/mixed" | grep -oE '"id":"[^"]+"' | head -1
  ```

- On a device, More → About shows the running update's ID once the app
  restarts into it as it opens (on a slow connection, at the open after).
  Without a signed-in Vera account,
  open the Play build twice on an Android device or emulator connected to
  `adb` (installing it needs a Google account on the "Vera testers" list),
  and read
  `adb logcat | grep dev.expo.updates`: the first launch logs
  "DownloadComplete" and "NEW_UPDATE_LOADED", the second "No update
  available".

## Rolling back

- A bad OTA: republish the previous good group to the channel:
  `cd apps/mobile && eas update:republish --group <previous group id> --destination-channel production`
  (find group ids in the `mobile/ota/production/*` tag messages), or
  `eas update:roll-back-to-embedded --channel production --runtime-version <runtime>`.
- A bad store build: remove it from Friends in App Store Connect, fix the
  problem, and ship a new build. Store builds can't be recalled.

## Gotchas

- `eas build --local` needs fastlane from Homebrew first on `PATH`.
  `pnpm release build` sets that up, and builds both kinds with
  `/Applications/Xcode-27.app` (App Store Connect rejects Xcode-beta builds,
  error 90534), so the test build matches what ships. It also checks the
  built runtime against `app.config.ts`'s runtime version before
  uploading, and records the native fingerprint in the tag.
- Build numbers come from EAS (remote, auto-incremented), counted per app:
  Vera Dev's internal builds and Vera's store builds each have their own
  sequence, and their tags (`mobile/internal/*`, `mobile/build/*`) never
  mix.
- Internal builds and internal OTAs use the dev variant
  (`APP_VARIANT=development`), so their fingerprint differs from the store
  build's. Their runtime version is the same; channels keep the updates
  apart.
- Uploads go through `xcrun altool`, because `eas submit --non-interactive`
  refuses an API key from the environment.
- `ota` sets `VERA_NOTIFICATION_EXTENSION=1` and the channel's
  `EXPO_PUBLIC_VERA_DOMAIN` (and `APP_VARIANT` for internal). Without the first the runtime doesn't match the
  store build; without the second the update points at the wrong PDS. Don't
  run `eas update` by hand.
- Play builds are signed with Google's Play App Signing key, not the EAS
  keystore (that one is only the upload key). Its SHA-256 is in
  `PASSKEY_ANDROID_CERT_SHA256` and `PASSKEY_ORIGINS` on both deployments
  and in `assetlinks.json`. If passkeys or invite links fail only on Play
  builds, check those first (`docs/android.md` → Passkeys).
- Signing problems: `expect apps/mobile/scripts/eas-credentials.exp production`
  with `source ~/.appstoreconnect/vera.env`; see `apps/mobile/README.md`.
