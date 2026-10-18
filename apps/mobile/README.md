# @vera/mobile

The Vera iOS and Android app: Expo SDK 57, Expo Router with native tabs and
native stack headers, `@expo/ui` (SwiftUI and Jetpack Compose) for controls,
and Uniwind for everything else. Decisions are in
[docs/mobile-launch.md](../../docs/mobile-launch.md).

## Run it

There is no Expo Go build. `ios/` and `android/` are generated
(Continuous Native Generation) and gitignored.

```sh
pnpm --filter @vera/mobile ios      # build, install, and start Metro (iOS)
pnpm --filter @vera/mobile android  # same for Android
pnpm --filter @vera/mobile dev      # Metro only, for an installed dev build
```

These build and serve Vera itself (`chat.vera.app`); prefix them with
`APP_VARIANT=development` for Vera Dev. Agents use `scripts/sim.sh` and
`scripts/phone.sh` instead, which build and serve Vera Dev (below). Don't
edit `package.json` scripts to set it: the native fingerprint hashes them,
so Vera's runtime would change.

The passkey entitlement (`webcredentials:vera.chat`) makes `expo run:ios`
require an Apple Development signing identity, even for the simulator. Without
one, build for the simulator with local ("Sign to Run Locally") signing. Fully
unsigned builds lose their entitlements, and SecureStore then cannot reach the
keychain:

```sh
npx expo prebuild --platform ios
xcodebuild -workspace ios/Vera.xcworkspace -scheme Vera -configuration Debug \
  -sdk iphonesimulator -derivedDataPath ios/build CODE_SIGN_IDENTITY=- \
  CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=39K6A9FP99 \
  PROVISIONING_PROFILE_SPECIFIER= build
xcrun simctl install booted ios/build/Build/Products/Debug-iphonesimulator/Vera.app
```

On dev builds, sign a simulator in without typing (passkeys can't work
there) by opening `vera:///dev-sign-in?username=simtest` with
`xcrun simctl openurl <udid> <url>`; other screens open by deep link the same
way, such as `vera:///settings`.

Passkeys do not work on these builds: iOS only allows them for apps signed by
the team listed in `vera.chat`'s Apple app site association. Test sign-in on a
phone with Vera Dev (`scripts/phone.sh`).

## Vera Dev

`APP_VARIANT=development` (`app.config.ts`) builds **Vera Dev**: bundle ID
and package `chat.vera.app.dev`, name "Vera Dev", scheme `vera-dev`, the
amber icon (`assets/icons/vera-dev.icon`), and its own Firebase app
(`google-services.json` is Vera's, `google-services.dev.json` Vera Dev's).
It installs next to Vera, so Shawn's phone keeps the TestFlight or App Store
app on production while Vera Dev runs against the dev PDS. Every
development binary is Vera Dev (the simulator and phone dev clients and
internal builds); only store builds are Vera. Store fingerprints don't
depend on the variant: Vera's config is unchanged without `APP_VARIANT`.

The phone holds one Vera Dev at a time:

- **The dev client, day to day.** `scripts/phone.sh up` builds it (once per
  native fingerprint, cached in `~/Library/Caches/vera` for every worktree),
  starts the worktree's Metro, and prints its server address
  (`http://<Mac's Wi-Fi IP>:<port>`), an install link, and an open link. In
  Vera Dev, pick that server from the list (every running worktree's Metro
  shows up there by address), or use the open link
  (`vera-dev://expo-development-client/?url=...`). It
  loads the worktree's JavaScript over the local network, so the phone has to
  be on the same Wi-Fi as the Mac, and edits hot-reload. It's a plain IP, not
  a tailnet address: iOS's App Transport Security blocks plain HTTP to
  tailnet (100.x) addresses but allows local network ones. A worktree with an isolated backend serves
  that backend's domain, which starts with no accounts: sign in there with
  `vera-dev:///dev-sign-in?username=<name>`.
  Release testing uses it too, serving `main`.
- **Main's dev client is the one the phone keeps.** It runs every worktree
  that hasn't changed native code. `up` says whether a worktree uses it or
  needs its own (native changes); after testing one with its own,
  `scripts/phone.sh main` prints main's install link to put it back.
  `scripts/phone.sh list` shows every cached dev client and marks main's.
  Main's fingerprint comes from a checkout of `origin/main` kept in
  `~/Library/Caches/vera/main-checkout`.
- **An internal build, when asked for** (`pnpm release build internal`):
  Release JavaScript bundled in and the `internal` update channel, for
  checking update or channel behavior. Installing it replaces the dev
  client; Shawn reinstalls main's dev client from its link afterwards
  (`scripts/phone.sh main`).

