---
name: vera-release
description: Run a Vera mobile release end to end, covering changes since the last release, a test plan, testing main in the Vera Dev dev client on Shawn's phone, then the over-the-air update or TestFlight store build, and an App Store submission when asked. Use when Shawn asks to release, ship, cut a build, push an update, put something on TestFlight, or submit to the App Store, or asks what changed since the last release.
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

## 1. Plan and tell Shawn

```sh
pnpm release plan
gh pr view <n> --json title,body   # for each merged PR it lists
```

Each merged PR's description ends with a "Release notes" section (backend,
native change, deploy needed); start from those, together with
`docs/next-release.md`.

Send Shawn:

- **Kind:** over the air (`kind: ota`) or a store build (`kind: store-build`),
  and why.
- **Backend:** whether production needs `npx convex deploy`.
- **What's new:** a short list in his words, not PR titles. No internal
  refactors unless they change behavior.
- **What to test:** concrete steps on the phone for each change, plus a quick
  regression pass (sign in, open a chat, send a message and a photo, react,
  notifications).

Then go straight to step 2 unless he says otherwise.

## 2. Put main on his phone in the dev client

The release test checks that the features work together and smooths out
rough edges, so it runs in the Vera Dev dev client, where JavaScript fixes
reach his phone without a build. The real app gets tested in TestFlight
(step 4). The dev client runs against the dev PDS, so update it to `main`
first. This refuses to run from a worktree with an isolated backend:

```sh
pnpm release backend dev
scripts/phone.sh up             # and again with --android for his Android phone
```

Run `phone.sh up` from the release checkout (detached at `origin/main`, no
isolated backend). It builds a dev client only when `main`'s native
fingerprint has none yet (about 15 minutes); otherwise Shawn just opens the
link. Send the open link and QR code, plus the install link when he needs
one, as `phone.sh` prints them.

Make an internal build (`pnpm release build internal`, `--android`) or an
internal OTA (`pnpm release ota internal "<summary>"`) only when Shawn asks
for one by name, or when the release changes update or channel behavior,
which a dev client can't show. Installing one replaces the dev client in the
Vera Dev slot; he reinstalls it from `scripts/phone.sh link`.

## 3. Wait for Shawn

He tests and either approves ("ship it", "release it", "looks good, send
it") or asks for fixes. Fixes are ordinary feature PRs (the `vera-feature`
skill); he can try one before it merges with `phone.sh up` from the fix's
worktree. After they merge, update the release checkout to `origin/main`
(Metro hot-reloads it) and start again at step 1. Don't ship without an
explicit approval of this release. `scripts/phone.sh down` once he's done.

## 4. Ship

While `docs/next-release.md` lists steps, `pnpm release build production`
and `ota production` refuse to run until you add `--next-release-done`.
Only add it once every step that file puts before that command is done and
verified. The flag is your confirmation; don't use it to get past the check.

If `plan` says the backend changed, deploy it before the app. This tags
`backend/deploy/<stamp>`, which the next `plan` compares against:

```sh
pnpm release backend production
```

**Over the air:**

```sh
pnpm release ota production "<release notes, one paragraph>"
```

`ota` publishes for each platform whose latest production binary
(`mobile/build/*` for iOS, `mobile/android/build/*` for Android) has the
current runtime, and says which it skipped.

Shawn's TestFlight app gets an OTA at the same moment as everyone else, so
his check of the real app happens after it's out. Tell him it's live and
ask him to open Vera twice (download, then run); if something is wrong,
roll back (below).

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

**Android build** (when `plan` says Android needs one): until Play internal
testing exists, testers install a production APK from an EAS link:

```sh
pnpm release build production --android   # production-apk profile, vera.chat; prints the install link
```

Send the link to the Android testers (Shawn forwards it). Internal Android
builds for Shawn: `pnpm release build internal --android`.

Every command tags the release (`mobile/build/<n>`,
`mobile/android/build/<versionCode>`, `mobile/ota/production/...`) and pushes
the tag. Report what shipped, the tag, and anything that didn't
work.

Then tell the people who reported what shipped: for each released PR whose
description has a "Support reports" section, send each listed conversation
the "fixed" message from the `support-inbox` skill. Do it after the
production OTA or store build is out, never after only the internal build.

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
- The review contact and notes, with the "Apple App Review" invite code from
  the `invite-codes` skill.

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

- On a device, Settings → About shows the running update's ID after the app
  is opened twice (download, then run). Without a signed-in account, install
  the production APK on a throwaway emulator, open it twice, and read
  `adb logcat | grep dev.expo.updates`: the first launch logs
  "DownloadComplete" and "NEW_UPDATE_LOADED", the second "No update
  available". Delete the emulator afterwards.

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
  built runtime against the checkout's fingerprint before uploading.
- Build numbers come from EAS (remote, auto-incremented), counted per app:
  Vera Dev's internal builds and Vera's store builds each have their own
  sequence, and their tags (`mobile/internal/*`, `mobile/build/*`) never
  mix.
- Internal builds and internal OTAs use the dev variant
  (`APP_VARIANT=development`), so their runtime differs from the store
  build's. `pnpm release` handles it; `plan` compares each channel against
  its own fingerprint.
- Uploads go through `xcrun altool`, because `eas submit --non-interactive`
  refuses an API key from the environment.
- `ota` sets `VERA_NOTIFICATION_EXTENSION=1` and the channel's
  `EXPO_PUBLIC_VERA_DOMAIN` (and `APP_VARIANT` for internal). Without the first the runtime doesn't match the
  store build; without the second the update points at the wrong PDS. Don't
  run `eas update` by hand.
- Signing problems: `expect apps/mobile/scripts/eas-credentials.exp production`
  with `source ~/.appstoreconnect/vera.env`; see `apps/mobile/README.md`.
