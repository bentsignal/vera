---
name: vera-release
description: Run a Vera mobile release end to end, covering changes since the last release, a test plan, an internal test build or OTA for Shawn, then the over-the-air update or TestFlight store build, and an App Store submission when asked. Use when Shawn asks to release, ship, cut a build, push an update, put something on TestFlight, or submit to the App Store, or asks what changed since the last release.
---

# Releasing Vera

Read `docs/releasing.md` first; it explains channels, runtimes, and tags.
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

## 2. Put a test build on his phone

The test build runs against the dev PDS, so update it to `main` first:

```sh
(cd services/backend && npx convex dev --once)   # shared dev deployment, from main
```

- **OTA release, internal build current** (`plan` says "matches"):

  ```sh
  pnpm release ota internal "<one-line summary>"
  ```

  Tell Shawn to open the internal build, then close and reopen it to load the
  update.

- **Otherwise** (store release, or the internal build is stale):

  ```sh
  pnpm release build internal     # ~15 min; prints the install link
  ```

  Send him the link (it's the "development build" he knows).

## 3. Wait for Shawn

He tests and either approves ("ship it", "release it", "looks good, send
it") or asks for fixes. Fixes are ordinary feature PRs (the `vera-feature`
skill). After they merge, start again at step 1. Don't ship without an
explicit approval of this release.

## 4. Ship

If the backend changed, deploy it before the app:

```sh
(cd services/backend && npx convex deploy --yes)
```

**Over the air:**

```sh
pnpm release ota production "<release notes, one paragraph>"
```

**Store build:**

```sh
pnpm release build production            # Xcode 27, App Store signing, uploads to App Store Connect
printf '%s\n' "<What to Test text>" > /tmp/whats-new.md
pnpm release testflight <build> /tmp/whats-new.md
```

`testflight` waits for processing, sets What to Test, adds the build to
Friends, and submits it for Beta App Review. The Team group (Shawn) gets
every build without review. Tell Shawn the build number and that Friends
will see it after Apple's review, usually within a day.

Both commands tag the release (`mobile/build/<n>`, `mobile/ota/production/...`)
and push the tag. Report what shipped, the tag, and anything that didn't
work.

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
  Capture them in a simulator with production-like seeded data.
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

## Rolling back

- A bad OTA: republish the previous good group to the channel:
  `cd apps/mobile && eas update:republish --group <previous group id> --destination-channel production`
  (find group ids in the `mobile/ota/production/*` tag messages), or
  `eas update:roll-back-to-embedded --channel production --runtime-version <runtime>`.
- A bad store build: remove it from Friends in App Store Connect, fix the
  problem, and ship a new build. Store builds can't be recalled.

## Gotchas

- `eas build --local` needs fastlane from Homebrew first on `PATH`.
  `pnpm release build` sets that up. Store builds must use
  `/Applications/Xcode-27.app` (App Store Connect rejects Xcode-beta builds,
  error 90534). The script sets `DEVELOPER_DIR`.
- Uploads go through `xcrun altool`, because `eas submit --non-interactive`
  refuses an API key from the environment.
- `ota` sets `VERA_NOTIFICATION_EXTENSION=1` and the channel's
  `EXPO_PUBLIC_VERA_DOMAIN`. Without the first the runtime doesn't match the
  store build; without the second the update points at the wrong PDS. Don't
  run `eas update` by hand.
- Signing problems: `expect apps/mobile/scripts/eas-credentials.exp production`
  with `source ~/.appstoreconnect/vera.env`; see `apps/mobile/README.md`.