Dev clients are Debug builds: slower, with the dev menu, and no update
channel. Real performance gets checked in TestFlight; updates and channels
on an internal build.

## EAS

Project `@directedbyshawn/vera`. Profiles in `eas.json`:

| Profile                 | App      | Use                                        | `EXPO_PUBLIC_VERA_DOMAIN` |
| ----------------------- | -------- | ------------------------------------------ | ------------------------- |
| `development`           | Vera Dev | Phone dev client (`scripts/phone.sh`)      | `dev.vera.chat`           |
| `development-simulator` | Vera Dev | Dev client for the iOS simulator (EAS)     | `dev.vera.chat`           |
| `internal`              | Vera Dev | Update and channel checks (`pnpm release`) | `dev.vera.chat`           |
| `production`            | Vera     | TestFlight and store builds                | `vera.chat`               |

Each profile has the update channel of the same name; releases (internal
builds, store builds, and over-the-air updates) go through `pnpm release`.
See [docs/releasing.md](../../docs/releasing.md).

Local runs default to `dev.vera.chat`; read the domain through `~/env`. A
worktree with an isolated backend (`scripts/backend.sh isolate`) sets its
own `<branch>.dev.vera.chat` in `apps/mobile/.env.local`.

## Simulator for agents

`scripts/sim.sh` gives each worktree its own simulator and Metro port, with
a Vera Dev dev client (built locally, no notification extension) cached per
native fingerprint, and navigates through the dev-only `globalThis.veraDev`
hook (`src/features/dev/automation.ts`) over Metro's debugger connection,
because iOS asks "Open in Vera?" before every `simctl openurl`. The
simulators and `scripts/phone.sh` share the worktree's Metro
(`scripts/lib/metro.sh`). The `vera-feature` skill covers both.

`sim.sh up` waits in the simulator queue (`scripts/simq.ts`) so a dozen
worktrees asking at once don't swamp the Mac. A small daemon, started on
first use and gone after ten idle minutes, admits one device at a time,
waits for each to launch and for memory to settle, and then admits the next
only if memory pressure is normal and free memory covers the device (iOS
3 GB, Android 4 GB) plus a reserve (15% of RAM, at least 4 GB). The first
device always gets in, so a small machine still works. When the head of the
line can't fit, it shuts down the device unused longest, if that's over 20
minutes. Tune any of this in `~/.config/vera/simq.json` (`reserveGb`,
`iosGb`, `androidGb`, `max`, `idleMinutes`); edits apply on the next check.
`scripts/sim.sh queue` shows the devices, the line, and why it's waiting;
the log is `~/Library/Caches/vera/simq/daemon.log`. `VERA_SIMQ=off` skips
the queue entirely.

Internal builds by hand (`pnpm release build internal` does this, plus the
runtime check, the upload, and the tag):

```sh
PATH="/opt/homebrew/bin:$PATH" eas build -p ios --profile internal --local \
  --non-interactive --output /tmp/vera-internal.ipa
scripts/install-page.sh /tmp/vera-internal.ipa internal/ios/manual "Internal build."   # install page
```

Install pages for Vera Dev live on bunny.net (`scripts/install-page.sh`),
not EAS: EAS's free plan caps uploads of local builds (it ran out on
2026-10-04). iOS installs them from an `itms-services` manifest, on the
devices in the ad hoc profile only; open the page in Safari. To keep the
bill small, each upload first deletes build folders over 30 days old
(`dev-client/`, `internal/`; PR evidence stays), and `scripts/phone.sh`
uploads a cached dev client again if its page was deleted.

(Local builds need fastlane from Homebrew ahead of any rbenv shim.)

### TestFlight

Store builds (`production`) must come from a release Xcode;
App Store Connect rejects builds from the default `Xcode-beta`. Build with
Xcode 27 (`/Applications/Xcode-27.app`), which keeps the iOS 27 detached
search tab (Xcode 26.5 builds compile the search tab patch out), then upload
with Apple's uploader, which reads the API key from `~/.appstoreconnect`:

```sh
source ~/.appstoreconnect/vera.env
DEVELOPER_DIR=/Applications/Xcode-27.app/Contents/Developer \
  PATH="/opt/homebrew/bin:$PATH" eas build -p ios --profile production --local \
  --non-interactive --output /tmp/vera-production.ipa
xcrun altool --upload-app -f /tmp/vera-production.ipa -t ios \
  --apiKey "$EXPO_ASC_KEY_ID" --apiIssuer "$EXPO_ASC_ISSUER_ID"
```

(`eas submit --non-interactive` refuses an API key from the environment.)
TestFlight groups: **Team** (internal, Shawn; every build, no review) and
**Friends** (external, public link `https://testflight.apple.com/join/CqpKDW25`;
each build goes through Beta App Review). Reviewers create their own
account; sign-up needs no code.

