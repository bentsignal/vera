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
one, build unsigned for the simulator:

```sh
npx expo prebuild --platform ios
xcodebuild -workspace ios/Vera.xcworkspace -scheme Vera -configuration Debug \
  -sdk iphonesimulator -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO build
xcrun simctl install booted ios/build/Build/Products/Debug-iphonesimulator/Vera.app
```

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
  `(app)/(tabs)` holds Chats, Spaces, and Settings, each with its own native
  stack; conversations and the new-message sheet sit above the tabs.
- `src/features`: screen building blocks grouped by feature.
- `src/components`, `src/lib`: shared components and helpers.
  `lib/ui-modifiers` holds per-platform `@expo/ui` modifier presets.
- `src/mock`: placeholder data and the fake session. Delete it as real data
  from the PDS replaces each piece.
- `plugins/with-ios-scene-lifecycle.ts`: adopts the UIScene life cycle that
  the iOS 27 SDK requires. Expo SDK 58 does this in its template; remove the
  plugin when upgrading.
