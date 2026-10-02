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
device with an EAS development build.

## EAS

Project `@directedbyshawn/vera`. Profiles in `eas.json`:

| Profile                 | Use                                  | `EXPO_PUBLIC_VERA_DOMAIN` |
| ----------------------- | ------------------------------------ | ------------------------- |
| `development`           | Dev client, only when asked for one  | `dev.vera.chat`           |
| `development-simulator` | Dev client for the iOS simulator     | `dev.vera.chat`           |
| `internal`              | Shawn's "development build"          | `dev.vera.chat`           |
| `preview`               | TestFlight and Play internal testing | `vera.chat`               |
| `production`            | Store builds                         | `vera.chat`               |

Local runs default to `dev.vera.chat`; read the domain through `~/env`.

Shawn tests changes on standalone `internal` builds: Release JavaScript
bundled into the app (real performance, no dev server) against the dev PDS,
so dev tools stay on. Build locally and install over the network or with the
EAS link:

```sh
PATH="/opt/homebrew/bin:$PATH" eas build -p ios --profile internal --local \
  --non-interactive --output /tmp/vera-internal.ipa
eas upload -p ios --build-path /tmp/vera-internal.ipa   # shareable link
```

(Local builds need fastlane from Homebrew ahead of any rbenv shim.)

## UI rules

- Nothing pops in. Anything that loads (lists, conversations, screens,
  photos) shows nothing until it is ready and then fades in.
  `ScreenList`'s `ready` prop, the message list's `onLoad` fade, and
  `expo-image` transitions do this; new screens follow the same pattern.

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
`chat.vera.app.NotificationService` with EAS
(`extra.eas.build.experimental.ios.appExtensions`). If the extension fails or
runs out of time, iOS shows the plain push.

The extension ships in every EAS build: `eas.json` sets
`VERA_NOTIFICATION_EXTENSION=1` for each profile. Local prebuilds without the
flag leave it out. The App ID `chat.vera.app` has Communication Notifications
enabled, and EAS holds ad hoc and App Store profiles for both
`chat.vera.app` and `chat.vera.app.NotificationService`.

## Apple credentials

EAS talks to Apple through an App Store Connect API key (team key "Vera EAS",
Admin), so credentials, builds, and TestFlight uploads need no Apple ID
login. The key lives outside the repo on Shawn's Mac:

```sh
source ~/.appstoreconnect/vera.env   # EXPO_ASC_* and EXPO_APPLE_TEAM_*
expect scripts/eas-credentials.exp internal   # or preview
```

Two things the key cannot do, done once in the web UI instead: creating the
App Store Connect app record ("Vera Chat", Apple ID `6818656155`; "Vera" was
taken) and enabling Communication Notifications on the App ID (Apple's API
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
  `(app)/(tabs)` holds Chats, Spaces, Settings, and Search, each with its own
  native stack; conversations and the new-message sheet sit above the tabs.
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
  acts as; Chats, Spaces, and Search combine every visible account.
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
  from it. The splash screen has no logo, only the app's background color. Color themes don't change the icon. See
  `assets/icons/README.md`.