### Google Play

Android store builds (`production`, an app bundle) go to Google Play
internal testing. `pnpm release build production --android` builds one,
submits it with `eas submit` (track `internal`, from
`submit.production.android` in `eas.json`), and tags it. Testers are the
"Vera testers" list in Play Console (Test and release → Internal testing →
Testers). They join from the opt-in link
`https://play.google.com/apps/internaltest/4701256487800921587`, and
updates arrive through the Play Store. Play App Signing re-signs builds
with Google's key; its SHA-256 is in the passkey variables and
`assetlinks.json` ([docs/android.md](../../docs/android.md#passkeys)).

## UI rules

- Nothing pops in. Anything that loads (lists, conversations, screens,
  photos) shows nothing until it is ready and then fades in.
  `ScreenList`'s `ready` prop, the message list's `onLoad` fade, and
  `expo-image` transitions do this; new screens follow the same pattern.
- Liquid Glass never sits under a parent whose opacity is below 1: no fade,
  no `active:opacity-*`. iOS can't draw glass there, and a `GlassView` that
  misses its first draw or fades out with a parent can stay blank until it
  remounts. Fade the content inside the glass instead, and bring the glass
  in and out with `GlassSurface`'s `materialize` and `shown`, which use
  iOS's own glass animation.

## Message notifications

Message pushes (built by `@decentralized-convex/messages`, see its README)
have the sender as the title, the group or `Space #channel` as the subtitle,
and the message as the body. On iOS, the `NotificationService` Notification
Service Extension turns them into communication notifications, like
iMessage: the sender's photo (or an initials monogram on the app's gray
gradient) is the large icon with a small Vera badge, and iOS groups them by
conversation. Its source is `plugins/notification-service/`; the
`plugins/with-notification-service.cjs` config plugin adds the target during
prebuild, gives the app the Communication Notifications entitlement
(`com.apple.developer.usernotifications.communication`), lists
`INSendMessageIntent` in `NSUserActivityTypes`, and app.config.ts registers
`<bundle ID>.NotificationService` with EAS
(`extra.eas.build.experimental.ios.appExtensions`). If the extension fails or
runs out of time, iOS shows the plain push.

The extension ships in every EAS build: `eas.json` sets
`VERA_NOTIFICATION_EXTENSION=1` for each profile. Local prebuilds without the
flag leave it out. The App IDs `chat.vera.app` and `chat.vera.app.dev` have
Communication Notifications enabled. EAS holds ad hoc and App Store profiles
for `chat.vera.app` and `chat.vera.app.NotificationService`, and ad hoc
profiles for `chat.vera.app.dev` and `chat.vera.app.dev.NotificationService`
(Vera Dev).

## Apple credentials

EAS talks to Apple through an App Store Connect API key (team key "Vera EAS",
Admin), so credentials, builds, and TestFlight uploads need no Apple ID
login. The key lives outside the repo on Shawn's Mac:

```sh
source ~/.appstoreconnect/vera.env   # EXPO_ASC_* and EXPO_APPLE_TEAM_*
expect scripts/eas-credentials.exp internal   # or development, production
expect scripts/eas-credentials.exp development android
```

The script sets the dev variant for the `development` and `internal`
profiles and registers new App IDs. Its capability sync can report success
without changing anything (it did for `chat.vera.app.dev`): check an App ID
with `pnpm release asc GET '/v1/bundleIds?filter[identifier]=<id>&include=bundleIdCapabilities'`
and add missing ones with `POST /v1/bundleIdCapabilities`.

Push notifications on both apps use one APNs key, `VNH5HYJRA9`, kept in
Expo. If a bundle ID has no push key, Expo rejects every push to it with
`InvalidCredentials`. Vera Dev had none until 2026-10-05, so its pushes
never arrived and only the app's own in-app updates showed. `eas
credentials` asks for an Apple ID to attach an existing key; Expo's GraphQL
API doesn't (the session secret is in `~/.expo/state.json`):

```graphql
mutation {
  iosAppCredentials {
    setPushKey(id: "<iosAppCredentials id>", pushKeyId: "<push key id>") {
      id
    }
  }
}
```

Find both ids with `app { byFullName(fullName: "@directedbyshawn/vera") {
iosAppCredentials { id appleAppIdentifier { bundleIdentifier } pushKey { id
keyIdentifier } } } }`. To check a token end to end, send it a push through
`https://exp.host/--/api/v2/push/send` and read the receipt.

Two things the key cannot do, done once in the web UI instead: creating the
App Store Connect app record ("Vera Chat", Apple ID `6818656155`; "Vera" was
taken) and enabling Communication Notifications on an App ID (Apple's API
has no such capability type). After changing an App ID capability, delete
the `[expo]` profiles for it and rerun the script so the profiles include it.

### Local simulator build with the extension

```sh
VERA_NOTIFICATION_EXTENSION=1 npx expo prebuild --platform ios --clean
```

Then build with the `xcodebuild` command under "Run it"; its local signing
applies to both targets and keeps the communication entitlement.
`xcrun simctl push` skips service extensions, so it shows only the plain
notification. A real APNs push does run the extension on an Apple silicon
simulator: register the simulator's device token with Expo
(`getExpoPushTokenAsync`, or `POST https://exp.host/--/api/v2/push/getExpoPushToken`
with `development: true`) and send to that token through the Expo push API.

## Layout

- `src/app`: routes. `(auth)` holds welcome, create account, and sign in;
  `(app)/(tabs)` holds Home (the Inbox and Spaces pages), Activity,
  More (your accounts, Settings, Notifications, and About), and Search, each
  with its own native stack; conversations and
  the new-message sheet sit above the tabs.
- `src/features/settings/notification-settings.ts`: which pushes you get,
  set the same on every signed-in account's server.
- `src/features/activity`: the Activity tab (see `.plans/activity.md`). A
  row counts as seen once it has been entirely on screen, clear of the
  header and tab bar, for 1.1 seconds (`seen.ts`); a native safe-area
  probe gives that area, since the list scrolls under both bars on iOS.
- `src/features`: screen building blocks grouped by feature.
- `src/components`, `src/lib`: shared components and helpers.
  `lib/ui-modifiers` holds per-platform `@expo/ui` modifier presets.
- `src/features/session`: signed-in accounts (several at once, email-style;
  see `.plans/multi-account.md`). Each account keeps its own Better Auth
  (passkeys) session and federated PDS client, and all of them share one
  TanStack cache keyed by account. Passkey sign-up and sign-in are in
  `passkeys.ts`.
- `src/features/messaging`: TanStack hooks over the PDS `messages` and
  `accounts` plugins (inbox, messages with optimistic sends, spaces,
  profiles) and attachment uploads. `AccountScope` sets the account a screen
  acts as; the Inbox, Spaces, and Search combine every visible account.
- `src/features/profile` and `src/app/(app)/profile/[address].tsx`: a
  person's profile (photo, display name, address, and a Message button that
  opens the direct conversation as the `account` param). Search's people
  results, space members, and conversation members open it. It shows only
  what `accounts.getProfile` returns today; richer profile details will come
  from the Accounts plugin later.
