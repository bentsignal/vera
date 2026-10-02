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

Passkeys do not work on these builds: iOS only allows them for apps signed by
the team listed in `vera.chat`'s Apple app site association. Test sign-in on a
device with an EAS development build.

## EAS

Project `@directedbyshawn/vera`. Profiles in `eas.json`:

| Profile                 | Use                                  | `EXPO_PUBLIC_VERA_DOMAIN` |
| ----------------------- | ------------------------------------ | ------------------------- |
| `development`           | Dev client on Shawn's phone          | `dev.vera.chat`           |
| `development-simulator` | Dev client for the iOS simulator     | `dev.vera.chat`           |
| `preview`               | TestFlight and Play internal testing | `vera.chat`               |
| `production`            | Store builds                         | `vera.chat`               |

Local runs default to `dev.vera.chat`; read the domain through `~/env`.

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
- `assets/icons` and `plugins/with-alternate-icons.cjs`: one Liquid Glass
  Icon Composer icon per color theme. Indigo is the primary icon; the rest
  are iOS alternate icons chosen in Settings. See `assets/icons/README.md`.