- `src/features/conversation/conversation-header.tsx`: the conversation
  screen draws its own iMessage-style header (floating glass back and info
  buttons, the photo and a glass name capsule centered under the Dynamic
  Island) instead of a native bar, with messages scrolling underneath.
  Tapping it opens `conversation-info/[conversationId]` (members, Hide
  Alerts, leaving a group).
- `src/features/notifications`: Expo push registration and notification
  routing.
- `modules/open-in-app` (a local Expo module, autolinked from `modules/`):
  `src/lib/open-link.ts` opens a link in the installed app that claims it
  (Reddit, Instagram, X, a news app), with no list of apps: iOS opens it
  with `universalLinksOnly`, Android with `FLAG_ACTIVITY_REQUIRE_NON_BROWSER`
  (Android 11 and newer). When no app takes it, it opens in the in-app
  browser, as it does on builds from before the module.
- `plugins/with-ios-scene-lifecycle.cjs`: adopts the UIScene life cycle that
  the iOS 27 SDK requires. Expo SDK 58 does this in its template; remove the
  plugin when upgrading.
- `patches/react-native-screens@4.26.2.patch` (repo root, registered in the
  root `package.json` under `pnpm.patchedDependencies`): on iOS 27 and newer,
  react-native-screens still renders Expo Router's `role="search"` tab as an
  ordinary tab. The patch builds the tab bar from `UITab`s and makes the
  Search screen a `UISearchTab` set as the `prominentTabIdentifier`, so it
  sits apart from the other tabs with the field over the keyboard. Older iOS
  keeps the library's stock `setViewControllers` path.
  `src/features/search/native-search.ts` focuses the field when the tab is
  selected. Remove the patch file and the `patchedDependencies` entry once
  react-native-screens or Expo Router ships a working search tab on iOS 27,
  then run `pnpm install` and rebuild.
- `assets/icons`: the app icon, a top-down aloe vera made as a Liquid Glass
  Icon Composer document, and the flat Android and fallback images rendered
  from it, plus one alternate icon per color theme that people pick in
  More > Settings > App Icon (iOS), separately from the color theme. The splash
  screen has no logo, only the app's background color. See
  `assets/icons/README.md`.
